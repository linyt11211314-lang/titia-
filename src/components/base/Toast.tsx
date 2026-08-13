import { useAppStore } from '../../stores/useAppStore'

// Titia 时序 · Toast（保存反馈/失败提示）
export function Toast() {
  const toast = useAppStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2">
      <div className="rounded-pill bg-ink px-4 py-2 text-sm text-bg shadow-soft">{toast.msg}</div>
    </div>
  )
}
