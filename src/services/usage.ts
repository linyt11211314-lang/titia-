// Titia 时序 · 已使用时长（App 启用起始日 2026-08-03）
// 仅用于展示「加入 Titia 第 X 天 / 已使用 X 天」，不再与每日打卡功能耦合。

/** 起始日（用户口径：2026.8.3） */
export const JOIN_DATE = '2026-08-03'

/** 已使用天数：2026-08-03（含）至今「过去多少天」（日历天数，今天-起始日+1） */
export function usageDays(): number {
  const start = new Date(JOIN_DATE + 'T00:00:00')
  const now = new Date()
  start.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const days = Math.round((now.getTime() - start.getTime()) / 86_400_000)
  return Math.max(days + 1, 1) // 起始日当天 = 1
}
