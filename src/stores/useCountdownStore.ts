import { create } from 'zustand'
import { countdownRepo } from '../db/repos'
import type { CountdownEventEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 倒数日 store
// 期待（未来日期）/ 足迹（已发生日期）两类，写库后同步自身 items + 全局 epoch。

type Kind = 'expected' | 'footprint'

interface CountdownState {
  items: CountdownEventEntity[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: {
    kind: Kind
    title: string
    relation?: string
    category: CountdownEventEntity['category']
    eventType?: 'birthday' | 'anniversary' | 'other'
    dateType: 'solar' | 'lunar'
    solarDate?: string
    lunarDate?: string
    lunarYear?: number
    avatar: string
  }) => Promise<void>
  update: (id: string, patch: Partial<CountdownEventEntity>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useCountdownStore = create<CountdownState>((set) => ({
  items: [],
  loaded: false,

  load: async () => {
    const items = (await countdownRepo.query()) as CountdownEventEntity[]
    set({ items: items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)), loaded: true })
  },

  create: async (input) => {
    const rec = await countdownRepo.create({
      kind: input.kind,
      title: input.title,
      relation: input.relation || undefined,
      category: input.category,
      eventType: input.eventType,
      dateType: input.dateType,
      solarDate: input.solarDate || undefined,
      lunarDate: input.lunarDate || undefined,
      lunarYear: input.lunarYear || undefined,
      avatar: input.avatar || '✨',
    } as Omit<CountdownEventEntity, keyof CountdownEventEntity>)
    set((s) => ({ items: [rec, ...s.items] }))
    useAppStore.getState().bumpDataEpoch()
  },

  update: async (id, patch) => {
    await countdownRepo.update(id, patch)
    set((s) => ({ items: s.items.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    useAppStore.getState().bumpDataEpoch()
  },

  remove: async (id) => {
    await countdownRepo.remove(id)
    set((s) => ({ items: s.items.filter((r) => r.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
  },
}))
