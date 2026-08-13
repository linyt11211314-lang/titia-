// Titia 时序 · 账单智能规则引擎（合并 / 校验 / 周期性 / 汇总对账）
// 规则源：src/config/aiRules.ts（用户指定）。供 AI 输出后处理、多笔候选保存、
// 未来批量账单导入共用。不修改数据库结构，仅对「识别结果」做后处理标注。

import type { TransactionEntity } from '../db/types'
import { AI_CATEGORIES, AMOUNT, DUP, MERGE, PERIODIC, matchCategory, isNonConsumption } from '../config/aiRules'

/** 识别后的标准记录（合并/校验后输出） */
export interface BillRuleResult {
  merchant: string
  amountFen: number // 分（支出正 / 收入负，与存储一致）
  date: string // YYYY-MM-DD
  category: string
  memo: string
  /** 去重状态：keep 保留 / skip 疑似重复已跳过 */
  dupStatus: 'keep' | 'skip'
  /** 合并标记：>1 表示 N 笔子交易合并 */
  mergedCount: number
  /** 校验标记（无则为空） */
  warn: string
  /** 周期性 */
  periodic: boolean
}

// ═══════════ 一、金额校验（用户规则：公式/大额/小额/三位小数/正负号） ═══════════

export interface AmountCheck {
  /** 校验后的金额（分；支出正、收入负，与存储一致） */
  amountFen: number
  /** 校验标记列表 */
  warns: string[]
  /** 正负号是否被自动修正 */
  directionFixed: boolean
}

/**
 * 金额校验：输入元（可带正负号），输出分。
 * - 支出为负、收入为正；与存储约定（支出正分/收入负分）取反对齐
 * - 正负号修正：类型(支出/收入)与符号矛盾时自动取反
 * - 大额(>1万)/小额(≤0.01)/三位小数 标记
 */
export function validateAmount(yuan: number, txType: 'expense' | 'income' = 'expense'): AmountCheck {
  const warns: string[] = []
  let raw = Number(yuan)
  if (!Number.isFinite(raw)) return { amountFen: 0, warns: ['金额格式异常'], directionFixed: false }

  // 三位小数：核实单位（可能是积分或外币）
  const s = String(Math.abs(raw))
  if (/\.\d{3,}/.test(s)) warns.push('金额格式异常，核实单位（积分或外币）')

  const abs = Math.abs(raw)
  if (abs > AMOUNT.bigThreshold) warns.push('大额交易，建议人工确认')
  if (abs > 0 && abs <= AMOUNT.tinyThreshold) warns.push('小额异常，可能是测试交易或红包抵扣')

  // 正负号修正：支出应为负、收入应为正；矛盾时取反
  let directionFixed = false
  const expectNegative = txType === 'expense'
  const isNegative = raw < 0
  if ((expectNegative && !isNegative && raw !== 0) || (!expectNegative && isNegative)) {
    raw = -raw
    directionFixed = true
    warns.push('方向已自动修正')
  }

  const fen = Math.round(Math.abs(raw) * 100)
  return { amountFen: expectNegative ? fen : -fen, warns, directionFixed }
}

/** 公式校验：原价 - 优惠 - 抵扣 ≈ 实付（差 > 0.01 元标记） */
export function checkFormula(originalPrice: number, discount: number, paid: number): string {
  const calc = originalPrice - discount
  if (Math.abs(calc - paid) > AMOUNT.formulaTolerance) return '金额不一致，需复核'
  return ''
}

// ═══════════ 二、同订单子交易合并（用户规则） ═══════════

export interface MergeGroup {
  /** 组内子交易 */
  items: TransactionEntity[]
  /** 合并依据：订单号 / 同商户时间窗 */
  by: 'orderId' | 'sameMerchant'
}

/**
 * 将一批交易按「同一订单」分组：
 * - 有订单号（备注含订单编号/流水号）→ 按订单号分组
 * - 无订单号 → 同商户 + 时间差 ≤2 分钟
 * - 时间差 >2 小时 或 商户不同 → 不合并
 */
