// Titia 时序 · 输入框可见性（全局）
// iOS/移动端唤起输入法后，键盘会遮挡固定容器（如 Sheet）内的输入框。
// 方案：focusin 时先把输入框滚到可视区域中央；visualViewport 变化（键盘弹起/收起）时
// 若输入框仍被遮挡（底边超出可视区或顶边越界）再滚动一次。
// 全局挂载一次（App.tsx），不影响各模块数据。

function isField(el: Element | null): boolean {
  if (!el) return false
  const t = el.tagName
  return t === 'INPUT' || t === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

function reveal(el: HTMLElement): void {
  try {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  } catch {
    /* 忽略（个别浏览器不支持 options） */
  }
}

export function watchInputVisibility(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

  const onFocusIn = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null
    if (!isField(el)) return
    const target = el as HTMLElement
    // 延迟到 focus 完成后再滚，避免与浏览器默认滚动冲突
    window.setTimeout(() => reveal(target), 150)
  }

  const onVisualViewport = () => {
    const el = document.activeElement as HTMLElement | null
    if (!isField(el)) return
    const target = el as HTMLElement
    const vv = window.visualViewport
    if (!vv) return
    const r = target.getBoundingClientRect()
    // 输入框完全在可视区内则不动；被键盘遮挡或顶出视野则滚到中央
    const fullyVisible = r.top >= 0 && r.bottom <= vv.height
    if (!fullyVisible) window.setTimeout(() => reveal(target), 60)
  }

  document.addEventListener('focusin', onFocusIn, true)
  window.visualViewport?.addEventListener('resize', onVisualViewport)
  return () => {
    document.removeEventListener('focusin', onFocusIn, true)
    window.visualViewport?.removeEventListener('resize', onVisualViewport)
  }
}
