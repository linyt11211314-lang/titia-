// Titia 时序 · DataService 统一数据访问层（Local First + Sync Ready）
//
// 架构：
//   页面/Store → DataService → IndexedDB(Repository) → SyncService → 云端数据库（未来）
//
// 铁律（需求文档）：
//   - 页面组件禁止直接读写存储（IndexedDB / localStorage），一切经 DataService；
//   - 所有记账操作（Safari 与 PWA 两个入口）必须经过本层 → 保证同一套数据体系；
//   - 当前阶段本地存储优先，不接任何云 API；
//   - 不改变字段含义 / 不改变业务逻辑 / 不创建第二套数据结构（仅转发 Repository）。
//
// 数据表：transactions(账单) / rules(识别规则) / accounts(账户) / categories(分类)
//        / budgets(预算) / settings(设置单行)
// 跨容器桥：Safari ↔ PWA 的 localStorage 通道统一由本层读写（页面不直接接触）。
// 写操作统一调用 syncService.markDirty 预留未来同步队列。

import {
  transactionRepo,
  ruleRepo,
  accountRepo,
  categoryRepo,
  budgetRepo,
  settingsRepo,
} from '../db/repos'
import type {
  TransactionEntity,
  RuleEntity,
  AccountEntity,
  CategoryEntity,
  BudgetEntity,
  SettingsEntity,
  BaseEntity,
} from '../db/types'
import { syncService, type SyncOp } from './syncService'

// ── 数据变化通知（UI 刷新机制，不改动数据体系） ──
// DataService 的账单写操作（saveBill/updateBill/removeBill）与跨容器桥合并成功后，
// 统一触发该事件；账单页面/store 监听后重新拉取数据刷新列表。
export const BILL_CHANGED_EVENT = 'titia:billChanged'

function emitBillChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(BILL_CHANGED_EVENT))
  } catch {
    /* 非浏览器环境（SSR/测试）静默 */
  }
}

// 输入类型与 Repository.create 契约一致（Partial + BaseEntity 可注入字段）
type BillInput = Partial<Omit<TransactionEntity, keyof BaseEntity>> & Partial<BaseEntity>
type RuleInput = Partial<Omit<RuleEntity, keyof BaseEntity>> & Partial<BaseEntity>
type AccountInput = Partial<Omit<AccountEntity, keyof BaseEntity>> & Partial<BaseEntity>
type CategoryInput = Partial<Omit<CategoryEntity, keyof BaseEntity>> & Partial<BaseEntity>
type BudgetInput = Partial<Omit<BudgetEntity, keyof BaseEntity>> & Partial<BaseEntity>
type SettingsInput = Partial<Omit<SettingsEntity, keyof BaseEntity>> & Partial<BaseEntity>

function mark(table: string, id: string, op: SyncOp): void {
  syncService.markDirty(table, id, op)
}

// ═══════════ 账单 bills（transactions 表；金额一律「分」） ═══════════

export async function saveBill(d: BillInput): Promise<TransactionEntity> {
  const tx = await transactionRepo.create(d)
  mark('transactions', tx.id, 'create')
  emitBillChanged()
  return tx
}

export async function getBills(): Promise<TransactionEntity[]> {
  return (await transactionRepo.query()) as TransactionEntity[]
}

export async function updateBill(id: string, patch: Partial<TransactionEntity>): Promise<void> {
  await transactionRepo.update(id, patch)
  mark('transactions', id, 'update')
  emitBillChanged()
}

export async function removeBill(id: string): Promise<void> {
  await transactionRepo.remove(id)
  mark('transactions', id, 'remove')
  emitBillChanged()
}

// ═══════════ 识别规则 rules（自动记账学习库，小账内部数据） ═══════════

export async function saveRule(d: RuleInput): Promise<RuleEntity> {
  const r = await ruleRepo.create(d)
  mark('rules', r.id, 'create')
  return r
}

export async function getRules(): Promise<RuleEntity[]> {
  return (await ruleRepo.query()) as RuleEntity[]
}

export async function updateRule(id: string, patch: Partial<RuleEntity>): Promise<void> {
  await ruleRepo.update(id, patch)
  mark('rules', id, 'update')
}

export async function removeRule(id: string): Promise<void> {
  await ruleRepo.remove(id)
  mark('rules', id, 'remove')
}

/** 批量写入规则（首次预置系统默认规则库用；覆盖同 id 行） */
export async function bulkPutRules(rows: RuleEntity[]): Promise<void> {
  await ruleRepo.bulkPut(rows)
}

// ═══════════ 账户 accounts ═══════════

export async function saveAccount(d: AccountInput): Promise<AccountEntity> {
  const a = await accountRepo.create(d)
  mark('accounts', a.id, 'create')
  return a
}

export async function getAccounts(): Promise<AccountEntity[]> {
  return (await accountRepo.query()) as AccountEntity[]
}

export async function updateAccount(id: string, patch: Partial<AccountEntity>): Promise<void> {
  await accountRepo.update(id, patch)
  mark('accounts', id, 'update')
}

