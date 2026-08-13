import { useSettingsStore } from '../stores/useSettingsStore'

// Titia 时序 · 震动反馈
// 读取 settings.app.hapticEnabled，开启时调用 navigator.vibrate 轻微震动。
// 任何需要触感反馈的按钮都可调用；未加载设置时默认开启。

export function haptic(pattern: number | number[] = 12) {
  try {
    if (!('vibrate' in navigator)) return
    const enabled = useSettingsStore.getState().hapticEnabled
    if (enabled) navigator.vibrate?.(pattern)
  } catch {
    /* 部分环境 navigator.vibrate 不存在，静默忽略 */
  }
}
