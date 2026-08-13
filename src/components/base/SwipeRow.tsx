import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'

// Titia 时序 · 通用左滑删除行
// 仅叠加手势层：左滑揭示「删除」按钮，点击删除时调用外部传入的 onDelete（各页已有删除/二次确认逻辑）。
// 不改变任何数据或业务行为，仅提供交互入口；竖直滚动、点击进入详情等原有行为不受影响。
//
// 关键修正（检修 2026-08-11）：
//  - 删除按钮在「未左滑 / 未展开」时 opacity:0 且 pointer-events:none，
//    绝不会从透明内容层后透出「大红色删除键」。
//  - 关闭态下点击行内容（非内部交互控件）可选触发 onPress（进入编辑/详情），
//    修复此前误删 <Card onPress> 导致「记录无法编辑」的问题。
//  - 已展开时点击内容 = 收起（标准左滑删除交互），不误触发行内动作。

interface SwipeRowProps {
  children: ReactNode
  /** 点击「删除」按钮时执行（由各页传入，已含 confirmSheet 等逻辑） */
  onDelete: () => void | Promise<void>
  /** 删除按钮文案，默认「删除」 */
  deleteLabel?: string
  className?: string
  /** 点击行内容（非内部交互控件、且未展开删除时）触发，用于进入详情/编辑 */
  onPress?: () => void
}

const MAX = 84 // 删除按钮露出宽度(px)
const THRESHOLD = 40 // 低于此位移松手则回弹

export function SwipeRow({
  children,
  onDelete,
  deleteLabel = '删除',
  className,
  onPress,
}: SwipeRowProps) {
  const [open, setOpen] = useState(false)
  const [dx, setDx] = useState(0)
  const startX = useRef(0)
  const startY = useRef(0)
  const dragging = useRef(false)
  const decided = useRef<'h' | 'v' | null>(null)
  const swallow = useRef(false) // 横向滑动后吞没随后可能的 click
  const openRef = useRef(open)
  openRef.current = open

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startX.current = e.clientX
    startY.current = e.clientY
    dragging.current = true
    decided.current = null
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* 某些环境不支持 capture，忽略 */
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current) return
    const ddx = e.clientX - startX.current
    const ddy = e.clientY - startY.current
    if (decided.current === null) {
      if (Math.abs(ddx) < 6 && Math.abs(ddy) < 6) return
      decided.current = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v'
    }
    if (decided.current === 'v') {
      // 竖直滚动：放手，不干预
      dragging.current = false
      return
    }
    const next = openRef.current ? ddx - MAX : ddx
    setDx(Math.max(-MAX, Math.min(0, next)))
  }

  const onPointerUp = () => {
    if (!dragging.current) return
    dragging.current = false
    if (decided.current === 'h') {
      swallow.current = true // 本次是横向滑动，吞没随后可能的 click
      if (dx <= -THRESHOLD) {
        setOpen(true)
        setDx(-MAX)
      } else {
        setOpen(false)
        setDx(0)
      }
    } else {
      swallow.current = false
    }
  }

  // 外层捕获点击：处理「横滑后的误触」「打开态点内容关闭」「关闭态进入编辑」
  const onClickCapture = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-swipe-del]')) return // 点的是删除按钮，放行
    if (swallow.current) {
      e.preventDefault()
      e.stopPropagation()
      swallow.current = false
      if (openRef.current) {
        setOpen(false)
        setDx(0)
      }
      return
    }
    if (openRef.current) {
      // 已展开时，点内容区域 = 关闭而非触发行内动作
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      setDx(0)
      return
    }
    // 关闭且非误触：若提供 onPress，且点击的是行内容（非内部按钮/链接/输入）则进入编辑
    if (onPress) {
      const interactive = target.closest(
        'button, a, [role="button"], input, select, textarea, label',
      )
      if (!interactive) {
        e.preventDefault()
        e.stopPropagation()
        onPress()
      }
    }
  }

  const delVisible = open || dx < 0
  return (
    <div
      className={`relative overflow-hidden rounded-card bg-transparent ${className ?? ''}`}
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
    >
      {/* 删除按钮：定位在右侧，随内容左移露出；未展开时隐藏且不响应点击 */}
      <button
        data-swipe-del
        onClick={(e) => {
          e.stopPropagation()
          void onDelete()
        }}
        className="absolute right-0 top-0 flex h-full items-center justify-center rounded-r-card bg-[var(--color-danger,#e5484d)] px-5 text-sm font-medium text-white"
        style={{
          width: MAX,
          opacity: delVisible ? 1 : 0,
          visibility: delVisible ? 'visible' : 'hidden',
          pointerEvents: delVisible ? 'auto' : 'none',
          transform: delVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'opacity 150ms ease-out, transform 150ms ease-out, visibility 0s linear',
        }}
        aria-label={deleteLabel}
        tabIndex={delVisible ? 0 : -1}
      >
        {deleteLabel}
      </button>
      {/* 行内容：可横向位移露出删除按钮 */}
      <div
        className="relative bg-inherit transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${dx}px)` }}
      >
        {children}
      </div>
    </div>
  )
}
