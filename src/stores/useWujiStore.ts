import { create } from 'zustand'
import { wujiRepo } from '../db/repos'
import type { WujiItemRow } from '../db/types'
import { useAppStore } from './useAppStore'

export type WujiInput = Omit<WujiItemRow, keyof import('../db/types').BaseEntity>

interface WujiState {
  items: WujiItemRow[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: WujiInput) => Promise<WujiItemRow>
  update: (id: string, patch: Partial<WujiInput>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useWujiStore = create<WujiState>((set) => ({
  items: [],
  loaded: false,

  load: async () => {
    const rows = (await wujiRepo.query()) as WujiItemRow[]
    // 最新录入排在前
    set({ items: rows.sort((a, b) => b.createdAt - a.createdAt), loaded: true })
  },

  create: async (input) => {
    const rec = (await wujiRepo.create(input)) as WujiItemRow
    set((s) => ({ items: [rec, ...s.items] }))
    useAppStore.getState().bumpDataEpoch()
    return rec
  },

  update: async (id, patch) => {
    await wujiRepo.update(id, patch)
    set((s) => ({ items: s.items.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    useAppStore.getState().bumpDataEpoch()
  },

  remove: async (id) => {
    await wujiRepo.remove(id)
    set((s) => ({ items: s.items.filter((r) => r.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
  },
}))
