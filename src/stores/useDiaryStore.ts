import { create } from 'zustand'
import { recordRepo } from '../db/repos'
import type { RecordEntity } from '../db/types'
import { useAppStore } from './useAppStore'
import { useRecordStore } from './useRecordStore'

// Titia 时序 · 日记 store（mirror useSparkStore，type:'diary'）
// 写库后同步全局记录 store + bumpDataEpoch（跨页面刷新）。

const sync = () => {
  useAppStore.getState().bumpDataEpoch()
  useRecordStore.getState().load()
}

interface DiaryState {
  items: RecordEntity[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: {
    title?: string
    content?: string
    mood?: string
    weather?: string
    mediaIds?: string[]
  }) => Promise<void>
  update: (id: string, patch: Partial<RecordEntity>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useDiaryStore = create<DiaryState>((set) => ({
  items: [],
  loaded: false,

  load: async () => {
    const items = (await recordRepo.query({ type: 'diary' })) as RecordEntity[]
    // query() 按主键(UUID)倒序 → 顺序随机；统一按时间倒序：新写的在最上，刷新不跳
    set({ items: items.sort((a, b) => b.occurredAt - a.occurredAt), loaded: true })
  },

  create: async (input) => {
    const rec = await recordRepo.create({
      type: 'diary',
      occurredAt: Date.now(),
      title: input.title || undefined,
      content: input.content || undefined,
      mediaIds: input.mediaIds ?? [],
      refType: null,
      refId: undefined,
      payload: { mood: input.mood, weather: input.weather },
      pinned: false,
    } as Omit<RecordEntity, keyof RecordEntity>)
    // 关键：写库后同步自身 state，页面订阅本 store 立即重渲染（不再等重进页面）
    set((s) => ({ items: [rec, ...s.items] }))
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
