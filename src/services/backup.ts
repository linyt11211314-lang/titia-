import { db } from '../db/schema'
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useRecordStore } from '../stores/useRecordStore'
import { usePetStore } from '../stores/usePetStore'
import { useTodoStore } from '../stores/useTodoStore'
import { useDiaryStore } from '../stores/useDiaryStore'
import { useMomentsStore } from '../stores/useMomentsStore'
import { useSparkStore } from '../stores/useSparkStore'
import { useFinanceStore } from '../stores/useFinanceStore'
import { useCycleStore } from '../stores/useCycleStore'
import { useShoppingStore } from '../stores/useShoppingStore'
import { migrateLegacyCheckin } from './checkin'

// Titia 时序 · 备份服务
// 导出：全部表 + 图片 Blob→base64 → 下载 JSON（密码箱条目保持密文）。
// 导入：按 id upsert，导入前自动生成一次本地备份；刷新各 store。
// 存储占用：估算记录数 + 图片体积。

const TABLE_NAMES = [
  'records',
  'pets',
  'petHealth',
  'people',
  'todos',
  'media',
  'settings',
  'shopping',
  'financeItems',
  'cycles',
  'vaultMeta',
  'vaultItems',
  'countdownEvents',
  'transactions',
  'rules',
  'accounts',
  'categories',
  'budgets',
  'customSkins',
  'presetSkins',
  'auraHistory',
  'checkin',
  'wujiItems',
  'sleep',
] as const

type AnyRow = Record<string, unknown> & { blob?: Blob; thumb?: Blob; mime?: string }

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.readAsDataURL(b)
  })
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// 构建备份 JSON 文本（全部表 + 图片 Blob→base64）。
async function buildBackupJson(): Promise<string> {
  // 导出前先把旧版 localStorage 打卡并回 IndexedDB，避免「导出时 checkin 表为空 → 打卡丢失」。
  // 仅做迁移、不触发基线种子，导出行为不污染数据。
  await migrateLegacyCheckin()
  const out: { version: number; exportedAt: number; tables: Record<string, AnyRow[]> } = {
    version: 1,
    exportedAt: Date.now(),
    tables: {},
  }
  for (const name of TABLE_NAMES) {
    const table = (db as unknown as Record<string, { toArray: () => Promise<AnyRow[]> }>)[name]
    const all = (await table.toArray()) as AnyRow[]
    // 软删记录（deletedAt 已置位）不进备份：删除即不再导出，避免已删记录残留于备份文件。
    // 无 deletedAt 字段的表（media/settings/checkin/customSkins 等）不受影响（字段缺失 → 保留）。
    const rows = all.filter((r) => !(r as { deletedAt?: number | null }).deletedAt)
    out.tables[name] = await Promise.all(
      rows.map(async (r) => {
        // 媒体表：blob / thumb 各自独立判断并转 base64。
        // 旧逻辑要求「两者同时存在」才转换，任一缺失会导致 Blob 被 JSON.stringify
        // 序列化为 {} → 图片在备份中直接丢失。改为分别处理，缺哪个转哪个。
        if (name === 'media') {
          const row = { ...r }
          if (row.blob instanceof Blob) row.blob = (await blobToBase64(row.blob)) as unknown as Blob
          if (row.thumb instanceof Blob) row.thumb = (await blobToBase64(row.thumb)) as unknown as Blob
          return row
        }
        return r
      }),
    )
  }
  // 兜底 replacer：若仍有残留 Blob（理论上 media 已预处理），丢弃该字段而非写成 {}，
  // 避免 JSON 中出现空对象导致导入时图片字段损坏。
  return JSON.stringify(out, (_k, v) => (v instanceof Blob ? undefined : v))
}

// 触发浏览器下载（兜底用，不弹分享面板）。
function downloadJson(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** 用户主动导出：优先走系统分享面板（iOS/Android 可存到「文件」/ 发微信 / 发邮件，无需下载文件夹），
 *  不支持时兜底直接下载。 */
export async function exportBackup(): Promise<void> {
  const json = await buildBackupJson()
  const fileName = `titia-backup-${new Date().toISOString().slice(0, 10)}.json`
  const file = new File([json], fileName, { type: 'application/json' })
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Titia 备份', text: 'Titia 时序数据备份' })
      return
    } catch (e) {
      // 用户主动取消分享 → 静默返回，不重复下载
      if ((e as Error)?.name === 'AbortError') return
      // 其他异常 → 落到下方下载兜底
    }
  }
  downloadJson(json, fileName)
}

/** 是否运行在 iOS 独立 PWA（主屏图标）环境。iOS 的 PWA 与 Safari 是独立存储，
 *  且在 PWA 内触发下载会被 iOS 弹到 Safari 预览 → 导入流程被打断。 */
function isStandalonePwa(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
}

/** 导入前的本地快照：静默保存，不打扰。
 *  Safari 环境：静默下载（不弹分享面板），可回滚。
 *  PWA 环境：iOS 下载会跳转 Safari 打断导入 → 改为写入 localStorage 尽力而为（放不下则跳过，不影响导入）。 */
