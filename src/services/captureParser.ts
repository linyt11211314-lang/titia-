// Titia 时序 · CaptureParser（一键拾光 OCR 文本解析）
// 从 OCR 文本中解析：金额 / 商户 / 时间 / 支付账户；分类由现有规则库匹配（CapturePage 内完成，依据真实商户）。
// 独立模块便于验收与后续扩展（语音/文本/流水识别可复用同一解析器）。
// 商户名标准化（去公司后缀/括号分店）引用 src/config/aiRules.ts 统一规则。

import { normalizeMerchant } from '../config/aiRules'
import { isPddPage, parsePlatformAmount, parsePlatformAmounts } from './platformRules'

export interface CaptureParsed {
  merchant: string // 商户/交易对象（清理后首个候选；CapturePage 优先用规则关键词上下文）
  merchantCandidates: string[] // 清理后的全部候选段（供上层按规则/长度决策）
  amountFen: number | null // 金额（分）
  time: string // 解析出的时间（YYYY-MM-DD HH:mm）；未解析出则调用方用当前时间
  accountHint: string | null // 支付账户（已映射为现有账户名，如"零钱"→"微信"）
  isExpense: boolean // 是否支出（支付截图一律 true）
  confidence: 'high' | 'low' // low = 金额与商户均未解析出（未识别）
}

// ── 金额 ──
// 优先级（需求四）：①支付金额/实付 → ②实际交易金额/金额/合计 → ③交易详情金额 → ④货币符号 → ⑤xx元 → ⑥负号金额 → ⑦兜底
// 忽略：优惠/立减/折扣/满减金额、商品编号、订单号、时间。
// 支持 -10.60 / ¥10.60 / ￥10.60 / 10.60元；默认视为支出，仅当命中收入关键词时判定为收入。

// 收入关键词：命中即判定为「收入」（用于一键拾光识别收入账单，如工资/收款/退款/红包/转账收入等）。
// 设计原则：仅用「明确收入语义」的精确短语，避免电商订单列表的「退款/售后」按钮、支付截图的「付款/收款方」被误判。
// 例如订单页「退款/售后」不含下列任一短语 → 仍是支出；而「退款成功/退款到账/已退款」才是真实退款入账。
const INCOME_KEYWORDS = [
  '收款成功', '已收款', '到账', '已到账', '入帐', '已入帐', '入账', '已入账',
  '工资', '薪资', '薪金', '薪酬', '薪水',
  '报销', '退税', '退税款',
  '红包', '拼手气红包', '微信红包', '现金红包',
  '返现', '返利', '返还款',
  '利息', '理财收益', '收益',
  '补贴', '津贴', '补助', '餐补', '交通补贴', '住房补贴',
  '奖金', '提成', '分红', '股息', '年终奖',
  '退款成功', '退款到账', '退款已退', '已退款', '退款金额', '退还', '退回',
  '中奖', '兼职', '劳务费', '稿费', '咨询费', '服务费收入',
  '养老金', '公积金提取', '年金', '赔偿款', '补偿款',
  '收到转账', '转账收款', '转入', '收款码', '收钱',
]
/** 文本是否明显为「收入」类（工资/收款/退款/红包/转账收入等）。命中后一键拾光按收入记账。 */
export function isIncomeText(text: string): boolean {
  return INCOME_KEYWORDS.some((k) => text.includes(k))
}

