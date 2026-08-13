import { create } from 'zustand'
import { todoRepo } from '../db/repos'
import type { TodoEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 待办 store（首页/我的共用）
interface TodoState {
  todos: TodoEntity[]
  loaded: boolean
  load: () => Promise<void>
  create: (title: string, remindAt?: number) => Promise<void>
  update: (id: string, patch: { title?: string; remindAt?: number | null }) => Promise<void>
  toggle: (id: string, done: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  markNotified: (id: string) => Promise<void>
}

/** 是否「到点提醒」：开启提醒 + 未完成 + 提醒时间已到 */
export const isTodoDue = (t: TodoEntity): boolean =>
  !!t.remindEnabled && !t.done && typeof t.remindAt === 'number' && t.remindAt <= Date.now()

export const useTodoStore = create<TodoState>((set) => ({
  todos: [],
  loaded: false,

  load: async () => {
    const todos = (await todoRepo.query()) as TodoEntity[]
    set({ todos, loaded: true })
  },

  create: async (title, remindAt) => {
    const t = await todoRepo.create({
      title,
      done: false,
      remindEnabled: !!remindAt,
      remindAt,
      notified: false,
      order: Date.now(),
    } as Omit<TodoEntity, keyof TodoEntity>)
    set((s) => ({ todos: [t, ...s.todos] }))
    useAppStore.getState().bumpDataEpoch()
  },

  toggle: async (id, done) => {
    await todoRepo.update(id, { done, completedAt: done ? Date.now() : undefined })
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, done, completedAt: done ? Date.now() : undefined } : t)) }))
  },

  remove: async (id) => {
    await todoRepo.remove(id)
    set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }))
  },

  markNotified: async (id) => {
    await todoRepo.update(id, { notified: true })
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, notified: true } : t)) }))
  },

  update: async (id, patch) => {
    const next: Partial<TodoEntity> = {}
    if (patch.title !== undefined) next.title = patch.title
    if (patch.remindAt !== undefined) {
      next.remindAt = patch.remindAt ?? undefined
      next.remindEnabled = !!patch.remindAt
    }
    await todoRepo.update(id, next)
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...next } : t)) }))
  },
}))
