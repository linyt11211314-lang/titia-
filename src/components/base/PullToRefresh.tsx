import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

// Titia 时序 · 下拉刷新（Pull-to-Refresh）
// 原生 touch 监听（passive:false 才能 preventDefault 阻止浏览器原生滚动/回弹）。
// 指示器配色跟皮肤 token（primary/highlight），角色皮肤下仍协调。
// 用法：<PullToRefresh scrollRef={...} onRefresh={...}>{children}</PullToRefresh>
//   scrollRef：实际滚动容器（页面滚动在这个容器内）。不传则用内部默认容器。

const THRESHOLD = 64 // 松开触发刷新的下拉距离
const DAMP = 0.45 // 阻尼：手指 1px 下拉 → 指示器 0.45px

type PullState = 'idle' | 'pull' | 'ready' | 'refreshing'

export function PullToRefresh({
  children,
  onRefresh,
  scrollRef,
  className = '',
}: {
  children: ReactNode
  onRefresh: () => Promise<void>
  /** 可选：外部滚动容器 ref（默认内部自建） */
  scrollRef?: RefObject<HTMLDivElement>
  className?: string
}) {
  const innerRef = useRef<HTMLDivElement>(null)
  const scrollEl = scrollRef ?? innerRef
  const [state, setState] = useState<PullState>('idle')
  const [pull, setPull] = useState(0)
  const startY = useRef<number | null>(null)
  const pulling = useRef(false)
  const busy = useRef(false)
  const pullRef = useRef(0)

  useEffect(() => {
    const el = scrollEl.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      if (busy.current) return
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY
        pulling.current = true
      } else {
        startY.current = null
        pulling.current = false
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!pulling.current || startY.current === null || busy.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        pullRef.current = 0
        setPull(0)
        setState('idle')
        return
      }
      // 顶部下拉：阻止原生滚动/回弹，改为驱动指示器
      if (el.scrollTop <= 0) e.preventDefault()
      const d = dy * DAMP
      pullRef.current = d
      setPull(d)
      setState(d > THRESHOLD ? 'ready' : 'pull')
    }
    const onEnd = async () => {
      if (!pulling.current || busy.current) return
      pulling.current = false
      startY.current = null
      if (pullRef.current >= THRESHOLD) {
        setState('refreshing')
        setPull(THRESHOLD)
        busy.current = true
        try {
          await onRefresh()
        } finally {
          busy.current = false
          pullRef.current = 0
          setState('idle')
          setPull(0)
        }
      } else {
        pullRef.current = 0
        setState('idle')
        setPull(0)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false }) // 关键：非 passive 才能 preventDefault
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [scrollEl, onRefresh])

  return (
    // 外层必须是 flex 纵向容器：滚动子项的 flex-1 才有效，高度被约束在视口内（否则内容多高容器多高，永不滚动）
    // min-h-0 关键：flex 子项默认 min-height:auto=内容高度，会顶住 flex-grow 的收缩，导致滚动容器=内容高度、无法滚动
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {/* 指示器：跟随下拉位移，顶部悬浮 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 top-0 z-[30] flex justify-center"
        style={{
          transform: `translateY(${state === 'refreshing' ? 10 : pull - 40}px)`,
          opacity: state === 'idle' ? 0 : 1,
          transition:
            state === 'refreshing' || state === 'idle' ? 'transform 200ms, opacity 200ms' : 'none',
        }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-pill"
          style={{ background: 'var(--color-surface)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        >
          {state === 'refreshing' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" className="animate-spin" style={{ color: 'var(--color-primary)' }}>
              <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" d="M20 12a8 8 0 1 1-2.34-5.66" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              style={{
                color: 'var(--color-primary)',
                transform: `rotate(${Math.min(pull / THRESHOLD, 1) * 180}deg)`,
                transition: 'transform 150ms',
              }}
            >
              <path fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M6 14l6 6 6-6" />
            </svg>
          )}
        </div>
      </div>

      {/* 滚动容器（scrollRef 传入时即外部容器，否则自建） */}
      <div
        ref={scrollRef ?? innerRef}
        className={scrollRef ? className : `flex h-full flex-col overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
