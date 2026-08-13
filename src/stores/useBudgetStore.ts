import { create } from 'zustand'
import { getBudgets, saveBudget, updateBudget, removeBudget } from '../services/dataService'
import type { BudgetEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 预算 store（分类预算：绑定一级分类，月周期，轻提醒不强制）
// 数据访问统一经 DataService（Local First + Sync Ready 架构）。

interface BudgetState {
  budgets: BudgetEntity[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: { category: string; amount: number }) => Promise<void>
  update: (id: string, patch: Partial<BudgetEntity>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useBudgetStore = create<BudgetState>((set) => ({
  budgets: [],
  loaded: false,

  load: async () => {
    const list = (await getBudgets()) as BudgetEntity[]
    set({ budgets: list, loaded: true })
  },

  create: async (input) => {
    const b = await saveBudget({
      category: input.category,
      amount: Math.round(input.amount),
      period: 'month',
    } as Omit<BudgetEntity, keyof BudgetEntity>)
    set((s) => ({ budgets: [...s.budgets, b] }))
    useAppStore.getState().bumpDataEpoch()
  },

  update: async (id, patch) => {
    await updateBudget(id, patch)
    set((s) => ({ budgets: s.budgets.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
    useAppStore.getState().bumpDataEpoch()
  },

  remove: async (id) => {
    await removeBudget(id)
    set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
  },
}))
