import { create } from 'zustand'
import { shoppingRepo } from '../db/repos'
import type { ShoppingEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 购物清单 store（/shopping，文档：无图片/价格/优先级）
// 输入框即增、勾选置「已买」、左滑/按钮删除。

interface ShoppingState {
  items: ShoppingEntity[]
  loaded: boolean
  load: () => Promise<void>
  add: (name: string) => Promise<void>
  toggle: (id: string, bought: boolean) => Promise<void>
  /** 修改清单项（名称等；今日页共用本 store，改后自动同步） */
  update: (id: string, patch: Partial<Pick<ShoppingEntity, 'name' | 'status' | 'bought' | 'boughtAt'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

// Repository.query() 按主键倒序，而 id 是 UUID → 顺序实际是随机的。
// 这里统一按 order（创建时的时间戳）降序，保证「新加的在最上面」且刷新后不跳。
// 归一化：老数据没有 status 字段时按 bought 推断（bought:true → completed）。
const sorted = async () => {
  const items = (await shoppingRepo.query()) as ShoppingEntity[]
  return items
    .map((i) => ({ ...i, status: i.status ?? (i.bought ? 'completed' : 'pending') }))
    .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
}

export const useShoppingStore = create<ShoppingState>((set) => ({
  items: [],
  loaded: false,

  load: async () => {
    set({ items: await sorted(), loaded: true })
  },

  add: async (name) => {
    await shoppingRepo.create({
      name,
      status: 'pending',
      bought: false,
      boughtAt: undefined,
      order: Date.now(),
    } as Omit<ShoppingEntity, keyof ShoppingEntity>)
    set({ items: await sorted() })
    useAppStore.getState().bumpDataEpoch()
  },

  toggle: async (id, bought) => {
    await shoppingRepo.update(id, {
      bought,
      status: bought ? 'completed' : 'pending',
      boughtAt: bought ? Date.now() : undefined,
    })
    set({ items: await sorted() })
    useAppStore.getState().bumpDataEpoch()
  },

  update: async (id, patch) => {
    await shoppingRepo.update(id, patch)
    set({ items: await sorted() })
    useAppStore.getState().bumpDataEpoch()
  },

  remove: async (id) => {
    await shoppingRepo.remove(id)
    set({ items: await sorted() })
    useAppStore.getState().bumpDataEpoch()
  },
}))
