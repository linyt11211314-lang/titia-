import { create } from 'zustand'
import { auraRepo } from '../db/repos'
import type { AuraHistoryRow } from '../db/types'
import { useAppStore } from './useAppStore'

export interface AuraCurrentResult {
  id?: string
  createdAt?: number
  symptoms: string[]
  factors: string[]
  ageGroup: string
  skinType: string
  sections: AuraHistoryRow['sections']
}

interface AuraState {
  items: AuraHistoryRow[]
  loaded: boolean
  currentResult: AuraCurrentResult | null
  load: () => Promise<void>
  save: (input: {
    symptoms: string[]
    factors: string[]
    ageGroup: string
    skinType: string
    sections: AuraHistoryRow['sections']
  }) => Promise<AuraHistoryRow>
  remove: (id: string) => Promise<void>
  setCurrentResult: (r: AuraCurrentResult | null) => void
}

export const useAuraStore = create<AuraState>((set) => ({
  items: [],
  loaded: false,
  currentResult: null,

  load: async () => {
    const rows = (await auraRepo.query()) as AuraHistoryRow[]
    // 最新诊断排在前
    set({ items: rows.sort((a, b) => b.createdAt - a.createdAt), loaded: true })
  },

  save: async (input) => {
    const rec = (await auraRepo.create(input)) as AuraHistoryRow
    set((s) => ({ items: [rec, ...s.items] }))
    useAppStore.getState().bumpDataEpoch()
    return rec
  },

  remove: async (id) => {
    await auraRepo.remove(id)
    set((s) => ({ items: s.items.filter((r) => r.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
  },

  setCurrentResult: (r) => set({ currentResult: r }),
}))
