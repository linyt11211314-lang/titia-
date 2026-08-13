import { create } from 'zustand'
import { vaultMetaRepo, vaultItemRepo } from '../db/repos'
import type { VaultItemEntity, VaultMetaEntity } from '../db/types'
import { createVaultMeta, decryptSecret, encryptSecret, verifyMaster, verifyMasterDetailed, type VaultMetaSeed } from '../services/vault'
import { useAppStore } from './useAppStore'

// Titia 时序 · 密码箱 store
// 会话密钥（CryptoKey）只存在于内存，不进 state、不落库；锁定即清空。

export interface VaultItemView {
  id: string
  name: string
  account: string
  secret: string // 明文（仅解锁后在内存中）
  note?: string
}

export interface VaultDraft {
  name: string
  account: string
  secret: string
  note?: string
}

let sessionKey: CryptoKey | null = null

// 损坏提示「已关闭」持久化：记录关闭时的损坏数量；
// 同一数量不再打扰（可手动关闭），数量变化（新增损坏）时重新提醒。
const VAULT_DAMAGED_DISMISS_KEY = 'titia.vault.damagedDismissed'

function readDismissedDamaged(): number {
  try {
    const v = Number(localStorage.getItem(VAULT_DAMAGED_DISMISS_KEY))
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}

/** 当前损坏数量是否应显示提示（未关闭过，或与上次关闭时的数量不同） */
function shouldShowDamagedHint(failed: number): boolean {
  if (failed <= 0) return false
  return readDismissedDamaged() !== failed
}

interface VaultState {
  hasVault: boolean
  unlocked: boolean
  items: VaultItemView[]
  loaded: boolean
  /** 无法解密的记录数（密文损坏/旧格式；数据保留在库，仅跳过展示） */
  damagedCount: number
  /** 当前损坏数量对应的提示已被用户手动关闭 */
  damagedDismissed: boolean
  init: () => Promise<void>
  setup: (master: string) => Promise<void>
  unlock: (master: string) => Promise<boolean>
  lock: () => void
  add: (d: VaultDraft) => Promise<void>
  update: (id: string, d: VaultDraft) => Promise<void>
  remove: (id: string) => Promise<void>
  /** 手动关闭损坏提示（按当前损坏数量持久化，仅影响密码箱自身提示） */
  dismissDamagedHint: () => void
}

// 逐条解密；单条密文损坏/旧格式不影响其余条目。返回成功条目 + 损坏数量。
async function loadItems(key: CryptoKey): Promise<{ items: VaultItemView[]; failed: number }> {
  const rows = (await vaultItemRepo.query()) as VaultItemEntity[]
  const out: VaultItemView[] = []
  let failed = 0
  for (const r of rows) {
    try {
      out.push({
        id: r.id,
        name: r.name,
        account: r.account,
        secret: await decryptSecret(key, r.secret),
        note: r.note,
      })
    } catch {
      failed++
      console.warn('[vault] 记录无法解密（密文可能损坏），已跳过：', r.name || r.id)
    }
  }
  return { items: out, failed }
}

// 兼容读取：优先 IndexedDB vaultMeta；若不存在，检测旧版本可能遗留的 localStorage 字段（仅记录，不解密）
async function readVaultMetaCompat(): Promise<VaultMetaEntity | undefined> {
  const meta = (await vaultMetaRepo.get('meta')) as VaultMetaEntity | undefined
  if (meta) return meta
  try {
    for (const k of ['titia.vault.masterPassword', 'masterPassword', 'vaultPassword', 'titia.vault.password']) {
      const raw = localStorage.getItem(k)
      if (raw) {
        // 旧字段为明文/哈希，无法直接转换为 verifier；记录并提示，避免误判"数据丢失"
        console.warn('[vault] 检测到旧版 localStorage 密码字段，无法用于解锁现有数据：', k)
      }
    }
  } catch {
    /* 忽略 */
  }
  return undefined
}

export const useVaultStore = create<VaultState>((set) => ({
  hasVault: false,
  unlocked: false,
  items: [],
  loaded: false,
  damagedCount: 0,
  damagedDismissed: false,

  init: async () => {
    const meta = await readVaultMetaCompat()
    set({ hasVault: !!meta, loaded: true })
  },

  setup: async (master) => {
    // 统一 trim：避免首尾空格导致后续解锁验证失败（新创建以 trim 后为准）
    const m = master.trim()
    const seed = await createVaultMeta(m)
    await vaultMetaRepo.create({ id: 'meta', ...seed } as Partial<VaultMetaEntity>)
    sessionKey = await verifyMaster(seed as VaultMetaSeed, m)
    set({ hasVault: true, unlocked: true, items: [], damagedCount: 0, damagedDismissed: false })
    useAppStore.getState().bumpDataEpoch()
  },

  unlock: async (master) => {
    let meta: VaultMetaEntity | undefined
    try {
      meta = await readVaultMetaCompat()
    } catch (e) {
      console.warn('[vault] 解锁失败：读取密码元数据异常', e)
      return false
    }
    if (!meta) {
      console.warn('[vault] 解锁失败：vaultMeta 不存在（密码箱未创建或数据缺失）')
      return false
    }
    // 先原样校验（兼容历史数据可能含首尾空格），失败再用 trim 后的（新数据统一 trim）
    let r = await verifyMasterDetailed({ salt: meta.salt, iterations: meta.iterations, verifier: meta.verifier }, master)
    if (!r.key && master !== master.trim()) {
      const r2 = await verifyMasterDetailed({ salt: meta.salt, iterations: meta.iterations, verifier: meta.verifier }, master.trim())
      if (r2.key) r = r2
    }
    if (!r.key) {
      // 详细错误原因输出（便于排查）
      console.warn('[vault] 解锁失败：', r.reason)
      return false
    }
    // 加载账号列表：逐条容错——损坏条目跳过但不阻断解锁（保持主密码可访问）
    let items: VaultItemView[] = []
    let failed = 0
    try {
      const res = await loadItems(r.key)
      items = res.items
      failed = res.failed
    } catch (e) {
      console.warn('[vault] 加载账号列表失败（数据可能损坏，已忽略以保持主密码可访问）：', e)
    }
    sessionKey = r.key
    set({ unlocked: true, items, damagedCount: failed, damagedDismissed: !shouldShowDamagedHint(failed) })
    if (failed > 0 && shouldShowDamagedHint(failed)) {
      // 记录完整性提示：有 N 条记录无法解密（密文损坏/旧格式）——不删除，保留在库
      console.warn(`[vault] 有 ${failed} 条记录无法解密（已跳过展示，数据保留在库）`)
    }
    return true
  },

  lock: () => {
    sessionKey = null
    set({ unlocked: false, items: [], damagedCount: 0 })
  },

  add: async (d) => {
    if (!sessionKey) return
    const secret = await encryptSecret(sessionKey, d.secret)
    await vaultItemRepo.create({ name: d.name, account: d.account, secret, note: d.note } as Partial<VaultItemEntity>)
    const res = await loadItems(sessionKey)
    set({ items: res.items, damagedCount: res.failed, damagedDismissed: !shouldShowDamagedHint(res.failed) })
    useAppStore.getState().bumpDataEpoch()
  },

  update: async (id, d) => {
    if (!sessionKey) return
    const secret = await encryptSecret(sessionKey, d.secret)
    await vaultItemRepo.update(id, { name: d.name, account: d.account, secret, note: d.note } as Partial<VaultItemEntity>)
    const res = await loadItems(sessionKey)
    set({ items: res.items, damagedCount: res.failed, damagedDismissed: !shouldShowDamagedHint(res.failed) })
    useAppStore.getState().bumpDataEpoch()
  },

  remove: async (id) => {
    await vaultItemRepo.remove(id)
    if (sessionKey) {
      const res = await loadItems(sessionKey)
      set({ items: res.items, damagedCount: res.failed, damagedDismissed: !shouldShowDamagedHint(res.failed) })
    }
  },

  dismissDamagedHint: () => {
    set((s) => {
      try {
        localStorage.setItem(VAULT_DAMAGED_DISMISS_KEY, String(s.damagedCount))
      } catch {
        /* 忽略（隐私模式等） */
      }
      return { damagedDismissed: true }
    })
  },
}))
