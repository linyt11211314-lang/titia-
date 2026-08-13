import { create } from 'zustand'
import {
  getBills,
  getRules,
  saveBill,
  updateBill,
  removeBill,
  saveRule,
  updateRule,
  bulkPutRules,
  getAccounts,
  updateAccount,
  BILL_CHANGED_EVENT,
} from '../services/dataService'
import type { TransactionEntity, RuleEntity } from '../db/types'
import { useAppStore } from './useAppStore'
import { useAccountStore } from './useAccountStore'
import { mediaRepo } from '../db/repos'
import { extractOrderId } from '../services/billRules'
import { DUP } from '../config/aiRules'

// Titia 时序 · 自动记账 store（transactions + rules）
// 规则识别：关键词包含匹配 → 预填分类/账户；保存未命中时自动学习沉淀规则（学习闭环）。

// ── UI 刷新机制：监听数据变化事件 → 重新拉取账单列表 ──
// 同一容器内 DataService 写操作（saveBill/updateBill/removeBill）与跨容器桥合并都会触发
// billChanged；store 收到后重新 getBills() 刷新内存，页面经订阅自动重渲染（无需手动刷新）。
let changeSubscribed = false
function ensureBillChangeSubscription(): void {
  if (changeSubscribed || typeof window === 'undefined') return
  changeSubscribed = true
  window.addEventListener(BILL_CHANGED_EVENT, () => {
    if (useBookStore.getState().loaded) void useBookStore.getState().load()
  })
}
ensureBillChangeSubscription()

export interface BookDraft {
  amount: number // 分
  txType?: 'expense' | 'income' | 'transfer'
  transferTo?: string
  merchant?: string
  category?: string
  account?: string
  time: string
  note?: string
  source?: TransactionEntity['source']
  /** 自动归类引擎来源（规则命中 / AI 识别） */
  autoSource?: 'rule' | 'ai'
  /** 图片附件（支付截图等）：media 表 id 列表 */
  mediaIds?: string[]
  /** 静默导入：不联动账户余额（导入历史交易用，避免双倍累加） */
  silent?: boolean
}

interface BookState {
  transactions: TransactionEntity[]
  rules: RuleEntity[]
  loaded: boolean
  load: () => Promise<void>
  add: (d: BookDraft) => Promise<TransactionEntity>
  update: (id: string, patch: Partial<TransactionEntity>) => Promise<void>
  remove: (id: string) => Promise<void>
  /** 重复检测（需求五）：按 金额+交易对象+时间+账户 组合查找疑似重复账单 */
  findDuplicate: (d: BookDraft) => TransactionEntity | null
  /** 关键词/交易方命中规则（按优先级/命中次数；keyword 与 merchant 任一命中即算） */
  matchRule: (keyword: string, merchant?: string) => RuleEntity | null
  /** 学习闭环：确认交易后沉淀规则（已有关键词更新映射，否则新建） */
  learn: (keyword: string, merchant?: string, category?: string, account?: string) => Promise<void>
  /** 规则管理：新增 / 编辑 / 删除（同步内存，供识别规则管理 UI 使用） */
  saveRule: (input: Partial<RuleEntity>) => Promise<RuleEntity>
  updateRule: (id: string, patch: Partial<RuleEntity>) => Promise<void>
  removeRule: (id: string) => Promise<void>
}

// 规则匹配：keyword 双向包含 或 merchant 双向包含 → 任一命中；优先 priority 降序，再按 hitCount 降序
export function matchRuleByKeyword(
  keyword: string,
  merchant: string | undefined,
  rules: RuleEntity[],
): RuleEntity | null {
  const k = (keyword || '').trim()
  const m = (merchant || '').trim()
  if (!k && !m) return null
  const hit = rules.filter((r) => {
    if (k && (k.includes(r.keyword) || r.keyword.includes(k))) return true
    if (m && r.merchant && (m.includes(r.merchant) || r.merchant.includes(m))) return true
    return false
  })
  if (hit.length === 0) return null
  return hit.sort((a, b) => b.priority - a.priority || b.hitCount - a.hitCount)[0]
}

