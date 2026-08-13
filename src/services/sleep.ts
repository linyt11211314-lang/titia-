// Titia 时序 · 睡眠数据（来自 iPhone 快捷指令 Shortcuts 自动导入）
// 纯前端：无后端，快捷指令通过「打开 URL」触发本页 JS，在此解析参数并写入 IndexedDB。
// 主键为 date，同日多次导入自动覆盖（put）。
import { db } from '../db/schema'
import type { SleepRow } from '../db/types'

function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 写入一条睡眠数据（同日覆盖） */
export async function saveSleep(input: Omit<SleepRow, 'importedAt'>): Promise<void> {
  await db.sleep.put({ ...input, importedAt: Date.now() })
}

/** 按日期取 */
export async function getSleepByDate(date: string): Promise<SleepRow | undefined> {
  return db.sleep.get(date)
}

/** 取最新一条（date 最大） */
export async function getLatestSleep(): Promise<SleepRow | null> {
  const all = await db.sleep.toArray()
  if (all.length === 0) return null
  return all.sort((a, b) => b.date.localeCompare(a.date))[0]
}

/**
 * 在 App 启动时调用：解析 URL 中的快捷指令导入参数。
 * 触发形式（任一即可）：
 *   - 查询参数：/?import-sleep=1&date=2026-08-11&sleepHours=7.5&sleepStart=23:30&sleepEnd=07:00
 *   - 路径：/api/import-sleep?...
 * 返回提示信息（成功/失败），若 URL 不含导入参数则返回 null（不影响正常启动）。
 * 注意：纯前端无法读取 POST Body，快捷指令必须使用「打开 URL」而非「获取 URL 内容」。
 */
export async function importSleepFromQuery(): Promise<{ ok: boolean; message: string } | null> {
  const sp = new URLSearchParams(window.location.search)
  const triggeredByQuery = sp.get('import-sleep') != null
  const triggeredByPath = window.location.pathname.startsWith('/api/import-sleep')
  if (!triggeredByQuery && !triggeredByPath) return null

  const date = (sp.get('date') || todayStr()).trim()
  const rawHours = sp.get('sleepHours')
  const hours = rawHours != null ? Number(rawHours) : NaN
  const sleepStart = sp.get('sleepStart')?.trim() || undefined
  const sleepEnd = sp.get('sleepEnd')?.trim() || undefined
  const source = sp.get('source')?.trim() || 'Shortcuts'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: '日期格式应为 YYYY-MM-DD' }
  }
  if (!isFinite(hours) || hours < 0 || hours > 24) {
    return { ok: false, message: 'sleepHours 应为 0-24 的数字' }
  }
  if (sleepStart && !/^\d{2}:\d{2}$/.test(sleepStart)) {
    return { ok: false, message: 'sleepStart 格式应为 HH:MM' }
  }
  if (sleepEnd && !/^\d{2}:\d{2}$/.test(sleepEnd)) {
    return { ok: false, message: 'sleepEnd 格式应为 HH:MM' }
  }

  await db.sleep.put({
    date,
    sleepHours: hours,
    sleepStart,
    sleepEnd,
    source,
    importedAt: Date.now(),
  })

  // 清理 URL，避免刷新重复导入（保留其余参数，如缓存戳 v）
  ;['import-sleep', 'date', 'sleepHours', 'sleepStart', 'sleepEnd', 'source'].forEach((k) =>
    sp.delete(k),
  )
  const ns = sp.toString()
  const newUrl = location.pathname + (ns ? `?${ns}` : '') + location.hash
  history.replaceState(null, '', newUrl)

  return { ok: true, message: `已导入睡眠数据：${hours} 小时（来源：${source}）` }
}
