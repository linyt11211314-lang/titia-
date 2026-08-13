import { useEffect, type ReactNode } from 'react'

// Titia 时序 · Sheet（底部升起弹层）
// 遮罩 + 底部面板 + 取消关闭 + Esc 关闭。未保存拦截由 beforeClose 返回 false 阻止。
// 渲染位置由 useOverlayStore 提升到 App 根级（覆盖全屏，含 TabBar）。

interface SheetProps {
  title?: string
  onClose: () => void
  children: ReactNode
  beforeClose?: () => boolean
}

export function Sheet({ title, onClose, children, beforeClose }: SheetProps) {
  const close = () => {
    if (beforeClose && !beforeClose()) return
    onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div
        className="relative max-h-[85vh] w-full max-w-[393px] overflow-y-auto overflow-x-hidden touch-pan-y rounded-t-sheet bg-surface p-5 pb-10"
        style={{ animation: 'sheetUp 300ms cubic-bezier(.32,.72,0,1)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button onClick={close} className="text-ink-3">
            取消
          </button>
        </div>
        {children}
      </div>
      <style>{`@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  )
}
