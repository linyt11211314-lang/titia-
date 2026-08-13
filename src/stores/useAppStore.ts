import { create } from 'zustand'

// Titia 时序 · 全局 App store
// 负责：主题模式、Toast、全局数据时钟(useDataEpoch)。

interface AppState {
  mode: 'light' | 'dark'
  /** 是否跟随系统深浅：true=跟随系统(prefers-color-scheme)，false=用户在主题中心手动指定后停止跟随 */
  themeAuto: boolean
  toast: { id: number; msg: string } | null
  /** 全局数据时钟：任何写库后 bump，保活页面据此刷新 */
  dataEpoch: number

  /** 用户手动切换深浅（主题中心点 浅色/深色），会停止跟随系统 */
  setMode: (m: 'light' | 'dark') => void
  /** 系统深浅变化时的同步（保持跟随，不关闭 themeAuto） */
  setSystemMode: (m: 'light' | 'dark') => void
  showToast: (msg: string) => void
  bumpDataEpoch: () => void
}

// 初始深浅跟随系统（若不支持 matchMedia 则默认浅色）。
// 这样 App 自身的深浅由 JS 驱动，applySkin 会同时刷新页面配色与状态栏，
// 避免出现「系统压暗了页面、却没同步状态栏」的割裂白条。
const prefersDark =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

export const useAppStore = create<AppState>((set) => ({
  mode: prefersDark ? 'dark' : 'light',
  themeAuto: true,
  toast: null,
  dataEpoch: 0,

  setMode: (m) => {
    document.documentElement.setAttribute('data-mode', m)
    set({ mode: m, themeAuto: false })
  },
  setSystemMode: (m) => {
    document.documentElement.setAttribute('data-mode', m)
    set({ mode: m })
  },
  showToast: (msg) => {
    const id = Date.now()
    set({ toast: { id, msg } })
    setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : {}))
    }, 1800)
  },
  bumpDataEpoch: () => set((s) => ({ dataEpoch: s.dataEpoch + 1 })),
}))
