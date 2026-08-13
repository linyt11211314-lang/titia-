import { create } from 'zustand'
import { recordRepo } from '../db/repos'
import type { RecordEntity, RecordType } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 时间轴统一记录 store
// records 表被多个模块共享（憨憨/记录/灵光），写入后 invalidate 供读取方重取。

interface RecordState {
  records: RecordEntity[]
  loaded: boolean
  load: () => Promise<void>
  createRecord: (type: RecordType, input: Partial<RecordEntity>) => Promise<RecordEntity>
  updateRecord: (id: string, patch: Partial<RecordEntity>) => Promise<void>
  removeRecord: (id: string) => Promise<void>
  /** 写入方落库后调用，触发读取方刷新 */
  invalidate: () => void
}

export const useRecordStore = create<RecordState>((set) => ({
  records: [],
  loaded: false,

  load: async () => {
    const records = await recordRepo.query({}, 200)
    set({ records, loaded: true })
  },

  createRecord: async (type, input) => {
    const rec = await recordRepo.create({
      type,
      occurredAt: input.occurredAt ?? Date.now(),
      title: input.title,
      content: input.content,
      mediaIds: input.mediaIds ?? [],
      refType: input.refType ?? null,
      refId: input.refId,
      payload: input.payload ?? {},
      pinned: input.pinned ?? false,
    } as Omit<RecordEntity, keyof RecordEntity>)
    set((s) => ({ records: [rec, ...s.records] }))
    useAppStore.getState().bumpDataEpoch()
    return rec
  },

  updateRecord: async (id, patch) => {
    await recordRepo.update(id, patch)
    set((s) => ({ records: s.records.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    useAppStore.getState().bumpDataEpoch()
  },

  removeRecord: async (id) => {
    await recordRepo.remove(id)
    set((s) => ({ records: s.records.filter((r) => r.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
  },

  invalidate: () => {
    useAppStore.getState().bumpDataEpoch()
  },
}))
