// Titia 时序 · 小 D 老师 AI 配置
// 用户的 DeepSeek API Key 属敏感隐私，且用户要求「直传不经服务器中转」。
// 故不进 IndexedDB 业务库（会随备份导出泄露），仅存 localStorage，随浏览器/PWA 隔离。

export interface AiConfig {
  /** 接口基地址，如 https://api.deepseek.com（不含末尾 /chat/completions） */
  apiUrl: string
  /** 用户自备 API Key，直传 DeepSeek，费用从用户账户扣减 */
  apiKey: string
  /** 模型名（多模态端点对应的模型 id），默认 deepseek-chat */
  model: string
  /** 用户自定义系统提示词；为空时回退到代码内置默认提示词（见 dteacher.ts） */
  systemPrompt: string
}

const STORAGE_KEY = 'titia.ai.dteacher'
const DEFAULT: AiConfig = {
  apiUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  systemPrompt: '',
}

export function getAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    return {
      apiUrl: parsed.apiUrl?.trim() || DEFAULT.apiUrl,
      apiKey: parsed.apiKey?.trim() || '',
      model: parsed.model?.trim() || DEFAULT.model,
      systemPrompt: typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt : DEFAULT.systemPrompt,
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveAiConfig(c: AiConfig) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiUrl: c.apiUrl.trim(),
        apiKey: c.apiKey.trim(),
        model: c.model.trim() || DEFAULT.model,
        systemPrompt: c.systemPrompt,
      }),
    )
  } catch {
    /* 隐私模式 / 容量满：静默失败，下次进入重新填写 */
  }
}
