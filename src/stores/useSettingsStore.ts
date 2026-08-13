import { create } from 'zustand'
import { getSettingsRows, createSettingsRow, updateSettingsRow } from '../services/dataService'
import type { SettingsEntity, BaseEntity } from '../db/types'

// Titia 时序 · 应用设置 store
// settings 表只保留单行（固定 id 'default'）。
// theme 字段：skin(皮肤 id) / mode(浅色|深色)；app 字段：firstDayOfWeek / hapticEnabled / reminderMode。
// 注意：本 store 走全局单例，组件内通过 hook 订阅即可在修改后自动重渲染。
// 数据访问统一经 DataService（Local First + Sync Ready 架构）。

const DEFAULT_ID = 'default'

// 启动早期快照：强制刷新前 forceAppUpdate 会把当前 skin 写入 localStorage('titia.theme')。
// 用作 store 初始值，使 React 首帧即恢复皮肤，避免「重载瞬间 applySkin 默认皮肤」的闪白/回退观感。
function initialSkinFromSnapshot(): string {
  try {
    const snap = JSON.parse(localStorage.getItem('titia.theme') || 'null')
    if (snap && typeof snap.skin === 'string' && snap.skin) return snap.skin
  } catch {
    /* 忽略损坏的快照 */
  }
  return 'sweetcool'
}

interface SettingsState {
  loaded: boolean
  entity: SettingsEntity | null
  skin: string
  hapticEnabled: boolean
  reminderOn: boolean
  /** 默认扣款账户名（'' = 未设置） */
  defaultAccount: string
  /** 自动归类：AI 识别兜底（默认开） */
  aiAutoCategory: boolean
  /** 自动归类：规则优先于 AI（默认开） */
  ruleFirst: boolean
  /** 多笔识别：仅识别实付款（默认关） */
  captureOnlyRealPay: boolean
  /** 多笔识别：忽略物流单号（默认开） */
  captureIgnoreLogistics: boolean
  load: () => Promise<void>
  setSkin: (skinId: string) => Promise<void>
  patchApp: (patch: Partial<SettingsEntity['app']>) => Promise<void>
}

// 并发保护：App 启动时 load() 可能被并发触发（React 严格模式的双调用、多处初始化）。
// 没有它的时候两次调用都会查到空表 → 各建一行 → settings 出现重复行；
// 再叠加 Repository.query() 结尾的 .reverse()（按主键倒序，而主键是随机 UUID），
// 读到哪一行完全随机 —— 表现就是「换了皮肤，重开 App 有时变回去」。
let inflight: Promise<SettingsEntity> | null = null

async function ensureRow(): Promise<SettingsEntity> {
  if (inflight) return inflight
  inflight = (async () => {
    const rows = (await getSettingsRows()) as SettingsEntity[]

    // 自愈：清理历史竞态留下的重复行。保留 updatedAt 最新的那行——
    // 它才是用户最后一次真实修改，其余软删（不物理删，数据可回溯）。
    if (rows.length > 1) {
      const [keep, ...dups] = [...rows].sort((a, b) => b.updatedAt - a.updatedAt)
      for (const d of dups) await updateSettingsRow(d.id, { deletedAt: Date.now() } as Partial<SettingsEntity>)
      return keep
    }
    if (rows[0]) return rows[0]

    // 显式指定固定主键，让这张表在主键层面就不可能出现第二行
    return createSettingsRow({
      id: DEFAULT_ID,
      profile: {},
      theme: { skin: 'sweetcool', mode: 'light' },
      app: { firstDayOfWeek: 1, hapticEnabled: true, reminderMode: 'on', captureOnlyRealPay: false, captureIgnoreLogistics: true },
      schemaVersion: 1,
    } as Omit<SettingsEntity, keyof BaseEntity> & { id: string })
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loaded: false,
  entity: null,
  skin: initialSkinFromSnapshot(),
  hapticEnabled: true,
  reminderOn: true,
  defaultAccount: '',
  aiAutoCategory: true,
  ruleFirst: true,
  captureOnlyRealPay: false,
  captureIgnoreLogistics: true,

  load: async () => {
    const entity = await ensureRow()
    set({
      entity,
      loaded: true,
      skin: entity.theme.skin,
      hapticEnabled: entity.app.hapticEnabled,
      reminderOn: entity.app.reminderMode !== 'off',
      defaultAccount: entity.app.defaultAccount ?? '',
      aiAutoCategory: entity.app.aiAutoCategory ?? true,
      ruleFirst: entity.app.ruleFirst ?? true,
      captureOnlyRealPay: entity.app.captureOnlyRealPay ?? false,
      captureIgnoreLogistics: entity.app.captureIgnoreLogistics ?? true,
    })
  },

  setSkin: async (skinId) => {
    const entity = get().entity
    if (!entity) return
    const nextTheme = { ...entity.theme, skin: skinId }
    await updateSettingsRow(entity.id, { theme: nextTheme } as Partial<SettingsEntity>)
    set({ entity: { ...entity, theme: nextTheme }, skin: skinId })
  },

  patchApp: async (patch) => {
    const entity = get().entity
    if (!entity) return
    const nextApp = { ...entity.app, ...patch }
    await updateSettingsRow(entity.id, { app: nextApp } as Partial<SettingsEntity>)
    set({
      entity: { ...entity, app: nextApp },
      hapticEnabled: nextApp.hapticEnabled,
      reminderOn: nextApp.reminderMode !== 'off',
      defaultAccount: nextApp.defaultAccount ?? '',
      aiAutoCategory: nextApp.aiAutoCategory ?? true,
      ruleFirst: nextApp.ruleFirst ?? true,
      captureOnlyRealPay: nextApp.captureOnlyRealPay ?? false,
      captureIgnoreLogistics: nextApp.captureIgnoreLogistics ?? true,
    })
  },
}))

export { DEFAULT_ID }