const AMOUNT_PRIORITY = [
  /(?:支付金额|实付金额|实付|实际支付|实际支付金额)[^\d+\-¥￥元]*?([-+]?\d+(?:\.\d{1,2})?)\s*元?/,
  /(?:实际交易金额|交易金额|金额|合计|消费金额|收款金额|付款金额)[^\d+\-¥￥元]*?([-+]?\d+(?:\.\d{1,2})?)\s*元?/,
  /(?:交易详情|账单详情|交易明细)[^\d+\-¥￥元]*?([-+]?\d+(?:\.\d{1,2})?)\s*元?/,
]
export function parseAmountFromText(text: string): { fen: number | null; isExpense: boolean } {
  const valid = (n: number) => !Number.isNaN(n) && n > 0 && n < 1_000_000
  // 收入判定：命中收入关键词 → 视为收入（isExpense=false）；否则默认支出。
  // 电商订单/支付截图一般不含上述关键词，不会被误判；平台订单列表的「退款/售后」按钮不含精确退款短语，安全。
  const isExp = !isIncomeText(text)
  // 平台专属规则（优先匹配）：拼多多订单页（拼团中/7天无理由退货/免运费）
  // 按「实付：¥ / 实付 ¥ / ¥xx.xx」优先级 + 原价校验 + 多金额取最小 + 区块分隔
  if (isPddPage(text)) {
    const pdd = parsePlatformAmount(text)
    if (pdd.amountFen !== null && valid(pdd.amountFen / 100)) {
      return { fen: pdd.amountFen, isExpense: true }
    }
    // 平台页但金额未识别 → 不降级到通用规则（避免误取原价/件数），直接标记失败
    if (pdd.isPdd) return { fen: null, isExpense: true }
  }
  // 剔除优惠/立减/折扣/满减金额（不可作为实付金额）
  const clean = text.replace(/(?:优惠|立减|折扣|满减|商家优惠|平台优惠)\s*[-¥￥]?\s*\d+(?:\.\d{1,2})?\s*元?/g, ' ')
  // ① 按优先级关键词组依次匹配（支付金额 → 实际交易金额 → 交易详情）
  for (const re of AMOUNT_PRIORITY) {
    const kw = clean.match(re)
    if (kw) {
      const n = Math.abs(Number(kw[1]))
      if (valid(n)) return { fen: Math.round(n * 100), isExpense: isExp }
    }
  }
  // ② 货币符号
  const cur = clean.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/)
  if (cur) {
    const n = Number(cur[1])
    if (valid(n)) return { fen: Math.round(n * 100), isExpense: isExp }
  }
  // ③ xx元
  const yuan = clean.match(/(-?\d+(?:\.\d{1,2})?)\s*元/)
  if (yuan) {
    const n = Math.abs(Number(yuan[1]))
    if (valid(n)) return { fen: Math.round(n * 100), isExpense: isExp }
  }
  // ④ 负号金额（支付截图常见 -10.60）
  const neg = clean.match(/(?<![\d.])(-\d+(?:\.\d{1,2})?)(?![\d.])/)
  if (neg) {
    const n = Math.abs(Number(neg[1]))
    if (valid(n)) return { fen: Math.round(n * 100), isExpense: isExp }
  }
  // ⑤ 兜底：排除时间(12:30)/日期后取第一个数字（"不要读取第一个数字"——优先级规则全部优先）
  const plain = clean
    .replace(/\d{1,2}:\d{2}/g, ' ')
    .replace(/\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2}/g, ' ')
    .replace(/\d{1,2}月\d{1,2}日/g, ' ')
    .match(/(\d+(?:\.\d{1,2})?)/)
  if (plain) {
    const n = Number(plain[1])
    if (valid(n)) return { fen: Math.round(n * 100), isExpense: isExp }
  }
  return { fen: null, isExpense: isExp }
}

