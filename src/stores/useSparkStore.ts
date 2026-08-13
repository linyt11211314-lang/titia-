import { create } from 'zustand'
import { recordRepo } from '../db/repos'
import type { RecordEntity } from '../db/types'
import { useAppStore } from './useAppStore'
import { useRecordStore } from './useRecordStore'

// Titia 时序 · 灵光一闪 store（type:'spark'）
// 轻量：想法 + 归类 + 完成标记；无标题字段（与标题系统无关）。

const sync = () => {
  useAppStore.getState().bumpDataEpoch()
  useRecordStore.getState().load()
}

interface SparkState {
  items: RecordEntity[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: { content: string; category: string; imageUrl?: string }) => Promise<RecordEntity>
  toggleDone: (id: string, done: boolean) => Promise<void>
  update: (id: string, patch: Partial<RecordEntity>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useSparkStore = create<SparkState>((set) => ({
  items: [],
  loaded: false,

  load: async () => {
    const items = (await recordRepo.query({ type: 'spark' })) as RecordEntity[]
    // query() 按主键(UUID)倒序 → 顺序随机；统一按时间倒序：新写的在最上，刷新不跳
    set({ items: items.sort((a, b) => b.occurredAt - a.occurredAt), loaded: true })
  },

  create: async (input) => {
    const rec = await recordRepo.create({
      type: 'spark',
      occurredAt: Date.now(),
      title: undefined,
      content: input.content,
      mediaIds: [],
      refType: null,
      refId: undefined,
      payload: { category: input.category, done: false, imageUrl: input.imageUrl },
      pinned: false,
    } as Omit<RecordEntity, keyof RecordEntity>)
    // 关键：写库后同步自身 state，列表立即出现
    set((s) => ({ items: [rec, ...s.items] }))
    sync()
    return rec
  },

  toggleDone: async (id, done) => {
    const item = (await recordRepo.get(id)) as RecordEntity | undefined
    if (!item) return
    await recordRepo.update(id, { payload: { ...item.payload, done } })
    set((s) => ({ items: s.items.map((r) => (r.id === id ? { ...r, payload: { ...r.payload, done } } : r)) }))
    sync()
  },

  update: async (id, patch) => {
    await recordRepo.update(id, patch)
    set((s) => ({ items: s.items.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    sync()
  },

  remove: async (id) => {
    await recordRepo.remove(id)
    set((s) => ({ items: s.items.filter((r) => r.id !== id) }))
    sync()
  },
}))