// 账单流水 → 账户余额同步（支出→余额减少、收入→增加、转账→转出减转入加）
// sign=1 应用流水（新增）；sign=-1 回滚流水（删除/编辑回滚）
// 类型推导：优先用 txType；旧数据无 txType 时按金额符号推导（<0 收入、≥0 支出），
// 与页面 txTypeOf 一致，避免旧收入记录被误判为支出导致余额扣错。
async function applyBalance(tx: TransactionEntity, sign: 1 | -1): Promise<void> {
  const acc = useAccountStore.getState()
  const delta = (base: number | undefined, d: number) => Math.round((base ?? 0) + d)
  const effType = tx.txType ?? (tx.amount < 0 ? 'income' : 'expense')
  if (effType === 'transfer' && tx.transferTo && tx.account) {
    const from = acc.accounts.find((a) => a.name === tx.account)
    const to = acc.accounts.find((a) => a.name === tx.transferTo)
    if (from) await acc.update(from.id, { balance: delta(from.balance, -Math.abs(tx.amount) * sign) })
    if (to) await acc.update(to.id, { balance: delta(to.balance, Math.abs(tx.amount) * sign) })
    return
  }
  if (tx.account) {
    const a = acc.accounts.find((x) => x.name === tx.account)
    if (!a) return
    const flow = effType === 'income' ? Math.abs(tx.amount) : -Math.abs(tx.amount)
    await acc.update(a.id, { balance: delta(a.balance, flow * sign) })
  }
}

// 一次性余额对账（修复「历史收入未入账」）。
// 设计约束：账户「余额」= 期初本金（用户手填）+ 流水联动结果；支出/转账默认带账户会同步，
// 唯一漏算的是「历史收入」（旧版收入默认 account='' 未入账，或经 silent 导入跳过 applyBalance）。
// 安全原则：只增不减、保留期初本金、幂等。
//   - 对每个账户按全部流水算完整 target（支出 −、收入 +、转账 转出 −/转入 +）；
//   - 若 stored < target：说明是「流水派生型」账户且收入漏算 → 补到 target（仅增加，不抹期初）；
//   - 若 stored >= target：含期初本金或已正确 → 不动（绝不把用户手填的期初清零）；
//   - 跑完置 localStorage 守卫，每容器仅一次。
const BALANCE_RECONCILED_KEY = 'titia:balanceReconciled:v1'
export async function reconcileAccountBalances(): Promise<void> {
  try {
    if (localStorage.getItem(BALANCE_RECONCILED_KEY)) return
  } catch {
    /* 非浏览器环境跳过 */
  }
  try {
    const [txs, accs] = await Promise.all([getBills(), getAccounts()])
    const targets = new Map<string, number>()
    for (const a of accs) targets.set(a.name, 0)
    const apply = (name: string | undefined, d: number) => {
      if (!name) return
      targets.set(name, (targets.get(name) ?? 0) + d)
    }
    for (const t of txs as TransactionEntity[]) {
      const amt = Math.abs(t.amount)
      const effType = t.txType ?? (t.amount < 0 ? 'income' : 'expense')
      if (effType === 'transfer' && t.transferTo && t.account) {
        apply(t.account, -amt)
        apply(t.transferTo, amt)
      } else if (t.account) {
        apply(t.account, effType === 'income' ? amt : -amt)
      }
    }
    const accStore = useAccountStore.getState()
    for (const a of accs) {
      const stored = Math.round(a.balance ?? 0)
      const target = Math.round(targets.get(a.name) ?? 0)
      // 仅当 stored 低于完整流水目标时补差额（漏算的收入），绝不对高于目标的账户下手（保护期初本金）
      if (target > stored) {
        await accStore.update(a.id, { balance: target })
      }
    }
  } catch {
    /* 对账失败不影响正常记账 */
  } finally {
    try {
      localStorage.setItem(BALANCE_RECONCILED_KEY, '1')
    } catch {
      /* 忽略 */
    }
  }
}

