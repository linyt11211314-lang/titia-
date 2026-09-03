import dayjs from 'dayjs'
import raw from '../config/holiday_config.json'

// 排班状态：上班 / 休息
export type DayStatus = '班' | '休'
// 用户在应用内可编辑的状态：在 DayStatus 基础上多一个「补班」（调休补班）
export type UserDayStatus = '休' | '班' | '补班'

interface HolidayConfig {
  anchor: { monday: string; weekType: 'single' | 'double' }
  days: Record<string, DayStatus>
  festivals?: Record<string, string>
}

const config = raw as HolidayConfig
const festivals = config.festivals ?? {}

// ─────────────────────────────────────────────────────────────
// 用户在本机（localStorage）自行编辑的「排班状态」，优先级最高。
// 直接覆盖大小周推算与节假日表，实现「点哪天改哪天、完全不用碰代码」。
// ─────────────────────────────────────────────────────────────
const USER_STATUS_KEY = 'titia:scheduleUserStatus'

function loadUserStatus(): Record<string, UserDayStatus> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(USER_STATUS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, UserDayStatus>) : {}
  } catch {
    return {}
  }
}

let userStatus: Record<string, UserDayStatus> = loadUserStatus()

// 应用内编辑：保存某天状态（status=null 表示清除自定义，恢复默认推算）。
// 即时写入本机，刷新不丢。
export function setUserDayStatus(
  input: dayjs.Dayjs | Date | string,
  status: UserDayStatus | null,
): void {
  const key = dayjs(input).startOf('day').format('YYYY-MM-DD')
  const next = { ...userStatus }
  if (status) next[key] = status
  else delete next[key]
  userStatus = next
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(USER_STATUS_KEY, JSON.stringify(next))
    } catch {
      /* 忽略写入失败（如隐私模式） */
    }
  }
}

// 取用户自定义状态（无则返回 ''）
export function getUserDayStatus(input: dayjs.Dayjs | Date | string): UserDayStatus | '' {
  const key = dayjs(input).startOf('day').format('YYYY-MM-DD')
  return userStatus[key] ?? ''
}

// 锚点：含 2026-08-31（周一）的那一周（即当前所在周 8/31–9/6）。weekType=single 表示锚点周为「单休」。
const ANCHOR_MONDAY = dayjs(config.anchor.monday).startOf('day')
const ANCHOR_IS_SINGLE = config.anchor.weekType === 'single'

// 以周一为一周起点，返回该日期所属周的周一（dayjs.day(): 0=周日 … 6=周六）
function mondayOf(input: dayjs.Dayjs): dayjs.Dayjs {
  const dow = input.day()
  const diff = dow === 0 ? 6 : dow - 1
  return input.subtract(diff, 'day').startOf('day')
}

// 大小周推算（不含查表与用户自定义），供 getDayStatus 内部复用
function computeDefaultStatus(d: dayjs.Dayjs): DayStatus {
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

/**
 * 核心函数：输入任意日期，返回「班」或「休」。
 *
 * 判定优先级（不可颠倒）：
 *   1) 用户本机自定义状态（应用内点按编辑）：直接返回并终止（含「补班」）。
 *   2) 查表：若该日期在 holiday_config.json 的 days 中标记为「休」或「班」，直接返回并终止。
 *   3) 大小周推算：以 2026-08-31 所在周为基准周（单休），按 7 天为一周向前/向后严格轮替：
 *        - 单休周：仅周日休息，其余上班（含周六上班）。
 *        - 双休周：周六、周日休息，其余上班。
 *      历史月份（如 2026-08）也从 2026-08-31 这一周向前倒推，避免跨月周数断裂导致漂移。
 */
export function getDayStatus(input: dayjs.Dayjs | Date | string): DayStatus {
  const d = dayjs(input).startOf('day')
  const key = d.format('YYYY-MM-DD')

  // 1) 用户自定义：最高优先级（含「补班」→ 视为上班，仅展示时用 amber 标记）
  const u = userStatus[key]
  if (u === '补班') return '班'
  if (u === '休' || u === '班') return u

  // 2) 查表
  const override = config.days[key]
  if (override === '休' || override === '班') return override

  // 3) 大小周推算
  return computeDefaultStatus(d)
}

// 该天是否为「调休补班」（用于 amber 高亮）：用户标记补班 或 表中为「班」且非节日
export function isMakeupDay(input: dayjs.Dayjs | Date | string): boolean {
  const key = dayjs(input).startOf('day').format('YYYY-MM-DD')
  if (userStatus[key] === '补班') return true
  return config.days[key] === '班' && !festivals[key]
}

// 节日名称（仅展示用，不参与排班判定），来自 holiday_config.json 的 festivals。
export function getFestivalName(input: dayjs.Dayjs | Date | string): string {
  const key = dayjs(input).startOf('day').format('YYYY-MM-DD')
  return festivals[key] ?? ''
}
