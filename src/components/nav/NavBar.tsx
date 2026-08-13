import type { ReactNode } from 'react'
import { BackIcon } from '../icons'
import { back } from '../../app/useHashRoute'

// Titia 时序 · NavBar（模块页 Level1 用）
// 左侧返回（触发 pop），右侧可放操作。

interface NavBarProps {
  title: string
  right?: ReactNode
  /** 主 Tab 页不需要返回按钮（如 Aura 作为一级 Tab） */
  showBack?: boolean
}

export function NavBar({ title, right, showBack = true }: NavBarProps) {
  return (
    <header
      className="flex items-center justify-between bg-surface px-4 py-3 shadow-soft"
      style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
    >
      {showBack ? (
        <button onClick={back} className="pressable flex items-center text-ink" aria-label="返回">
          <BackIcon width={24} height={24} />
        </button>
      ) : (
        <span className="flex w-6 items-center justify-center" aria-hidden="true" />
      )}
      <h1 className="text-base font-semibold text-ink">{title}</h1>
      <div className="flex items-center">{right}</div>
    </header>
  )
}