export function groupByOrder(items: TransactionEntity[]): MergeGroup[] {
  const groups: MergeGroup[] = []
  const used = new Set<string>()

  for (let i = 0; i < items.length; i++) {
    if (used.has(items[i].id)) continue
    const group: TransactionEntity[] = [items[i]]
    used.add(items[i].id)
    const orderId = extractOrderId(items[i])
    const t0 = Date.parse((items[i].time || '').replace('T', ' '))
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(items[j].id)) continue
      const tj = items[j]
      const tjTime = Date.parse((tj.time || '').replace('T', ' '))
      // 同订单号
      if (orderId && extractOrderId(tj) === orderId) {
        group.push(tj)
        used.add(tj.id)
        continue
      }
      // 同商户 + 时间窗
      if (!orderId && !extractOrderId(tj) && (tj.merchant || '') === (items[i].merchant || '')) {
        if (Number.isFinite(t0) && Number.isFinite(tjTime) && Math.abs(tjTime - t0) <= MERGE.windowMinutes * 60_000) {
          group.push(tj)
          used.add(tj.id)
        }
      }
    }
    groups.push({ items: group, by: orderId ? 'orderId' : 'sameMerchant' })
  }
  return groups
}

/** 提取订单号/流水号（备注或商户中的编号模式） */
export function extractOrderId(tx: TransactionEntity): string | null {
  const text = `${tx.note ?? ''} ${tx.merchant ?? ''}`
  // 常见订单号模式：纯数字 8-24 位，或带字母的流水号
  const m = text.match(/(?:订单号|单号|流水号|订单编号)[:：\s]*([A-Za-z0-9]{6,32})/)
  if (m) return m[1]
  const m2 = text.match(/\b([A-Z]{2,6}\d{8,24})\b/)
  if (m2) return m2[1]
  return null
}

/** 合并一组子交易为一条记录（金额求和、取最早时间、分类取金额最大者、备注【合并】） */
export function mergeGroupToResult(group: MergeGroup): BillRuleResult {
  const items = [...group.items].sort((a, b) => a.time.localeCompare(b.time))
  const totalFen = items.reduce((s, t) => s + t.amount, 0)
  // 分类：取金额最大那一笔；不同分类在备注注明
  const byAbs = [...items].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  const main = byAbs[0]
  const mainCategory = main.category || matchCategory(main.merchant ?? '', main.note, main.amount < 0)
  const otherCats = [...new Set(items.map((t) => t.category || matchCategory(t.merchant ?? '', t.note, t.amount < 0)).filter((c) => c !== mainCategory))]
  const subMemos = items.map((t) => t.merchant || t.category || '未命名')
  const memoParts = [`【合并】${subMemos.join('|')}`, `共${items.length}笔`]
  if (otherCats.length) memoParts.push(`另有分类:${otherCats.join('/')}`)
  return {
    merchant: main.merchant || '合并订单',
    amountFen: totalFen,
    date: items[0].time.slice(0, 10),
    category: mainCategory,
    memo: memoParts.join(' '),
    dupStatus: 'keep',
    mergedCount: items.length,
    warn: '',
    periodic: false,
  }
}

/** 合并一批识别交易：返回合并后的结果列表 + 合并统计 */
export function mergeSubTransactions(items: TransactionEntity[]): {
  results: BillRuleResult[]
  mergedGroups: number
  mergedItems: number
} {
  const groups = groupByOrder(items)
  const results: BillRuleResult[] = []
  let mergedGroups = 0
  let mergedItems = 0
  for (const g of groups) {
    if (g.items.length > 1) {
      results.push(mergeGroupToResult(g))
      mergedGroups++
      mergedItems += g.items.length
    } else {
      const t = g.items[0]
      results.push({
        merchant: t.merchant || t.category || '未命名',
        amountFen: t.amount,
        date: t.time.slice(0, 10),
        category: t.category || matchCategory(t.merchant ?? '', t.note, t.amount < 0),
        memo: t.note ?? '',
        dupStatus: 'keep',
        mergedCount: 1,
        warn: '',
        periodic: false,
      })
    }
  }
  return { results, mergedGroups, mergedItems }
}

// ═══════════ 三、重复判定（用户规则：商户+金额±0.01+时间≤5分钟 / 订单号 / 备注关键词） ═══════════

/**
 * 在候选列表内部去重：返回保留/跳过标记。
 * 判定：同商户+同金额(±0.01)+时间差≤5分钟 → 保留最早、跳过后续；
 * 同订单号 → 后到跳过；同商户+金额+备注含相同订单号 → 跳过。
 * 退款对冲（同商户支出与收入同现）→ 不判重，标记复核。
 */
