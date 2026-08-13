import { create } from 'zustand'
import { getAccounts, saveAccount, updateAccount, removeAccount, bulkPutAccounts } from '../services/dataService'
import type { AccountEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 账户 store（完全可自定义）
// 默认预置：支付宝 / 微信 / 现金，用户可增删改。

interface AccountState {
  accounts: AccountEntity[]
  loaded: boolean
  load: () => Promise<void>
  create: (input: { name: string; type: string; kind?: 'asset' | 'liability'; balance?: number }) => Promise<void>
  update: (id: string, patch: Partial<AccountEntity>) => Promise<void>
  remove: (id: string) => Promise<void>
}

// 防并发：多个 load 同时触发时只执行一次预置
let loadInflight: Promise<void> | null = null

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  loaded: false,

  load: () => {
    if (loadInflight) return loadInflight
    loadInflight = (async () => {
      try {
        const list = (await getAccounts()) as AccountEntity[]
        if (list.length === 0) {
          // 首次：预置三个常用账户
          const now = Date.now()
          const presets: Omit<AccountEntity, keyof AccountEntity>[] = [
            { id: crypto.randomUUID(), name: '支付宝', type: '电子钱包', kind: 'asset', order: 0, createdAt: now, updatedAt: now, deletedAt: null, _dirty: 1, _syncedAt: null },
            { id: crypto.randomUUID(), name: '微信', type: '电子钱包', kind: 'asset', order: 1, createdAt: now + 1, updatedAt: now + 1, deletedAt: null, _dirty: 1, _syncedAt: null },
            { id: crypto.randomUUID(), name: '现金', type: '现金账户', kind: 'asset', order: 2, createdAt: now + 2, updatedAt: now + 2, deletedAt: null, _dirty: 1, _syncedAt: null },
          ] as Omit<AccountEntity, keyof AccountEntity>[]
          await bulkPutAccounts(presets as unknown as AccountEntity[])
          set({ accounts: presets as unknown as AccountEntity[], loaded: true })
          return
        }
        set({ accounts: list.sort((a, b) => a.order - b.order), loaded: true })
      } finally {
        loadInflight = null
      }
    })()
    return loadInflight
  },

  create: async (input) => {
    const a = await saveAccount({
      name: input.name.trim(),
      type: input.type.trim() || '其他',
      kind: input.kind ?? 'asset',
      balance: input.balance,
      order: Date.now(),
    } as Omit<AccountEntity, keyof AccountEntity>)
    set((s) => ({ accounts: [...s.accounts, a].sort((x, y) => x.order - y.order) }))
    useAppStore.getState().bumpDataEpoch()
  },

  update: async (id, patch) => {
    await updateAccount(id, patch)
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
    useAppStore.getState().bumpDataEpoch()
  },

  remove: async (id) => {
    await removeAccount(id)
    set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
  },
}))