// 系统默认规则库（用户指定 12 类分类体系 · src/config/aiRules.ts；priority 0 低于用户学习规则）
// 关键词精选每类代表商户，避免过泛词（如"转出/维修"）误匹配。
const DEFAULT_RULES: { keyword: string; category: string; merchant?: string }[] = [
  // 餐饮
  { keyword: '瑞幸', category: '餐饮' },
  { keyword: '星巴克', category: '餐饮' },
  { keyword: 'Manner', category: '餐饮' },
  { keyword: '库迪', category: '餐饮' },
  { keyword: '肯德基', category: '餐饮' },
  { keyword: '麦当劳', category: '餐饮' },
  { keyword: '汉堡王', category: '餐饮' },
  { keyword: '华莱士', category: '餐饮' },
  { keyword: '海底捞', category: '餐饮' },
  { keyword: '美团外卖', category: '餐饮', merchant: '美团外卖' },
  { keyword: '饿了么', category: '餐饮', merchant: '饿了么' },
  { keyword: '美团买菜', category: '餐饮', merchant: '美团买菜' },
  { keyword: '盒马', category: '餐饮' },
  { keyword: '奶茶', category: '餐饮' },
  // 交通
  { keyword: '滴滴', category: '交通' },
  { keyword: '高德', category: '交通' },
  { keyword: '地铁', category: '交通' },
  { keyword: '12306', category: '交通' },
  { keyword: '中石化', category: '交通' },
  { keyword: '中石油', category: '交通' },
  // 购物
  { keyword: '淘宝', category: '购物' },
  { keyword: '京东', category: '购物' },
  { keyword: '拼多多', category: '购物' },
  { keyword: '天猫', category: '购物' },
  // 居住
  { keyword: '自如', category: '居住' },
  { keyword: '房租', category: '居住' },
  // 娱乐
  { keyword: '电影', category: '娱乐' },
  { keyword: '携程', category: '娱乐' },
  { keyword: '健身', category: '娱乐' },
  // 通讯
  { keyword: '话费', category: '通讯' },
  { keyword: '宽带', category: '通讯' },
  // 医疗
  { keyword: '药店', category: '医疗' },
  { keyword: '医院', category: '医疗' },
  // 学习
  { keyword: '当当', category: '学习' },
  { keyword: '得到', category: '学习' },
  // 人情
  { keyword: '红包', category: '人情' },
  // 转账（不计消费）
  { keyword: '信用卡还款', category: '转账' },
  { keyword: '理财', category: '转账' },
  { keyword: '基金', category: '转账' },
  // 工资（收入类）
  { keyword: '工资', category: '工资' },
  { keyword: '薪资', category: '工资' },
  { keyword: '奖金', category: '工资' },
  // 收入兜底（Amazon 等平台收入）
  { keyword: '亚马逊', category: '工资', merchant: '亚马逊' },
  { keyword: 'Amazon', category: '工资', merchant: '亚马逊' },
]

