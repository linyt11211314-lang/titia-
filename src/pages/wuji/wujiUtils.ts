import type { WujiCategory, WujiItemRow, WujiStatus } from '../../db/types'

export const WUJI_CATEGORIES: { key: WujiCategory; label: string; emoji: string }[] = [
  { key: 'digital', label: '数码产品', emoji: '📱' },
  { key: 'appliance', label: '家居电器', emoji: '🔌' },
  { key: 'luxury', label: '奢侈品', emoji: '💎' },
  { key: 'gold', label: '黄金/硬通货', emoji: '🪙' },
  { key: 'collectible', label: '收藏品/手办', emoji: '🎎' },
  { key: 'game', label: '游戏装备', emoji: '🎮' },
  { key: 'clothing', label: '衣物鞋包', emoji: '👜' },
  { key: 'other', label: '其他', emoji: '📦' },
]

export const WUJI_STATUS: { key: WujiStatus; label: string }[] = [
  { key: 'active', label: '服役中' },
  { key: 'idle', label: '闲置' },
  { key: 'sold', label: '已卖出' },
]

export function categoryLabel(c: WujiCategory): string {
  return WUJI_CATEGORIES.find((o) => o.key === c)?.label ?? '其他'
}
export function categoryEmoji(c: WujiCategory): string {
  return WUJI_CATEGORIES.find((o) => o.key === c)?.emoji ?? '📦'
}
export function statusLabel(s: WujiStatus): string {
  return WUJI_STATUS.find((o) => o.key === s)?.label ?? s
}

const DAY = 86400000

/** 今天，格式 YYYY-MM-DD */
export function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** a → b 相差天数（b 默认今天），向下取整、最小 0 */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  return Math.max(0, Math.round((db - da) / DAY))
}

/** 已使用天数（今天 − 买入日） */
export function daysUsed(item: WujiItemRow): number {
  return daysBetween(item.buyDate, todayStr())
}

/** 日均成本 = 买入价 ÷ 已使用天数 */
export function dailyCost(item: WujiItemRow): number {
  const d = daysUsed(item)
  if (d <= 0) return item.buyPrice
  return item.buyPrice / d
}

/** 目标达成进度 = min(已使用天数 ÷ (预期年限 × 365), 1) × 100% */
export function targetProgress(item: WujiItemRow): number {
  const used = daysUsed(item)
  const target = item.expectedYears * 365
  if (target <= 0) return 100
  return Math.min(used / target, 1) * 100
}

/** 持有天数（卖出日 − 买入日） */
export function holdDays(item: WujiItemRow): number {
  return daysBetween(item.buyDate, item.sellDate ?? todayStr())
}

/** 实际日均成本 = (买入价 − 卖出价) ÷ 持有天数（负表示净赚） */
export function actualDailyCost(item: WujiItemRow): number {
  const d = holdDays(item)
  const sp = item.sellPrice ?? 0
  if (d <= 0) return item.buyPrice - sp
  return (item.buyPrice - sp) / d
}

/** 盈亏 = 卖出价 − 买入价（负为亏） */
export function profit(item: WujiItemRow): number {
  return (item.sellPrice ?? 0) - item.buyPrice
}

/** 人民币格式化：整数不带小数，否则保留 1 位 */
export function formatYuan(n: number): string {
  const r = Math.round(n * 10) / 10
  return '¥' + (Number.isInteger(r) ? r.toString() : r.toFixed(1))
}
