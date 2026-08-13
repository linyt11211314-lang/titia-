// Titia 时序 · 平台专属解析规则（优先匹配 · 拼多多订单页）
// 触发：OCR 文本包含「拼团中 / 7天无理由退货 / 免运费」等关键词 → 判定为拼多多订单页。
// 金额提取优先级（按顺序）：
//   1. 实付：¥(\d+\.?\d*)    2. 实付 ¥(\d+\.?\d*)    3. ¥(\d+\.\d{2})
//   4. 提取金额必须 ≤ 该商品区块原价（如 ·39.9），否则丢弃重新匹配
//   5. 同一区块多金额取最小值（实付通常最小）
//   6. 提取不到 → 标记「金额识别失败」，不猜测不补全
//   7. 商品与金额配对：以「7天无理由退货」或「更多」作为商品区块分隔符

export interface PlatformAmountResult {
  /** 识别到的金额（分）；null = 未识别 */
  amountFen: number | null
  /** 是否拼多多订单页 */
  isPdd: boolean
  /** 失败/异常标记（未识别时说明） */
  warn?: string
  /** 商品区块数量 */
  blocks: number
}

const PDD_KEYWORDS = ['拼团中', '7天无理由退货', '免运费']
const BLOCK_SEPARATORS = /7天无理由退货|更多|拼团中/

/** 判定文本是否为拼多多订单页 */
export function isPddPage(text: string): boolean {
  return PDD_KEYWORDS.some((k) => text.includes(k))
}

/** 按「7天无理由退货 / 更多」分隔商品区块，返回区块列表 */
function splitBlocks(text: string): string[] {
  return text
    .split(BLOCK_SEPARATORS)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
}

/** 提取区块内原价（如 ·39.9 / ￥39.9 / 原价39.9）；无则 null */
function extractOriginalPrice(block: string): number | null {
  // ·39.9（商品列表原价标记）；排除「实付」后的数字
  const m = block.match(/[·.¥￥]\s*(\d+(?:\.\d{1,2})?)/)
  if (m) {
    const n = Number(m[1])
    if (!Number.isNaN(n) && n > 0) return n
  }
  return null
}

/** 按优先级提取区块实付金额；校验 ≤ 原价；多金额取最小 */
function extractPaid(block: string): { yuan: number | null; fail: boolean } {
  const candidates: number[] = []
  // ① 实付：¥3.77 / 实付:¥3.77
  const m1 = block.match(/实付\s*[:：]?\s*¥\s*(\d+(?:\.\d{1,2})?)/)
  if (m1) candidates.push(Number(m1[1]))
  // ② 实付 ¥3.77（无冒号）
  if (candidates.length === 0) {
    const m2 = block.match(/实付\s*¥\s*(\d+(?:\.\d{1,2})?)/)
    if (m2) candidates.push(Number(m2[1]))
  }
  // ③ 区块内 ¥xx.xx（必须两位小数，避免取到原价/件数）
  if (candidates.length === 0) {
    const m3 = block.match(/¥\s*(\d+\.\d{2})/)
    if (m3) candidates.push(Number(m3[1]))
  }
  if (candidates.length === 0) return { yuan: null, fail: true }

  const original = extractOriginalPrice(block)
  let best = candidates[0]
  // ④ 校验：候选必须 ≤ 原价（原价存在时）；否则丢弃
  const valid = candidates.filter((c) => (original === null ? true : c <= original + 0.001))
  if (valid.length === 0) return { yuan: null, fail: true }
  // ⑤ 取最小值（实付通常最小）
  best = Math.min(...valid)
  return { yuan: best, fail: false }
}

/** 平台专属金额解析：返回整页识别结果（首个成功区块的金额；全部失败则标记） */
export function parsePlatformAmount(text: string): PlatformAmountResult {
  const results = parsePlatformAmounts(text)
  if (results.length === 0) {
    return { amountFen: null, isPdd: isPddPage(text), blocks: 0, warn: '金额识别失败' }
  }
  // 首条成功
  return results[0]
}

/** 平台专属金额解析：按区块返回每条识别结果（用于列表页多个订单分别保存） */
export function parsePlatformAmounts(text: string): PlatformAmountResult[] {
  if (!isPddPage(text)) return []
  const blocks = splitBlocks(text)
  if (blocks.length === 0) {
    return [{ amountFen: null, isPdd: true, blocks: 0, warn: '金额识别失败' }]
  }
  const out: PlatformAmountResult[] = []
  let anyFail = false
  for (const block of blocks) {
    const { yuan, fail } = extractPaid(block)
    if (!fail && yuan !== null && yuan > 0) {
      out.push({ amountFen: Math.round(yuan * 100), isPdd: true, blocks: blocks.length })
    } else if (fail) {
      anyFail = true
    }
  }
  if (out.length === 0) {
    out.push({ amountFen: null, isPdd: true, blocks: blocks.length, warn: anyFail ? '金额识别失败' : '金额识别失败' })
  }
  return out
}