export const useBookStore = create<BookState>((set, get) => ({
  transactions: [],
  rules: [],
  loaded: false,

  load: async () => {
    const [txs, rules] = await Promise.all([getBills(), getRules()])
    // 首次：预置系统默认规则（priority 0，用户学习规则 priority 1 优先）
    if (rules.length === 0) {
      const now = Date.now()
      const presets = DEFAULT_RULES.map((r, i) => ({
        id: crypto.randomUUID(),
        keyword: r.keyword,
        merchant: r.merchant,
        category: r.category,
        account: undefined,
        priority: 0,
        hitCount: 0,
        createdAt: now + i,
        updatedAt: now + i,
        deletedAt: null,
        _dirty: 1,
        _syncedAt: null,
      })) as unknown as RuleEntity[]
      await bulkPutRules(presets)
      set({
        transactions: txs.sort((a, b) => b.time.localeCompare(a.time)),
        rules: presets,
        loaded: true,
      })
      return
    }
    set({
      transactions: txs.sort((a, b) => b.time.localeCompare(a.time)),
      rules: rules.sort((a, b) => b.hitCount - a.hitCount),
      loaded: true,
    })
    // 启动后一次性校正历史账户余额（收入未入账修复）；失败不影响正常加载
    void reconcileAccountBalances()
  },

  add: async (d) => {
    const tx = await saveBill({
      amount: Math.round(d.amount),
      txType: d.txType,
      transferTo: d.transferTo || undefined,
      merchant: d.merchant || undefined,
      category: d.category || undefined,
      account: d.account || undefined,
      time: d.time,
      note: d.note || undefined,
      source: d.source ?? 'manual',
      autoSource: d.autoSource,
      mediaIds: d.mediaIds && d.mediaIds.length > 0 ? d.mediaIds : undefined,
    } as Omit<TransactionEntity, keyof TransactionEntity>)
    set((s) => ({ transactions: [tx, ...s.transactions] }))
    useAppStore.getState().bumpDataEpoch()
    if (!d.silent) await applyBalance(tx, 1) // 账单 → 账户余额同步（await：导入连续多条时严格串行落定，避免并发覆盖导致余额漏算）
    return tx
  },

  update: async (id, patch) => {
    const old = get().transactions.find((t) => t.id === id)
    await updateBill(id, patch)
    const merged = { ...(old ?? {}), ...patch } as TransactionEntity
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? merged : t)) }))
    useAppStore.getState().bumpDataEpoch()
    if (old) {
      // 标准流程（修复编辑账单余额错误）：① 撤销原影响 → ② 应用新影响
      // 必须串行 await：applyBalance 内部基于「当前 store 余额快照」计算 delta 并 set，
      // 若并发执行两次会读到同一旧快照、后写覆盖前写，导致撤销/应用其一被丢弃（尤其支出→收入切换时少加）。
      // 旧数据（w 轮之前未关联账户的历史收入）：old.account 为空时第一步 no-op（本就未影响过余额），
      // 第二步按 merged 账户联动，行为正确；若 old 已联动则正常撤销+应用，净效应正确。
      await applyBalance(old, -1)
      await applyBalance(merged, 1)
    }
  },

  remove: async (id) => {
    const old = get().transactions.find((t) => t.id === id)
    await removeBill(id)
    // 删除关联图片附件（需求八：避免孤立图片；一键拾光账单带支付截图）
    if (old?.mediaIds?.length) {
      try {
        await Promise.all(old.mediaIds.map((mid) => mediaRepo.remove(mid)))
      } catch {
        /* 附件删除失败不阻塞账单删除 */
      }
    }
    set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
    if (old) await applyBalance(old, -1) // 删除 → 回滚余额（支出恢复/收入扣除）
  },

  // 重复检测（用户规则）：金额(±0.01元) + 交易对象 + 时间差≤5分钟 + 账户，
  // 或备注含相同订单号/流水号 → 疑似重复；退款对冲（支出/收入同现）不判重。
  findDuplicate: (d) => {
    const amount = Math.abs(d.amount)
    const merchant = (d.merchant ?? '').trim()
    const account = d.account ?? ''
    const t = d.time ? Date.parse(d.time.replace('T', ' ')) : Date.now()
    const orderId = extractOrderId({ note: d.note, merchant: d.merchant } as TransactionEntity)
    if (!amount || !t) return null
    return (
      get().transactions.find((x) => {
        // 退款对冲：同商户但收支方向相反 → 不判重
        if ((x.amount > 0) !== (d.amount > 0) && (x.merchant ?? '').trim() === merchant) return false
        if (Math.abs(Math.abs(x.amount) - amount) > Math.round(DUP.amountTolerance * 100)) return false
        if (orderId && extractOrderId(x) === orderId) return true
        if ((x.merchant ?? '').trim() !== merchant) return false
        if ((x.account ?? '') !== account) return false
        const xt = Date.parse((x.time ?? '').replace('T', ' '))
        return Number.isFinite(xt) && Math.abs(xt - t) <= DUP.windowMinutes * 60_000
      }) ?? null
    )
  },

  matchRule: (keyword, merchant) => matchRuleByKeyword(keyword, merchant, get().rules),

  learn: async (keyword, merchant, category, account) => {
    const k = (keyword || '').trim()
    if (!k) return
    const existing = get().rules.find((r) => r.keyword === k)
    if (existing) {
      const patch: Partial<RuleEntity> = {
        hitCount: existing.hitCount + 1,
        priority: existing.priority,
      }
      if (merchant) patch.merchant = merchant
      if (category) patch.category = category
      if (account) patch.account = account
      await updateRule(existing.id, patch)
      set((s) => ({ rules: s.rules.map((r) => (r.id === existing.id ? { ...r, ...patch } : r)) }))
    } else {
      const rule = await saveRule({
        keyword: k,
        merchant: merchant || undefined,
        category: category || undefined,
        account: account || undefined,
        priority: 1,
        hitCount: 1,
      } as Omit<RuleEntity, keyof RuleEntity>)
      set((s) => ({ rules: [rule, ...s.rules] }))
    }
  },

  saveRule: async (input) => {
    const rule = await saveRule(input as Omit<RuleEntity, keyof RuleEntity>)
    set((s) => ({ rules: [rule, ...s.rules] }))
    return rule
  },

  updateRule: async (id, patch) => {
    await updateRule(id, patch)
    set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  },

  removeRule: async (id) => {
    await removeRule(id)
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }))
  },
}))
