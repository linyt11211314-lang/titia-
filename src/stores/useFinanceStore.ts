import { create } from 'zustand'
import { financeRepo } from '../db/repos'
import type { FinanceItemEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 财富规划 store（/finance）
// 月收入/月支出/结余由 store 计算（不落库）。cycle: monthly 原值 / yearly ÷12 / once 不计入月值。

interface FinanceState {
  items: FinanceItemEntity[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: {
    side: 'income' | 'expense'
    kind: string
    category: string
    name: string
    amount: number
    cycle: 'monthly' | 'yearly' | 'once'
  }) => Promise<void>
  update: (id: string, patch: Partial<FinanceItemEntity>) => Promise<void>
  toggleActive: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

const toMonthly = (it: FinanceItemEntity): number => {
  if (!it.active) return 0
  if (it.cycle === 'yearly') return it.amount / 12
  if (it.cycle === 'once') return 0
  return it.amount
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    const items = (await financeRepo.query()) as FinanceItemEntity[]
    set({ items, loaded: true })
  },

  create: async (input) => {
    await financeRepo.create({
      side: input.side,
      kind: input.kind,
      category: input.category,
      name: input.name,
      amount: input.amount,
      cycle: input.cycle,
      active: true,
      note: undefined,
    } as Omit<FinanceItemEntity, keyof FinanceItemEntity>)
    set({ items: await financeRepo.query() })
    useAppStore.getState().bumpDataEpoch()
  },

  update: async (id, patch) => {
    await financeRepo.update(id, patch)
    set({ items: await financeRepo.query() })
  },

  toggleActive: async (id) => {
    const it = get().items.find((x) => x.id === id)
    if (!it) return
    await financeRepo.update(id, { active: !it.active })
    set({ items: await financeRepo.query() })
  },

  remove: async (id) => {
    await financeRepo.remove(id)
    set({ items: await financeRepo.query() })
  },
}))

export const financeSummary = (items: FinanceItemEntity[]) => {
  const income = items.filter((i) => i.side === 'income').reduce((s, i) => s + toMonthly(i), 0)
  const expense = items.filter((i) => i.side === 'expense').reduce((s, i) => s + toMonthly(i), 0)
  return { income, expense, balance: income - expense }
}
