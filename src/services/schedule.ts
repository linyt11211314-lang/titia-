import dayjs from 'dayjs'
import raw from '../config/holiday_config.json'

export type DayStatus = '班' | '休'

interface HolidayConfig {
  anchor: { monday: string; weekType: 'single' | 'double' }
  days: Record<string, DayStatus>
}

const config = raw as HolidayConfig

// 锚点：含 2026-09-07（周一）的那一周。weekType=single 表示锚点周为「单休」。
const ANCHOR_MONDAY = dayjs(config.anchor.monday).startOf('day')
const ANCHOR_IS_SINGLE = config.anchor.weekType === 'single'

// 以周一为一周起点，返回该日期所属周的周一（dayjs.day(): 0=周日 … 6=周六）
function mondayOf(input: dayjs.Dayjs): dayjs.Dayjs {
  const dow = input.day()
  const diff = dow === 0 ? 6 : dow - 1
  return input.subtract(diff, 'day').startOf('day')
}

/**
 * 核心函数：输入任意日期，返回「班」或「休」。
 *
 * 判定优先级（不可颠倒）：
 *   1) 查表：若该日期在 holiday_config.json 的 days 中标记为「休」或「班」，直接返回并终止。
 *   2) 大小周推算：以 2026-09-07 所在周为基准周（单休），按 7 天为一周向前/向后严格轮替：
 *        - 单休周：仅周日休息，其余上班（含周六上班）。
 *        - 双休周：周六、周日休息，其余上班。
 *      历史月份（如 2026-08）也从 2026-09-07 这一周向前倒推，避免跨月周数断裂导致漂移。
 */
export function getDayStatus(input: dayjs.Dayjs | Date | string): DayStatus {
  const d = dayjs(input).startOf('day')
  const key = d.format('YYYY-MM-DD')
  const override = config.days[key]
  if (override === '休' || override === '班') return override

  // 大小周推算：两个 Monday 相差天数必为 7 的整数倍
  const weekMonday = mondayOf(d)
  const weekDiff = Math.round(weekMonday.diff(ANCHOR_MONDAY, 'day') / 7)
  const parity = ((weekDiff % 2) + 2) % 2 // 0=偶数周 1=奇数周（兼容负数周）
  const isSingle = ANCHOR_IS_SINGLE ? parity === 0 : parity === 1
  const dow = d.day() // 0=周日 6=周六

  if (isSingle) {
    return dow === 0 ? '休' : '班'
  }
  return dow === 0 || dow === 6 ? '休' : '班'
}
