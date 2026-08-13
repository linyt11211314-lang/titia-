// Titia 时序 · 自动记账 AI 识别代理（Cloudflare Worker）
//
// 方案 §5.2 职责：
//   1. 接收前端请求（文本/截图描述），携带 Key 转发至大模型 API
//   2. 强制 JSON 输出（response_format json_object）
//   3. 校验返回结构，失败时降级返回 { error }（前端回退规则/手动）
//   4. 可选：简单频率限制（每 IP 每分钟 N 次）
//
// API Key 只存在 Worker 环境变量（DEEPSEEK_API_KEY），绝不进前端。
// 部署：wrangler deploy —— 或在 Cloudflare Dashboard 新建 Worker 粘贴本文件，
//       并在「设置 → 变量」配置 DEEPSEEK_API_KEY。
// 调用方式：POST https://<worker>/  body: { "text": "记一下海底捞 268" }
// 返回：{ ok: true, data: { merchant, category, amount, account, note, time } }
//       或 { ok: false, error: "..." }

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

// 分类枚举（与前端 categories 预置一致；模型只能从中选）
const CATEGORY_ENUM = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '教育', '其他']
const ACCOUNT_ENUM = ['支付宝', '微信', '现金', '储蓄卡', '信用卡']

// 频率限制：每 IP 每分钟 30 次（内存 Map，免费层足够）
const rate = new Map()
function rateLimit(ip) {
  const now = Date.now()
  const win = now - 60_000
  const hits = (rate.get(ip) || []).filter((t) => t > win)
  if (hits.length >= 30) return true
  hits.push(now)
  rate.set(ip, hits)
  return false
}

// Prompt：强制 JSON + 分类枚举约束 + 金额正则化
function buildPrompt(text) {
  return `你是记账助手。从用户描述中提取交易信息，只输出 JSON（不要多余文字）：
{"merchant":"交易对象","category":"分类","amount":金额数字,"account":"账户","time":"YYYY-MM-DD HH:mm","note":"备注"}

规则：
1. category 只能从这些选：${CATEGORY_ENUM.join('、')}；无法确定用"其他"。
2. account 只能从这些选：${ACCOUNT_ENUM.join('、')}；无法确定填空字符串。
3. amount 是正数金额（元，可带小数）；无法确定填 0。
4. time 用今天日期；note 可空。
5. 用户描述："${text.slice(0, 500)}"`
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    // 频率限制
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    if (rateLimit(ip)) {
      return new Response(JSON.stringify({ ok: false, error: 'rate limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const key = globalThis.DEEPSEEK_API_KEY || ''
    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: 'server not configured (DEEPSEEK_API_KEY missing)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'invalid body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }
    const text = String(body.text || '').trim()
    if (!text) {
      return new Response(JSON.stringify({ ok: false, error: 'empty text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    // 转发到 DeepSeek，强制 JSON 输出
    try {
      const resp = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: buildPrompt(text) },
            { role: 'user', content: text.slice(0, 500) },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
          max_tokens: 300,
        }),
      })

      if (!resp.ok) {
        return new Response(JSON.stringify({ ok: false, error: `upstream ${resp.status}` }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }
      const json = await resp.json()
      const content = json?.choices?.[0]?.message?.content || ''
      const parsed = JSON.parse(content)

      // 校验层：金额正则 + 分类枚举合法性 + 字段清洗
      const amount = Math.round(Number(parsed.amount) * 100) // 转分
      const clean = {
        merchant: String(parsed.merchant || '').trim().slice(0, 40) || undefined,
        category: CATEGORY_ENUM.includes(parsed.category) ? parsed.category : '其他',
        account: ACCOUNT_ENUM.includes(parsed.account) ? parsed.account : undefined,
        note: String(parsed.note || '').trim().slice(0, 60) || undefined,
        time: String(parsed.time || '').trim() || undefined,
      }
      if (!amount || Number.isNaN(amount) || amount <= 0) {
        return new Response(JSON.stringify({ ok: false, error: 'invalid amount' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json', ...CORS },
        })
      }

      return new Response(JSON.stringify({ ok: true, data: { ...clean, amount } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: `proxy error: ${e?.message || e}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }
  },
}