// ── 时间（OCR 常见格式：2026-08-05 12:30 / 2026年8月5日 12:30 / 8月5日 12:30 / 12:30） ──
export function parseTimeFromText(text: string, now = new Date()): string | null {
  const full = text.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?[ T](\d{1,2}):(\d{2})/)
  if (full) return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')} ${full[4].padStart(2, '0')}:${full[5]}`
  const md = text.match(/(\d{1,2})月(\d{1,2})日[ T]?(\d{1,2}):(\d{2})/)
  if (md) {
    const y = now.getFullYear()
    return `${y}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')} ${md[3].padStart(2, '0')}:${md[4]}`
  }
  const hm = text.match(/(\d{1,2}):(\d{2})/)
  if (hm) {
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d} ${hm[1].padStart(2, '0')}:${hm[2]}`
  }
  return null
}

// ── 支付账户关键词（word → 现有账户名映射；"零钱"→微信等） ──
const ACCOUNT_MAP: { word: string; acc: string }[] = [
  { word: '零钱', acc: '微信' },
  { word: '微信支付', acc: '微信' },
  { word: '微信', acc: '微信' },
  { word: '支付宝', acc: '支付宝' },
  { word: '花呗', acc: '支付宝' },
  { word: '云闪付', acc: '云闪付' },
  { word: '招行', acc: '招行储蓄卡' },
  { word: '招商银行', acc: '招行储蓄卡' },
  { word: '信用卡', acc: '信用卡' },
]

export function parseAccountFromText(text: string): string | null {
  for (const { word, acc } of ACCOUNT_MAP) {
    if (text.includes(word)) return acc
  }
  return null
}

// ── 支付平台关键词（商户提取时过滤，分类不得依据平台） ──
const PLATFORM_WORDS = ['微信支付', '支付宝', '美团App', '美团外卖', '美团', '饿了么', '淘宝', '天猫', '京东支付', '京东', '拼多多', '抖音支付', '云闪付', '银行卡支付']

// ── 通用 OCR 提示词/界面噪声（非商户，商户提取时过滤） ──
const NOISE_WORDS = [
  '支付成功', '交易成功', '支付详情', '交易详情', '收款成功', '收款方', '扫码支付', '账单详情',
  '消费', '收款', '付款', '交易时间', '订单号', '订单编号',
  '当前状态', '支付时间', '商品', '收单机构', '支付方式', '交易单号', '商户单号', '交易服务',
  '喜欢', '小程序', '特价外卖', '团购', '服务', '对订单有疑惑', '发起群收款', '等万', '人喜欢', '关注', '分享',
]

/** 移除金额/时间/账户/平台/提示词片段、括号分店与"-平台"后缀后，返回候选语义段（含中文/字母） */
function extractMerchantCandidates(text: string): string[] {
  let s = text
    .replace(/(?:交易详情|支付金额|实付|金额|合计|消费|收款|付款)\s*[-¥￥]?\s*\d+(?:\.\d{1,2})?\s*元?/gi, ' ')
    .replace(/[¥￥]\s*\d+(?:\.\d{1,2})?/g, ' ')
    .replace(/-?\d+(?:\.\d{1,2})?\s*元/g, ' ')
    .replace(/\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2}日?[ T]?\d{1,2}:\d{2}/g, ' ')
    .replace(/\d{1,2}月\d{1,2}日[ T]?\d{1,2}:\d{2}/g, ' ')
    .replace(/\d{1,2}:\d{2}/g, ' ')
    .replace(/\d+/g, ' ')
  for (const w of [...ACCOUNT_MAP.map((x) => x.word), ...PLATFORM_WORDS, ...NOISE_WORDS]) s = s.split(w).join(' ')
  // 去括号分店：瑞幸咖啡（港深国际中心店）→ 瑞幸咖啡
  s = s.replace(/[（(][^）)]*[）)]/g, ' ')
  // 去 "-平台" 后缀与连字符
  s = s.replace(/\s*[-–—·]\s*/g, ' ')
  // 分段：换行/空格/〉/>/< 分隔；仅保留含中文或字母且 ≥2 字的段（滤掉 :!!、이、< 等噪声）
  const segs = s
    .split(/[\s\n\r]+|[〉>]/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && /[\u4e00-\u9fa5A-Za-z]/.test(t))
  // 再滤掉明显非商户的收单机构/长机构名（"XX支付技术有限公司"）
  return segs.filter((t) => !/(支付技术|有限公司|支付有限公司)/.test(t)).slice(0, 8)
}

export function parseCaptureText(text: string, now = new Date()): CaptureParsed {
  const { fen: amountFen, isExpense } = parseAmountFromText(text)
  const time = parseTimeFromText(text, now)
  const accountHint = parseAccountFromText(text)
  const merchantCandidates = extractMerchantCandidates(text)
  const merchant = normalizeMerchant(merchantCandidates[0] ?? '')
  const confidence: CaptureParsed['confidence'] = amountFen === null && !merchant ? 'low' : 'high'
  return {
    merchant,
    merchantCandidates,
    amountFen,
    time: time ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    accountHint,
    isExpense,
    confidence,
  }
}

// ═══════════ 多笔支付订单拆分（需求三） ═══════════
// 一张支付截图可能包含多笔消费（如多行「商户 金额」），逐行拆分为多个交易候选。
// 候选满足：行首为商户文字（≥2 字中文/字母）、行尾为金额；过滤行级噪声（订单号/支付成功/纯平台行）。
// 若无法拆出 ≥2 笔，返回空数组，上层回退到单笔解析（兼容现有单笔场景）。

export interface CaptureCandidate {
  merchant: string
  amountFen: number
  time: string
  accountHint: string | null
  isExpense: boolean
  confidence: 'high' | 'low'
}

// 行级噪声：这类行即使形如「商户 金额」也不是独立消费（订单号/平台/订单状态/UI 提示）
const LINE_NOISE_WORDS = [
  '订单号', '订单编号', '交易单号', '商户单号', '支付成功', '交易成功', '收款成功', '支付详情', '交易详情',
  '当前状态', '支付时间', '交易时间', '收单机构', '支付方式', '支付金额', '实付', '优惠', '立减', '折扣', '满减',
  '商品', '服务', '交易服务', '对订单有疑惑', '发起群收款', '喜欢', '关注', '分享', '查看', '复制', '订单详情',
  '微信支付', '支付宝', '云闪付', '银行卡支付', '零钱', '余额', '花呗',
  // 电商/外卖 App 订单状态与 UI 词（避免把状态数字误识别为金额）
  '拼团中', '已签收', '待取件', '待付款', '待收货', '待发货', '打包中', '派件中', '运输中', '已发货',
  '全部', '更多', '评价', '申请退款', '查看物流', '确认收货', '关闭', '催付款', '退款/售后',
  '7天无理由退货', '免运费', '免费送货上门',
  // OCR 噪声与非商户 UI 词（避免被误当作交易对象）
  '管理', '商家处理中', '仓库处理中', '催发货', '催发负', '提醒发货', '申请开票', '修改地址',
  '小贴士', '手把手教你', 'x1',
]
// 允许作为交易对象的消费平台（行首商户为平台时仍算一笔消费，如「美团外卖 35」）
const ALLOWED_PLATFORM_MERCHANTS = ['美团外卖', '美团', '饿了么', '滴滴', '京东', '淘宝', '拼多多', '抖音']

// 物流/订单单号上下文词：含这些词的行即便形如「商户 数字」也不是独立消费（避免把物流单号当金额）
const LOGISTICS_NOISE_WORDS = [
  '订单', '物流', '仓库', '入库', '签收', '派件', '运输', '运单', '发货', '揽收', '已接单', '单号', '快递',
]

// 多笔识别过滤选项（需求：减少 OCR 误识别）
export interface MultiCaptureOpts {
  /** 仅识别含「实付/支付金额/合计」等关键词的金额（忽略单品原价、物流单号等） */
  onlyRealPay?: boolean
  /** 忽略 3-6 位纯整数（物流/订单单号，无货币符号或含物流关键词） */
  ignoreLogistics?: boolean
}

// 「实付款」关键词组（仅识别模式专用）：匹配这些词后的金额，才是真正的合并实付金额
// 含 OCR 常见错字（安付款/卖付款/买付款/要付款）与宽泛「付款」（要求后接金额，避免误匹配「待付款」）
const REALPAY_KEYWORDS = [
  '实付金额', '实付', '支付金额', '实际支付金额', '实际支付', '付款金额', '应收款', '订单金额', '合计', '总金额',
  // OCR 容错：常见错字
  '安付款', '卖付款', '买付款', '要付款',
  // 宽泛（要求后接金额才生效）
  '付款',
]
const REALPAY_RE = new RegExp(
  `(?:${REALPAY_KEYWORDS.join('|')})[^\\d¥￥元]*?[-¥￥]?\\s*(\\d+(?:\\.\\d{1,2})?)`,
  'g',
)

// 电商平台订单列表（天猫/淘宝/京东/拼多多/抖音）：每个订单以店铺行开头、「修改地址」等结算行为结尾，
// 拦截式结构化拆分各订单实付，规避单品原价/物流号/UI 噪声（需求：截图订单列表多笔）。
const PLATFORM_ORDER_RE = /(天猫超市|天猫|淘宝|京东|拼多多|抖音)[\s·]*(.{0,40}?)(?:[⋯.>＞]|官方|旗舰店|$)/
const ORDER_END_RE = /修改地址/
// 付款/合计行：「实付款/合计/安付款」等明确为订单合并实付；OCR 错字容错同 REALPAY_KEYWORDS
const PAY_LINE_RE = /(?:实付|合计|安付款|卖付款|买付款|要付款|支村|支会|付款)[^\d¥￥]*?([¥￥]?\s*\d+(?:\.\d{1,2})?)/

// 行匹配：商户文字 + 行尾金额（支持 -10.60 / ¥10.60 / ￥10.60 / 10.60元）
const LINE_AMOUNT_RE = /^([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·\s]{1,20}?)\s*[-¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*元?\s*$/
// 纯金额行（用于「商家」与「金额」被 OCR 拆成相邻两行的场景，如微信账单列表：美团\n·15.01）
const PURE_AMOUNT_RE = /^[·¥￥\-]?\s*(\d+(?:\.\d{1,2})?)\s*$/
// 「商家名」候选行（无金额、纯中文/字母，允许括号/破折号/下划线，≥2 字）
const MERCHANT_ONLY_RE = /^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·\s（）()_\-]{1,30}$/

/** 从 OCR 文本拆分多笔交易候选；不足 2 笔返回空（上层回退单笔解析） */
export function parseMultiCaptureText(
  text: string,
  opts: MultiCaptureOpts = {},
  now = new Date(),
): CaptureCandidate[] {
  const nowStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  // 电商平台订单列表（天猫/淘宝/京东/拼多多/抖音）：结构化拆分各订单实付，优先于通用逻辑
  const platformOrders = parsePlatformOrderList(text, now, nowStr)
  if (platformOrders.length >= 2) return platformOrders

  // 仅识别实付款模式：直接按「实付/支付金额/合计」等关键词抽取，跳过普通行尾金额逻辑
  if (opts.onlyRealPay) {
    return extractRealPayCandidates(text, now, nowStr)
  }

  // 拼多多页面：按区块取每个订单的实付（列表页多个不同商家订单，分别保存）
  if (isPddPage(text)) {
    const pddResults = parsePlatformAmounts(text).filter((r) => r.amountFen !== null)
    if (pddResults.length >= 2) {
      const cands: CaptureCandidate[] = pddResults.map((r) => {
        const accountHint = parseAccountFromText(text)
        const time = parseTimeFromText(text, now)
        return {
          merchant: '拼多多',
          amountFen: r.amountFen!,
          time: time ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
          accountHint: accountHint ?? null,
          isExpense: true,
          confidence: 'high',
        }
      })
      return cands.slice(0, 8)
    }
    return []
  }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const cands: CaptureCandidate[] = []
  // 近期候选商户行栈（噪声行不重置——避免「使用零钱支付」等夹在商户与金额间打断聚合）
  const recentMerchants: string[] = []
  const MAX_LOOKBACK = 5
  const pushCand = (merchantRaw: string, amount: number, hadCurrency: boolean) => {
    // 忽略物流单号：3-6 位纯整数且无货币符号（几乎必是物流/订单单号），或上下文含物流关键词
    if (opts.ignoreLogistics) {
      const digits = String(Math.trunc(Math.abs(amount)))
      const isPlainInt = Number.isInteger(amount) && digits.length >= 3 && digits.length <= 6
      const logisticCtx = LOGISTICS_NOISE_WORDS.some((w) => merchantRaw.includes(w))
      if (logisticCtx || (isPlainInt && !hadCurrency)) return
    }
    if (LINE_NOISE_WORDS.some((w) => merchantRaw.includes(w))) return
    if (merchantRaw.length < 2 || !/[\u4e00-\u9fa5A-Za-z]/.test(merchantRaw)) return
    if (!amount || Number.isNaN(amount) || amount >= 1_000_000) return
    const amountFen = Math.round(Math.abs(amount) * 100)
    const time = parseTimeFromText(merchantRaw + '\n' + text, now)
    const accountHint = parseAccountFromText(merchantRaw + '\n' + text)
    cands.push({
      merchant: normalizeMerchant(merchantRaw),
      amountFen,
      time: time ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      accountHint,
      isExpense: true,
      confidence: 'high',
    })
  }
  const resetMerchants = () => {
    recentMerchants.length = 0
  }
  for (const line of lines) {
    // 1. 同行（商户+金额）—— 标准模式
    const m = line.match(LINE_AMOUNT_RE)
    if (m) {
      pushCand(m[1].trim(), Number(m[2]), /[¥￥]/.test(line))
      resetMerchants()
      continue
    }
    // 2. 纯金额行 —— 向上找最近的非噪声候选商户行（限制回看 5 行，跨噪声行）
    const pure = line.match(PURE_AMOUNT_RE)
    if (pure) {
      for (let i = recentMerchants.length - 1; i >= 0 && i >= recentMerchants.length - MAX_LOOKBACK; i--) {
        pushCand(recentMerchants[i], Number(pure[1]), /[¥￥]/.test(line))
        break
      }
      resetMerchants()
      continue
    }
    // 3. 候选商户行（无金额、纯中文/字母）—— 记录为下一纯金额行的候选
    //    新订单开始 → 清空旧栈（避免跨订单误合并）
    if (MERCHANT_ONLY_RE.test(line) && line.length >= 2 && !LINE_NOISE_WORDS.some((w) => line.includes(w))) {
      recentMerchants.length = 0
      recentMerchants.push(line)
      if (recentMerchants.length > MAX_LOOKBACK) recentMerchants.shift()
      continue
    }
    // 4. 其他行（噪声/时间/数字等）—— 保留候选栈（跨噪声聚合），不重置
  }
  // 去重（同商户+同金额只留一笔）
  const seen = new Set<string>()
  const uniq = cands.filter((c) => {
    const k = `${c.merchant}|${c.amountFen}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return uniq.length >= 2 ? uniq.slice(0, 8) : []
}

