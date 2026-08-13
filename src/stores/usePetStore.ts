import { create } from 'zustand'
import { petRepo, petHealthRepo } from '../db/repos'
import type { PetEntity, PetHealthEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 我的憨憨 store
// 写库后 invalidate 全局记录 store + bumpDataEpoch（跨页面刷新）。

interface PetState {
  pets: PetEntity[]
  health: PetHealthEntity[]
  loaded: boolean
  load: () => Promise<void>
  createPet: (input: Partial<PetEntity>) => Promise<PetEntity>
  updatePet: (id: string, patch: Partial<PetEntity>) => Promise<void>
  removePet: (id: string) => Promise<void>
  addHealth: (input: Partial<PetHealthEntity>) => Promise<void>
  updateHealth: (id: string, patch: Partial<PetHealthEntity>) => Promise<void>
  removeHealth: (id: string) => Promise<void>
  loadHealth: (petId: string) => Promise<void>
}

export const usePetStore = create<PetState>((set, get) => ({
  pets: [],
  health: [],
  loaded: false,

  load: async () => {
    // query() 按主键(UUID)倒序 → 顺序随机；且建档时 order 恒为 0 排不了序。
    // 统一按 createdAt 升序：先接回家的憨憨排前面。
    const pets = (await petRepo.query()) as PetEntity[]
    set({ pets: pets.sort((a, b) => a.createdAt - b.createdAt), loaded: true })
  },

  createPet: async (input) => {
    const pet = await petRepo.create(input as Omit<PetEntity, keyof PetEntity>)
    set((s) => ({ pets: [pet, ...s.pets] }))
    useAppStore.getState().bumpDataEpoch()
    return pet
  },

  updatePet: async (id, patch) => {
    await petRepo.update(id, patch)
    set((s) => ({ pets: s.pets.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
    useAppStore.getState().bumpDataEpoch()
  },

  removePet: async (id) => {
    await petRepo.remove(id)
    set((s) => ({ pets: s.pets.filter((p) => p.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
  },

  addHealth: async (input) => {
    const h = await petHealthRepo.create(input as Omit<PetHealthEntity, keyof PetHealthEntity>)
    set((s) => ({ health: [h, ...s.health] }))
  },

  removeHealth: async (id) => {
    await petHealthRepo.remove(id)
    set((s) => ({ health: s.health.filter((h) => h.id !== id) }))
  },

  updateHealth: async (id, patch) => {
    await petHealthRepo.update(id, patch)
    set((s) => ({ health: s.health.map((h) => (h.id === id ? { ...h, ...patch } : h)) }))
  },

  loadHealth: async (petId) => {
    const health = (await petHealthRepo.query({ petId })) as PetHealthEntity[]
    set({ health })
  },
}))
