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

// 深浅模式持久化：用户手动选过 浅色/深色 后必须能跨刷新/重开 App 保留，
// 否则每次进入都跟随系统偏好「变回浅色」（用户系统为浅色时尤为明显）。
// 持久化键与皮肤快照('titia.theme')分离，独立保存 mode + themeAuto 两个标志。
const MODE_KEY = 'titia:mode'
const AUTO_KEY = 'titia:themeAuto'

const prefersDark =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

function readSavedMode(): 'light' | 'dark' | null {
  try {
    const v = localStorage.getItem(MODE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return null
}
function readSavedAuto(): boolean | null {
  try {
    const v = localStorage.getItem(AUTO_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* ignore */
  }
  return null
}

// 初始值恢复策略：
//   - 用户曾手动选过（themeAuto=false 且存了 mode）→ 用保存的 mode；
//   - 否则跟随系统（themeAuto=true，mode 取系统偏好）。
// 这样「手动选择」可持久保留，「未手动选择」仍自动跟随系统深浅。
const savedAuto = readSavedAuto()
const themeAuto = savedAuto === null ? true : savedAuto
const savedMode = readSavedMode()
const mode = savedMode ?? (prefersDark ? 'dark' : 'light')

function persistMode(m: 'light' | 'dark', auto: boolean) {
  try {
    localStorage.setItem(MODE_KEY, m)
    localStorage.setItem(AUTO_KEY, auto ? '1' : '0')
  } catch {
    /* 隐私模式等写入失败时仅内存生效，不影响当前会话 */
  }
}

export const useAppStore = create<AppState>((set) => ({
  mode,
  themeAuto,
  toast: null,
  dataEpoch: 0,

  setMode: (m) => {
    document.documentElement.setAttribute('data-mode', m)
    persistMode(m, false)
    set({ mode: m, themeAuto: false })
  },
  setSystemMode: (m) => {
    document.documentElement.setAttribute('data-mode', m)
    // 系统跟随期间也同步持久化 mode（themeAuto 不变，仍为 true），
    // 保证「未手动选择」状态下系统深浅切换后也能正确恢复。
    if (useAppStore.getState().themeAuto) persistMode(m, true)
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
