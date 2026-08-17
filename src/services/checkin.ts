// Titia 时序 · 打卡服务（今日页）
// 已使用天数：从 2026-08-03 至今「过去多少天」（日历天数，今天-起始日+1，不依赖打开记录）。
// 连续打卡天数：基于「手动打卡」日期集合，从今天（或最近打卡日）往前连续的天数。
// 打卡按钮：每点击一次为「今天」记一次打卡（去重）；每日 0 点后自动恢复可打卡状态。
//
// 存储：IndexedDB 表 checkin（每行一个日期，主键=日期字符串）——与所有业务数据一致，
//       可被标准备份/导入与「旧链接迁移书签」一并带走；不再依赖按域名隔离的 localStorage。
// 兼容迁移：旧版本把打卡存在 localStorage('titia.appCheckinDays')（按域名隔离，换链接即丢失）。
//       升级时把旧数据并入 IndexedDB（并集，不覆盖），随后清除旧键，保证历史不丢。

import { db } from '../db/schema'

const LEGACY_KEY = 'titia.appCheckinDays'
/** 起始日（用户口径：2026.8.3） */
export const CHECKIN_START = '2026-08-03'

// 旧版本把打卡存在 localStorage（按域名隔离，换链接即丢失）。
// 升级时把旧数据并入 IndexedDB（并集，不覆盖），随后清除旧键。
let migrationDone = false
let migrationPromise: Promise<void> | null = null

/** 把旧版 localStorage 的打卡数据并入 IndexedDB（并集，幂等）。
 *  不含基线种子，可安全在「导出备份」时调用，避免导出顺带触发一次性种子。 */
export async function migrateLegacyCheckin(): Promise<void> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        const days = arr.filter(
          (s): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s),
        )
        if (days.length) {
          await db.checkin.bulkPut(days.map((d) => ({ date: d })))
        }
      }
      localStorage.removeItem(LEGACY_KEY)
    }
  } catch {
    /* 忽略：无旧数据或解析失败都不影响新存储 */
  }
}

/** 启动期触发：迁移旧版 localStorage 打卡数据到 IndexedDB。 */
export function ensureCheckinMigrated(): Promise<void> {
  if (migrationDone) return Promise.resolve()
  if (migrationPromise) return migrationPromise
  migrationPromise = (async () => {
    try {
      await migrateLegacyCheckin()
    } catch {
      /* 忽略：无旧数据或解析失败都不影响新存储 */
    } finally {
      migrationDone = true
    }
  })()
  return migrationPromise
}

async function readDays(): Promise<string[]> {
  await ensureCheckinMigrated()
  const rows = await db.checkin.toArray()
  return rows.map((r) => r.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
}

async function writeDays(days: string[]): Promise<void> {
  await db.checkin.bulkPut(days.map((d) => ({ date: d })))
}

/** 本地时区的 YYYY-MM-DD（不用 toISOString，避免 UTC 偏移跨日） */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** 已使用天数：2026-08-03（含）至今「过去多少天」（日历天数） */
export function usageDays(): number {
  const start = new Date(CHECKIN_START + 'T00:00:00')
  const now = new Date()
  start.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const days = Math.round((now.getTime() - start.getTime()) / 86_400_000)
  return Math.max(days + 1, 1) // 今天-起始日+1；起始日当天 = 1
}

/** 今天是否已打卡 */
export async function isCheckedToday(): Promise<boolean> {
  return (await readDays()).includes(todayKey())
}

/** 打卡：为今天记一次（去重）；返回是否新增 */
export async function checkInToday(): Promise<boolean> {
  const days = await readDays()
  const t = todayKey()
  if (days.includes(t)) return false
  await writeDays([...days, t])
  return true
}

/** 连续打卡天数：今天打过 → 从今天往前连续；今天没打 → 从最近打卡日往前连续 */
export async function streakDays(): Promise<number> {
  const set = new Set(await readDays())
  const t = todayKey()
  const cursor = new Date()
  if (!set.has(t)) {
    const prev = [...set].filter((d) => d <= t).sort().pop()
    if (!prev) return 0
    const [y, m, d] = prev.split('-').map(Number)
    cursor.setFullYear(y, m - 1, d)
    cursor.setHours(0, 0, 0, 0)
  }
  let n = 0
  while (set.has(todayKey(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}