async function exportBackupSilent(): Promise<void> {
  const json = await buildBackupJson()
  if (isStandalonePwa()) {
    try {
      localStorage.setItem('titia:preImportSnapshot', json)
    } catch {
      // localStorage 容量不足（备份含大量图片 base64 时可能超出）→ 跳过静默快照，不阻塞导入主流程
      console.warn('[备份导入] PWA 环境静默快照存储失败（可能体积超限），已跳过')
    }
    return
  }
  downloadJson(json, `titia-backup-before-import-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function importBackup(file: File): Promise<void> {
  const text = await file.text()
  const data = JSON.parse(text) as { tables: Record<string, AnyRow[]> }
  if (!data.tables) throw new Error('格式不正确')
  await applyBackupData(data)
}

// 导入写入核心逻辑：按 id upsert，刷新各 store。返回导入失败的表名列表。
async function applyBackupData(data: { tables: Record<string, AnyRow[]> }): Promise<string[]> {
  await exportBackupSilent() // 导入前自动生成本地备份（静默，不弹分享面板）
  const failed: string[] = []
  for (const name of TABLE_NAMES) {
    const rows = data.tables?.[name] || []
    if (!rows.length) continue
    try {
      const fixed = await Promise.all(
        rows.map(async (r) => {
          // 媒体表：blob / thumb 各自独立按「字符串才还原」处理。
          // 旧逻辑要求两者都是字符串才还原，任一缺失则不处理 → 该图片字段残留 base64 字符串而非 Blob → 显示空白。
          if (name === 'media') {
            const row = { ...r }
            try {
              if (typeof row.blob === 'string') row.blob = base64ToBlob(row.blob, (row.mime as string) || 'image/jpeg')
              if (typeof row.thumb === 'string') row.thumb = base64ToBlob(row.thumb, (row.mime as string) || 'image/jpeg')
            } catch {
              // 单条媒体损坏则保留原值，不阻断整表写入
            }
            return row
          }
          return r
        }),
      )
      // 按主键去重：防止备份文件内出现重复行（id 或 checkin/sleep 的 date 主键）导致写入异常。
      const seen = new Set<string>()
      const deduped = fixed.filter((row) => {
        const key = (row.id as string) ?? (row.date as string)
        if (key == null) return true
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      // media 含大体积 Blob，分批写入降低单事务压力（移动端更稳）
      const table = (db as unknown as Record<string, {
        bulkPut: (r: AnyRow[]) => Promise<void>
        clear: () => Promise<void>
      }>)[name]
      // 还原语义：先清空目标表再写入，确保「备份是唯一真值」。
      // 否则新站首次打开会补 9 天基线种子（ensureCheckinMigrated），合并导入会让打卡天数
      // 被种子污染（多算/错算）。导入前已自动生成静默备份（exportBackupSilent），可回滚。
      await table.clear()
      if (name === 'media' && deduped.length > 5) {
        for (let i = 0; i < deduped.length; i += 5) {
          await table.bulkPut(deduped.slice(i, i + 5))
        }
      } else if (deduped.length) {
        await table.bulkPut(deduped)
      }
    } catch (e) {
      console.error('[备份导入] 表写入失败:', name, e)
      failed.push(name)
    }
  }
  // 刷新各 store（含小账与倒数日）
  useAppStore.getState().bumpDataEpoch()
  useRecordStore.getState().load()
  usePetStore.getState().load()
  useTodoStore.getState().load()
  useDiaryStore.getState().load()
  useMomentsStore.getState().load()
  useSparkStore.getState().load()
  useFinanceStore.getState().load()
  useCycleStore.getState().load()
  useShoppingStore.getState().load()
  const { useCountdownStore } = await import('../stores/useCountdownStore')
  useCountdownStore.getState().load()
  const { useBookStore } = await import('../stores/useBookStore')
  useBookStore.getState().load()
  const { useAccountStore } = await import('../stores/useAccountStore')
  useAccountStore.getState().load()
  const { useCategoryStore } = await import('../stores/useCategoryStore')
  useCategoryStore.getState().load()
  const { useBudgetStore } = await import('../stores/useBudgetStore')
  useBudgetStore.getState().load()
  const { useWujiStore } = await import('../stores/useWujiStore')
  useWujiStore.getState().load()
  void (await import('../services/media')).purgeOrphanMedia()
  // 自定义主题随备份导入后，刷新内存注册表（否则切换主题时 getSkin 找不到导入的自定义皮肤）
  const { loadCustomSkins } = await import('../services/customSkins')
  await loadCustomSkins()
  // 设置表（含主题 skin/mode）已随备份导入，立即重载 settings store 让主题即时生效，
  // 避免导入后需手动重启才看到原主题。
  await useSettingsStore.getState().load()
  return failed
}

export async function storageUsage(): Promise<{ count: number; bytes: number }> {
  let count = 0
  let bytes = 0
  for (const name of TABLE_NAMES) {
    const rows = (await (db as unknown as Record<string, { toArray: () => Promise<AnyRow[]> }>)[name].toArray()) as AnyRow[]
    count += rows.length
    for (const r of rows) {
      if (r.blob && r.blob instanceof Blob) bytes += r.blob.size
      if (typeof r.size === 'number') bytes += r.size
    }
  }
  return { count, bytes }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
