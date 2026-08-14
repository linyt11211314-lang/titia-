// Titia 时序 · 云同步（Supabase 版）
// 浏览器 → Supabase REST API（自带 CORS，无需 Worker 代理）
// 配置：Supabase Project URL + anon key

import { db } from '../db/schema'
import { useAppStore } from '../stores/useAppStore'
import { useRecordStore } from '../stores/useRecordStore'
import { usePetStore } from '../stores/usePetStore'
import { useTodoStore } from '../stores/useTodoStore'
import { useDiaryStore } from '../stores/useDiaryStore'
import { useMomentsStore } from '../stores/useMomentsStore'
import { useSparkStore } from '../stores/useSparkStore'
import { useFinanceStore } from '../stores/useFinanceStore'
import { useCycleStore } from '../stores/useCycleStore'
import { useShoppingStore } from '../stores/useShoppingStore'

const CFG_KEY = 'titia.supabase.config'

export interface SupabaseConfig {
  url: string // https://xxx.supabase.co
  anonKey: string // eyJhbGciOi... (anon public key)
}

export interface BackupPayload {
  version: number
  exportedAt: number
  tables: Record<string, Array<Record<string, unknown>>>
}

export type SyncResult =
  | { status: 'ok'; pulled: number; pushed: number; at: number }
  | { status: 'no-config' }
  | { status: 'error'; message: string }

// ── 配置 ──
export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    return raw ? (JSON.parse(raw) as SupabaseConfig) : null
  } catch {
    return null
  }
}

export function setSupabaseConfig(cfg: SupabaseConfig) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
}

export function clearSupabaseConfig() {
  localStorage.removeItem(CFG_KEY)
}

// ── 序列化（复用 backup.ts 的表名与图片 base64 处理） ──
const TABLE_NAMES = [
  'records', 'pets', 'petHealth', 'people', 'todos', 'media',
  'settings', 'shopping', 'financeItems', 'cycles', 'vaultMeta', 'vaultItems',
  'countdownEvents',
  'transactions', 'rules', 'accounts', 'categories', 'budgets',
  'customSkins', 'presetSkins', 'auraHistory', 'checkin', 'wujiItems', 'sleep',
] as const

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

// 清理 row 中的非法 `tables` 字段（云端脏数据兜底，不污染本地 IDB）
function cleanRow<T extends Record<string, unknown>>(r: T): T {
  if ('tables' in r) {
    const { tables: _drop, ...rest } = r
    return rest as T
  }
  return r
}

async function dumpLocal(): Promise<BackupPayload> {
  const out: BackupPayload = { version: 1, exportedAt: Date.now(), tables: {} }
  for (const name of TABLE_NAMES) {
    const table = db[name as keyof typeof db] as unknown as { toArray: () => Promise<Array<Record<string, unknown>>> }
    const rows = await table.toArray()
    out.tables[name] = await Promise.all(
      rows.map(async (r) => {
        if (name === 'media') {
          const row = { ...r }
          if (row.blob instanceof Blob) row.blob = await blobToBase64(row.blob as Blob)
          if (row.thumb instanceof Blob) row.thumb = await blobToBase64(row.thumb as Blob)
          r = row
        } else {
          r = cleanRow(r)
        }
        return r
      }),
    )
  }
  return out
}

async function applyPayload(data: BackupPayload): Promise<number> {
  let written = 0
  for (const name of TABLE_NAMES) {
    const rows = data.tables?.[name] || []
    const fixed = rows.map((r) => { r = cleanRow(r);
      if (name === 'media') {
        const row = { ...r }
        if (typeof row.blob === 'string') row.blob = base64ToBlob(row.blob, (row.mime as string) || 'image/jpeg')
        if (typeof row.thumb === 'string') row.thumb = base64ToBlob(row.thumb, (row.mime as string) || 'image/jpeg')
        r = row
      }
      return r
    })
    if (fixed.length) {
      const table = db[name as keyof typeof db] as unknown as { bulkPut: (r: unknown[]) => Promise<void> }
      await table.bulkPut(fixed)
      written += fixed.length
    }
  }
  return written
}

// ── 双向合并（row 级，id 相同取 updatedAt 较新） ──
export function mergePayloads(local: BackupPayload, cloud: BackupPayload): { merged: BackupPayload; conflicts: number } {
  const merged: BackupPayload = { version: 1, exportedAt: Date.now(), tables: {} }
  let conflicts = 0
  for (const name of TABLE_NAMES) {
    const l = local.tables[name] || []
    const c = cloud.tables[name] || []
    const map = new Map<string, Record<string, unknown>>()
    for (const row of l) { const r = cleanRow(row); map.set(r.id as string, r) }
    for (const row of c) { const rowC = cleanRow(row);
      const id = rowC.id as string
      const ex = map.get(id)
      if (ex) {
        const lAt = (ex.updatedAt as number) || 0
        const cAt = (row.updatedAt as number) || 0
        if (cAt > lAt) {
          map.set(id, rowC)
          if (cAt > lAt) conflicts++
        }
      } else {
        map.set(id, rowC)
      }
    }
    merged.tables[name] = [...map.values()]
  }
  return { merged, conflicts }
}

// ── Supabase REST API 封装 ──
const ROW_ID = 1 // 单行存储

async function sbGet(cfg: SupabaseConfig): Promise<BackupPayload | null> {
  const url = `${cfg.url.replace(/\/+$/, '')}/rest/v1/sync?select=data&id=eq.${ROW_ID}&limit=1`
  const r = await fetch(url, {
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
  })
  if (r.status === 404 || r.status === 406) return null
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Supabase GET ${r.status}: ${text.slice(0, 200)}`)
  }
  const arr = (await r.json()) as Array<{ data: BackupPayload }>
  return arr[0]?.data ?? null
}

async function sbPut(cfg: SupabaseConfig, data: BackupPayload): Promise<void> {
  // PostgREST upsert 官方语法：
  //   POST /rest/v1/sync?on_conflict=id   ← 指定冲突列
  //   Prefer: resolution=merge-duplicates  ← 复数！漏了 s 会被当普通 INSERT → 23505
  const url = `${cfg.url.replace(/\/+$/, '')}/rest/v1/sync?on_conflict=id`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([{ id: ROW_ID, data }]),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Supabase PUT ${r.status}: ${text.slice(0, 200)}`)
  }
}

// ── 同步主流程：拉取 → 双向合并 → 写本地 → 重新上传（收敛） ──
export async function syncNow(): Promise<SyncResult> {
  const cfg = getSupabaseConfig()
  if (!cfg) return { status: 'no-config' }

  try {
    // 1. 拉云端
    let cloud: BackupPayload | null = null
    try {
      cloud = await sbGet(cfg)
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? `云端读取失败：${e.message}` : '云端读取失败' }
    }

    // 2. 本地 dump
    const local = await dumpLocal()

    // 3. 双向合并
    const { merged, conflicts } = cloud ? mergePayloads(local, cloud) : { merged: local, conflicts: 0 }

    // 4. 写本地
    const written = await applyPayload(merged)

    // 5. 上传合并结果
    try {
      await sbPut(cfg, merged)
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? `云端上传失败：${e.message}` : '云端上传失败' }
    }

    // 6. 刷新 store
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
    void (await import('../services/media')).purgeOrphanMedia()
    // 自定义主题随同步合并写回本地后，刷新内存注册表
    const { loadCustomSkins } = await import('../services/customSkins')
    await loadCustomSkins()

    return { status: 'ok', pulled: cloud ? conflicts : 0, pushed: written, at: Date.now() }
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : '同步失败' }
  }
}
