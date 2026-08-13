// Titia 时序 · 自动记账 AI 识别（DeepSeek · OpenAI 兼容接口）
// 配置：DeepSeek API Key + 可选 Base URL（默认 https://api.deepseek.com，模型 deepseek-chat）。
// Key 存 localStorage（用户自用 PWA，不写入代码/构建产物）。
// 未配置 Key / 识别失败 / 网络异常 → 一律返回 null，调用方静默降级到规则层或手动表单。
// 识别规则由 src/config/aiRules.ts 统一提供（分类列表/字段规则/去重/合并/校验）。

import { AI_CATEGORIES } from '../config/aiRules'

export interface AiResult {
  merchant?: string
  category?: string
  account?: string
  amount: number // 分
  note?: string
  time?: string
  /** 重复标记（AI 识别层判重提示） */
  dupStatus?: 'keep' | 'skip'
  /** 合并标记：>1 表示该条由 N 笔子交易合并 */
  mergedCount?: number
  /** 校验标记 */
  warn?: string
  /** 周期性标记 */
  periodic?: boolean
}

const AI_KEY_STORE = 'titia.aiKey'
const AI_BASE_STORE = 'titia.aiBaseUrl'
const AI_PROMPT_STORE = 'titia.aiSystemPrompt'
export const DEFAULT_AI_BASE = 'https://api.deepseek.com'
const AI_MODEL = 'deepseek-chat'

export function getAiKey(): string {
  try {
    return localStorage.getItem(AI_KEY_STORE) || ''
  } catch {
    return ''
  }
}

export function setAiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(AI_KEY_STORE, key.trim())
    else localStorage.removeItem(AI_KEY_STORE)
  } catch {
    /* ignore */
  }
}

/** Base URL：未配置时用默认 DeepSeek 地址（兼容其他 OpenAI 兼容服务） */
export function getAiBaseUrl(): string {
  try {
    return localStorage.getItem(AI_BASE_STORE) || ''
  } catch {
    return ''
  }
}

export function setAiBaseUrl(url: string): void {
  try {
    if (url.trim()) localStorage.setItem(AI_BASE_STORE, url.trim())
    else localStorage.removeItem(AI_BASE_STORE)
  } catch {
    /* ignore */
  }
}

// ── 自定义系统提示词（用户可覆盖内置默认 prompt，直接接入 API system role）──
/** 获取用户自定义系统提示词；空字符串表示未设置（将回退内置默认） */
export function getAiSystemPrompt(): string {
  try {
    return localStorage.getItem(AI_PROMPT_STORE) || ''
  } catch {
    return ''
  }
}
/** 设置自定义系统提示词；传空字符串清除自定义、恢复内置默认 */
export function setAiSystemPrompt(prompt: string): void {
  try {
    if (prompt.trim()) localStorage.setItem(AI_PROMPT_STORE, prompt.trim())
    else localStorage.removeItem(AI_PROMPT_STORE)
  } catch {
    /* ignore */
  }
}
/** 获取当前实际生效的 system prompt（自定义优先 → 内置默认兜底） */
export function getEffectiveSystemPrompt(): string {
  const custom = getAiSystemPrompt()
  return custom.trim() || SYSTEM_PROMPT
}

// 系统提示词：只输出 JSON（DeepSeek JSON Output 要求提示词里明确说明输出 JSON）
// 规则源：src/config/aiRules.ts 的分类列表；金额支出为负/收入为正（元），实付优先；
// 支持同一订单多笔子交易合并输出一条；重复判定按 商户+金额±0.01+时间≤5分钟。
export const SYSTEM_PROMPT = `你是 Titia 记账 App 的智能账单识别助手。根据用户提供的交易描述或支付截图 OCR 文本，提取账单信息。只输出 JSON 对象（不要 markdown、不要多余文字），字段如下：
{"merchant":"交易对象/商户名(去公司后缀,保留品牌名)","category":"分类(必须从给定列表选一个)","account":"支付账户","amount":金额(元,支出为负数,收入为正数,保留两位小数,取实付金额)","date":"交易日期 YYYY-MM-DD","memo":"备注(格式:平台-商户-商品摘要)","orderId":"订单号/流水号(有则填,无则null)","warn":"校验标记(金额不一致/大额交易/小额异常/格式异常时填,正常为null)","periodic":是否周期性交易}
分类列表(仅限以下12类): ${AI_CATEGORIES.map((c) => `${c.name}${c.income ? '(收入类)' : c.transfer ? '(转账类,不计消费)' : ''}`).join('/')}
金额规则：以实付金额为准，忽略原价/优惠/红包；支出为负、收入为正；若"原价-优惠-抵扣"与实付差>0.01元，在 warn 填"金额不一致"；金额>10000元填"大额交易"；≤0.01元填"小额异常"。
合并规则：同一订单号下的多笔子交易（或同商户且时间差≤2分钟）合并为一条，金额求和，memo 格式"【合并】子交易1|子交易2|共N笔"，并在备注标注原分类。
去重规则：同商户+同金额(±0.01)+时间差≤5分钟视为重复，保留最早一条（date 最早），重复条目返回 {"skip":true}。
若无法识别任何信息，返回 {"amount":null}。`

/** 调用 DeepSeek 识别：成功返回结构化结果；任何异常返回 null（调用方降级） */
export async function aiRecognize(text: string): Promise<AiResult | null> {
  const key = getAiKey()
  if (!key || !text.trim()) return null
  const base = (getAiBaseUrl() || DEFAULT_AI_BASE).replace(/\/+$/, '')
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15_000) // 15s 超时兜底
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: getEffectiveSystemPrompt() },
          { role: 'user', content: text.trim().slice(0, 800) },
        ],
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) return null
    const json = await resp.json()
    const content = json?.choices?.[0]?.message?.content
    if (!content) return null
    let d: Record<string, unknown>
    try {
      // 兼容模型可能输出 ```json 代码块包裹
      const cleaned = String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      d = JSON.parse(cleaned)
    } catch {
      return null
    }
    // AI 判重跳过（重复条目不返回账单）
    if (d.skip === true) {
      return { amount: 0, dupStatus: 'skip', merchant: typeof d.merchant === 'string' ? d.merchant : undefined }
    }
    // 金额：AI 输出元（支出负/收入正）→ 转分；支出取绝对值入库（存储层支出为正分）
    const yuan = Number(d.amount)
    if (!yuan || Number.isNaN(yuan)) return null
    const amountFen = Math.round(Math.abs(yuan) * 100)
    if (amountFen <= 0) return null
    return {
      merchant: typeof d.merchant === 'string' ? d.merchant : undefined,
      category: typeof d.category === 'string' ? d.category : undefined,
      account: typeof d.account === 'string' ? d.account : undefined,
      amount: amountFen,
      note: typeof d.memo === 'string' ? d.memo : typeof d.note === 'string' ? d.note : undefined,
      time: typeof d.date === 'string' ? d.date : typeof d.time === 'string' ? d.time : undefined,
      mergedCount: typeof d.mergedCount === 'number' && d.mergedCount > 1 ? d.mergedCount : undefined,
      warn: typeof d.warn === 'string' ? d.warn : undefined,
      periodic: d.periodic === true,
    }
  } catch {
    return null // 网络错误/超时/JSON 解析失败 → 静默降级
  }
}