export async function removeAccount(id: string): Promise<void> {
  await accountRepo.remove(id)
  mark('accounts', id, 'remove')
}

/** 批量写入账户（首次预置常用账户用） */
export async function bulkPutAccounts(rows: AccountEntity[]): Promise<void> {
  await accountRepo.bulkPut(rows)
}

// ═══════════ 分类 categories ═══════════

export async function saveCategory(d: CategoryInput): Promise<CategoryEntity> {
  const c = await categoryRepo.create(d)
  mark('categories', c.id, 'create')
  return c
}

export async function getCategories(): Promise<CategoryEntity[]> {
  return (await categoryRepo.query()) as CategoryEntity[]
}

export async function updateCategory(id: string, patch: Partial<CategoryEntity>): Promise<void> {
  await categoryRepo.update(id, patch)
  mark('categories', id, 'update')
}

export async function removeCategory(id: string): Promise<void> {
  await categoryRepo.remove(id)
  mark('categories', id, 'remove')
}

/** 批量写入分类（首次预置分类体系 / 旧体系替换用） */
export async function bulkPutCategories(rows: CategoryEntity[]): Promise<void> {
  await categoryRepo.bulkPut(rows)
}

/** 硬清空分类表（重置为预设前调用，物理删除全部行） */
export async function clearCategories(): Promise<void> {
  await categoryRepo.clear()
}

// ═══════════ 预算 budgets ═══════════

export async function saveBudget(d: BudgetInput): Promise<BudgetEntity> {
  const b = await budgetRepo.create(d)
  mark('budgets', b.id, 'create')
  return b
}

export async function getBudgets(): Promise<BudgetEntity[]> {
  return (await budgetRepo.query()) as BudgetEntity[]
}

export async function updateBudget(id: string, patch: Partial<BudgetEntity>): Promise<void> {
  await budgetRepo.update(id, patch)
  mark('budgets', id, 'update')
}

export async function removeBudget(id: string): Promise<void> {
  await budgetRepo.remove(id)
  mark('budgets', id, 'remove')
}

// ═══════════ 设置 settings（单行，固定 id 'default'） ═══════════

export async function getSettingsRows(): Promise<SettingsEntity[]> {
  return (await settingsRepo.query()) as SettingsEntity[]
}

export async function createSettingsRow(d: SettingsInput): Promise<SettingsEntity> {
  return settingsRepo.create(d)
}

export async function updateSettingsRow(id: string, patch: Partial<SettingsEntity>): Promise<void> {
  await settingsRepo.update(id, patch)
  mark('settings', id, 'update')
}

// ═══════════ 跨容器桥（Safari ↔ PWA 数据同步通道，统一经 DataService） ═══════════
// 背景：iOS 上 Safari 浏览器与「添加到主屏幕」的 PWA 可能各自持有独立的 IndexedDB，
// 但共享 localStorage。因此跨容器同步走 localStorage 通道：
//   容器 A 保存账单 → queuePendingBill 写入桥 → 容器 B 打开/下拉刷新 → mergePendingBills 合并入库。
// 页面组件禁止直接 touch localStorage，统一走以下 API。

const PENDING_TX_KEY = 'titia.pendingTx'
const EDIT_TX_KEY = 'titia.editTxId'

/** 把一笔账单写入跨容器桥（Safari 侧保存后供 PWA 合并；失败静默，不阻塞保存） */
export function queuePendingBill(tx: TransactionEntity): void {
  try {
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify(tx))
  } catch {
    /* 忽略：非共享环境（如桌面）静默 */
  }
}

/** 读取并清除桥上的待合并账单（无则 null） */
export function takePendingBill(): TransactionEntity | null {
  try {
    const raw = localStorage.getItem(PENDING_TX_KEY)
    if (!raw) return null
    const tx = JSON.parse(raw) as TransactionEntity
    if (!tx || !tx.id) return null
    localStorage.removeItem(PENDING_TX_KEY)
    return tx
  } catch {
    return null
  }
}

/** 合并跨容器桥上的待同步账单到 IndexedDB（按 id 去重；供 App 启动 / 下拉刷新 / 前台切换调用） */
export async function mergePendingBills(): Promise<number> {
  const tx = takePendingBill()
  if (!tx) return 0
  const existing = await transactionRepo.get(tx.id)
  if (!existing) {
    await transactionRepo.create(tx as unknown as BillInput)
    mark('transactions', tx.id, 'create')
    emitBillChanged()
    return 1
  }
  return 0
}

/** 标记一笔账单「保存后进入编辑页」（一键拾光 → 小账编辑联动） */
export function markEditBill(id: string): void {
  try {
    localStorage.setItem(EDIT_TX_KEY, id)
  } catch {
    /* 忽略 */
  }
}

/** 读取并清除「保存后进入编辑页」标记（无则 null） */
export function takeEditBillId(): string | null {
  try {
    const id = localStorage.getItem(EDIT_TX_KEY)
    if (!id) return null
    localStorage.removeItem(EDIT_TX_KEY)
    return id
  } catch {
    return null
  }
}