// 电商平台订单列表结构化拆分（天猫/淘宝/京东/拼多多/抖音 App 的「全部订单」截图）：
// 每个订单以店铺行（平台名+店铺名）开头，以「修改地址」结算行为结尾；拦截订单内的单品原价/物流号/UI 噪声，
// 只取订单实付（含「安付款」等 OCR 错字的付款行，或结尾纯金额行）。不足 2 笔返回空（上层回退）。
function parsePlatformOrderList(text: string, now: Date, nowStr: string): CaptureCandidate[] {
  if (!/(天猫|淘宝|京东|拼多多|抖音)/.test(text)) return []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const cands: CaptureCandidate[] = []
  let shop = ''
  let pending: number | null = null
  // 当前订单区域内出现的所有金额（按出现顺序）；当没有明确实付款/付款行时，用区域内最后一个金额兜底
  // 原因：天猫订单列表中，OCR 常漏掉右下角的「合计」，只保留商品单价（如 ¥106），此时商品单价即订单实付
  const orderAmounts: number[] = []
  const flush = () => {
    const finalAmount = pending ?? orderAmounts[orderAmounts.length - 1] ?? null
    if (shop && finalAmount && finalAmount > 0 && finalAmount < 1_000_000) {
      cands.push({
        merchant: normalizeMerchant(shop),
        amountFen: Math.round(finalAmount * 100),
        time: nowStr,
        accountHint: null,
        isExpense: true,
        confidence: 'high',
      })
    }
    shop = ''
    pending = null
    orderAmounts.length = 0
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 平台店铺行（天猫超市/天猫/淘宝/京东/拼多多/抖音 + 店铺名）
    const sm = line.match(PLATFORM_ORDER_RE)
    if (sm) {
      flush()
      shop = (sm[2].trim() || sm[1]).trim()
      continue
    }
    // 实付款/合计/付款行（含 OCR 错字）
    const pm = line.match(PAY_LINE_RE)
    if (pm) {
      const n = Number(pm[1].replace(/[¥￥\s]/g, ''))
      if (!Number.isNaN(n) && n > 0 && n < 1_000_000) {
        pending = n
        orderAmounts.push(n)
      }
      continue
    }
    // 纯金额行：记录到 orderAmounts；若下一行是订单结束信号（修改地址）则额外提升为 pending
    const pure = line.match(PURE_AMOUNT_RE)
    if (pure) {
      const n = Number(pure[1])
      if (!Number.isNaN(n) && n > 0 && n < 1_000_000) {
        orderAmounts.push(n)
        if (ORDER_END_RE.test(lines[i + 1] ?? '')) pending = n
      }
      continue
    }
    // 订单结束信号：结算实付并收尾当前订单
    if (ORDER_END_RE.test(line)) {
      flush()
    }
  }
  flush()
  // 去重（同商户+同金额只留一笔）
  const seen = new Set<string>()
  return cands
    .filter((c) => {
      const k = `${c.merchant}|${c.amountFen}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 8)
}

// 仅识别实付款：从全文抽取含「实付/支付金额/合计」等关键词的金额作为交易候选。
// 直接命中用户真实合并付款（如「实付款 ¥160.87」），避开单品原价、物流单号、优惠等噪声。
// 同一截图多篇订单（各含一个实付）会分别拆成多笔；无命中返回空（上层回退单笔解析）。
function extractRealPayCandidates(text: string, now: Date, nowStr: string): CaptureCandidate[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const cands: CaptureCandidate[] = []
  let m: RegExpExecArray | null
  REALPAY_RE.lastIndex = 0
  while ((m = REALPAY_RE.exec(text))) {
    const n = Number(m[1])
    if (Number.isNaN(n) || n <= 0 || n >= 1_000_000) continue
    // 商户：向上找最近的候选商户行；否则从上下文检测平台（淘宝/天猫/京东…）；再否则记「订单」
    const beforeText = text.slice(0, m.index)
    const beforeLines = beforeText.split(/\r?\n/)
    const merchantLine = [...beforeLines].reverse().find(
      (l) => MERCHANT_ONLY_RE.test(l.trim()) && !LINE_NOISE_WORDS.some((w) => l.includes(w)),
    )
    let merchant = merchantLine ? normalizeMerchant(merchantLine.trim()) : ''
    if (!merchant) {
      const plat = [...ALLOWED_PLATFORM_MERCHANTS, ...PLATFORM_WORDS].find((p) => beforeText.includes(p))
      merchant = plat ?? '订单'
    }
    const time = parseTimeFromText(beforeText, now)
    const accountHint = parseAccountFromText(text)
    cands.push({
      merchant,
      amountFen: Math.round(n * 100),
      time: time ?? nowStr,
      accountHint: accountHint ?? null,
      isExpense: true,
      confidence: 'high',
    })
  }
  // 去重（同商户+同金额只留一笔）
  const seen = new Set<string>()
  const uniq = cands.filter((c) => {
    const k = `${c.merchant}|${c.amountFen}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return uniq.slice(0, 8)
}
