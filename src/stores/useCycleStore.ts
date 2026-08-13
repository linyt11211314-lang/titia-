import { create } from 'zustand'
import { cycleRepo } from '../db/repos'
import type { CycleEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 生理周期 store（/cycle）
// 记录开始/结束日期，预测下次开始（基于历史平均间隔）。克制：不做健康建议/症状问卷。

interface CycleState {
  items: CycleEntity[]
  loaded: boolean
  load: () => Promise<void>
  /** 记录一次（若已有未结束的，则补全 endDate） */
  record: (startDate: string, endDate?: string) => Promise<void>
  update: (id: string, patch: { startDate: string; endDate?: string }) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useCycleStore = create<CycleState>((set) => ({
  items: [],
  loaded: false,

  load: async () => {
    const items = (await cycleRepo.query()) as CycleEntity[]
    set({ items: items.sort((a, b) => a.startDate.localeCompare(b.startDate)), loaded: true })
  },

  record: async (startDate, endDate) => {
    await cycleRepo.create({
      startDate,
      endDate,
      note: undefined,
    } as Omit<CycleEntity, keyof CycleEntity>)
    const items = (await cycleRepo.query()) as CycleEntity[]
    set({ items: items.sort((a, b) => a.startDate.localeCompare(b.startDate)) })
    useAppStore.getState().bumpDataEpoch()
  },

  remove: async (id) => {
    await cycleRepo.remove(id)
    set({ items: (await cycleRepo.query()) as CycleEntity[] })
  },

  update: async (id, patch) => {
    await cycleRepo.update(id, { startDate: patch.startDate, endDate: patch.endDate })
    set({ items: (await cycleRepo.query()) as CycleEntity[] })
    useAppStore.getState().bumpDataEpoch()
  },
}))

/** 基于历史间隔预测平均周期天数与下次开始 */
export function predictNext(items: CycleEntity[]) {
  const starts = items
    .map((c) => c.startDate)
    .filter(Boolean)
    .sort()
  if (starts.length === 0) return { avgCycleDays: 28, nextStart: null as string | null }
  const gaps: number[] = []
  for (let i = 1; i < starts.length; i++) {
    const d = (Date.parse(starts[i]) - Date.parse(starts[i - 1])) / 86400000
    if (d > 0) gaps.push(d)
  }
  const avgCycleDays = gaps.length
    ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
    : 28
  const last = starts[starts.length - 1]
  const nextStart = new Date(Date.parse(last) + avgCycleDays * 86400000).toISOString().slice(0, 10)
  return { avgCycleDays, nextStart }
}
