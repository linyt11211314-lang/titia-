import { create } from 'zustand'
import type { ReactNode } from 'react'
import { purgeOrphanMedia } from '../services/media'

// Titia 时序 · 全局浮层（Sheet 容器）
// 在 App 根级渲染，保证覆盖全屏（含 TabBar）。模块页通过 open() 弹出自家 Sheet 表单。
// close 时回收孤儿图片（取消 Sheet 后已上传但未关联的 Blob）。

interface OverlayState {
  sheet: ReactNode | null
  open: (n: ReactNode) => void
  close: () => void
  /** 是否由 confirmSheet 等场景占用，避免误清理 */
  locked: boolean
}

export const useOverlayStore = create<OverlayState>((set) => ({
  sheet: null,
  locked: false,
  open: (n) => set({ sheet: n }),
  close: () => {
    set({ sheet: null })
    void purgeOrphanMedia()
  },
}))