export function dedupeBatch(items: TransactionEntity[]): (BillRuleResult | null)[] {
  const out: (BillRuleResult | null)[] = []
  for (let i = 0; i < items.length; i++) {
    const t = items[i]
    const tTime = Date.parse((t.time || '').replace('T', ' '))
    const dup = items.find((x, j) => {
      if (j >= i) return false
      const xTime = Date.parse((x.time || '').replace('T', ' '))
      const sameAmount = Math.abs(Math.abs(x.amount) - Math.abs(t.amount)) <= Math.round(DUP.amountTolerance * 100)
      // 退款对冲：同商户、一支出正一收入负 → 不判重
      if ((x.amount > 0) !== (t.amount > 0) && (x.merchant || '') === (t.merchant || '')) return false
      if (!sameAmount) return false
      // 同订单号
      if (extractOrderId(x) && extractOrderId(x) === extractOrderId(t)) return true
      // 同商户 + 金额 + 时间窗
      if ((x.merchant || '') === (t.merchant || '') && Number.isFinite(xTime) && Number.isFinite(tTime) && Math.abs(xTime - tTime) <= DUP.windowMinutes * 60_000) return true
      // 同商户 + 金额 + 备注相同订单号关键词
      if ((x.merchant || '') === (t.merchant || '') && x.note && t.note && /订单号[:：]?\s*([A-Za-z0-9]{6,})/.test(x.note) && x.note === t.note) return true
      return false
    })
    if (dup) {
      out.push(null) // 跳过（保留最早一条）
    } else {
      out.push({
        merchant: t.merchant || t.category || '未命名',
        amountFen: t.amount,
        date: t.time.slice(0, 10),
        category: t.category || matchCategory(t.merchant ?? '', t.note, t.amount < 0),
        memo: t.note ?? '',
        dupStatus: 'keep',
        mergedCount: 1,
        warn: '',
        periodic: false,
      })
    }
  }
  return out
}

// ═══════════ 四、周期性识别（同商户连续数月相近金额） ═══════════

/** 检查某商户在历史中是否周期性出现（连续 ≥3 个月、金额偏差 ≤10%） */
export function isPeriodic(merchant: string, amountFen: number, history: TransactionEntity[]): boolean {
  if (!merchant) return false
  const months = new Map<string, number[]>() // 月份 → 金额列表
  for (const t of history) {
    if ((t.merchant || '') !== merchant) continue
    const m = t.time.slice(0, 7)
    if (!months.has(m)) months.set(m, [])
    months.get(m)!.push(Math.abs(t.amount))
  }
  if (months.size < PERIODIC.minMonths) return false
  const keys = [...months.keys()].sort()
  // 检查是否连续月份
  for (let i = 1; i < keys.length; i++) {
    const [y1, m1] = keys[i - 1].split('-').map(Number)
    const [y2, m2] = keys[i].split('-').map(Number)
    const gap = (y2 - y1) * 12 + (m2 - m1)
    if (gap > 1) return false
  }
  // 金额偏差 ≤10%（与最近一次相比）
  const recent = months.get(keys[keys.length - 1]) ?? []
  if (!recent.length) return false
  const avg = recent.reduce((s, v) => s + v, 0) / recent.length
  return Math.abs(avg - Math.abs(amountFen)) / Math.max(Math.abs(amountFen), 1) <= PERIODIC.amountToleranceRatio
}

// ═══════════ 五、汇总对账 ═══════════

export interface BillSummary {
  totalCount: number // 合并后笔数
  rawCount: number // 原始笔数
  totalExpenseFen: number
  totalIncomeFen: number
  dedupeSkipped: number
  mergedGroups: number
  mergedItems: number
  warnings: string[]
}

export function summarize(
  results: BillRuleResult[],
  rawCount: number,
  dedupeSkipped: number,
  mergedGroups: number,
  mergedItems: number,
  totalWarn = 0,
): BillSummary {
  return {
    totalCount: results.length,
    rawCount,
    totalExpenseFen: results.filter((r) => r.amountFen > 0).reduce((s, r) => s + r.amountFen, 0),
    totalIncomeFen: results.filter((r) => r.amountFen < 0).reduce((s, r) => s - r.amountFen, 0),
    dedupeSkipped,
    mergedGroups,
    mergedItems,
    warnings: [],
    ...(totalWarn > 0 ? { warnings: [`异常需复核：${totalWarn} 笔`] } : {}),
  }
}

/** 分类是否不计入消费（转账/收入类） */
export { isNonConsumption, AI_CATEGORIES }
