import { Sheet } from './Sheet'
import { useOverlayStore } from '../../stores/useOverlayStore'

// Titia 时序 · confirmSheet
// 用底部 Sheet 替代原生 window.confirm（删除/二次确认场景）。
// 返回 Promise<boolean>：用户点「确认」为 true，取消/点遮罩为 false。
// 可选自定义按钮文案（需求：重复记账提示需「继续保存」按钮）。

export function confirmSheet(
  title: string,
  message: string,
  options?: { confirmText?: string; cancelText?: string },
): Promise<boolean> {
  const confirmText = options?.confirmText ?? '确认'
  const cancelText = options?.cancelText ?? '取消'
  return new Promise((resolve) => {
    let settled = false
    const finish = (val: boolean) => {
      if (settled) return
      settled = true
      useOverlayStore.getState().close()
      resolve(val)
    }
    useOverlayStore.getState().open(
      <Sheet
        title={title}
        onClose={() => finish(false)}
        beforeClose={() => {
          finish(false)
          return false
        }}
      >
        <p className="text-sm text-ink-2">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => finish(false)}
            className="flex-1 rounded-pill bg-surface-sunken px-4 py-2.5 text-sm text-ink-2"
          >
            {cancelText}
          </button>
          <button onClick={() => finish(true)} className="flex-1 rounded-pill bg-primary px-4 py-2.5 text-sm text-bg">
            {confirmText}
          </button>
        </div>
      </Sheet>,
    )
  })
}
