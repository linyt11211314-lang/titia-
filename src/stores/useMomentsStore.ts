import { create } from 'zustand'
import { recordRepo } from '../db/repos'
import type { RecordEntity, RecordType } from '../db/types'
import { useAppStore } from './useAppStore'
import { useRecordStore } from './useRecordStore'

// Titia 时序 · 我们的时光 store
// 双类型共用一条时间轴：relation_touched(感动瞬间) / relation_conflict(矛盾复盘)
// 可选关联人物（personName 存入 payload，人物管理 UI 后续补）。

const sync = () => {
  useAppStore.getState().bumpDataEpoch()
  useRecordStore.getState().load()
}

interface MomentsState {
  items: RecordEntity[]
  loaded: boolean
  load: () => Promise<void>
  create: (
    type: Extract<RecordType, 'relation_touched' | 'relation_conflict'>,
    input: Partial<RecordEntity> & { payload: Record<string, unknown> },
  ) => Promise<void>
  update: (id: string, patch: Partial<RecordEntity>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useMomentsStore = create<MomentsState>((set) => ({
  items: [],
  loaded: false,

  load: async () => {
    const all = (await recordRepo.query()) as RecordEntity[]
    const items = all.filter((r) => r.type === 'relation_touched' || r.type === 'relation_conflict')
    // 统一按时间倒序：新写的在最上，刷新不跳
    set({ items: items.sort((a, b) => b.occurredAt - a.occurredAt), loaded: true })
  },

  create: async (type, input) => {
    const rec = await recordRepo.create({
      type,
      occurredAt: input.occurredAt ?? Date.now(),
      title: input.title || undefined,
      content: input.content || undefined,
      mediaIds: input.mediaIds ?? [],
      refType: input.refType ?? null,
      refId: input.refId,
      payload: input.payload,
      pinned: false,
    } as Omit<RecordEntity, keyof RecordEntity>)
    // 关键：写库后同步自身 state，列表立即出现
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
