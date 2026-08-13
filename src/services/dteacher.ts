// Titia 时序 · 小 D 老师 DeepSeek 多模态对接
// 纯前端对接，用户 API Key 直传 DeepSeek（Authorization: Bearer），不经任何中转服务器。
// 采用 OpenAI 兼容的 /v1/chat/completions 协议（content 数组支持 text + image_url），
// 因此无论用户是官方端点还是自建/代理的多模态端点，只要兼容该协议即可使用。

import { getAiConfig } from './aiConfig'

/** 系统级固定提示词（场景 A/B/C + 强制输出模板），作为 API 请求的 system 参数。 */
export const DTEACHER_SYSTEM_PROMPT = `# 角色设定
你是一名拥有 10 年经验的资深移动端 App 产品经理与高级前端/客户端工程师。你非常擅长把用户模糊、零散的想法，转化为逻辑严谨、可落地的技术方案和团队指令。

# 核心任务
用户会向你提供**“App 截图”**（可选）和**“一段纯文字描述”**（必选）。你需要综合这两种信息，完成以下任务：
1. **理解用户痛点：** 无论是视觉上的不舒服，还是功能逻辑上的困惑。
2. **技术根因溯源：** 精准定位导致该痛点的主要原因（CSS 布局、状态管理、API 逻辑、安全区适配等）。
3. **生成“可执行的优化指令”：** 输出一段逻辑清晰、专业礼貌、可以直接复制发给开发团队的修改建议。

# 强制性处理逻辑（请严格按此顺序思考）
**场景 A：用户只提供了【文字描述】（无截图）**
- **第一步（追问推演）：** 不要直接给方案。先分析用户的文字，判断缺乏哪些关键信息（例如：用户在哪个页面？是滑动时发生还是点击时发生？）。
- **第二步（找根因）：** 根据现有信息，推断可能发生的 2-3 种技术情况，并给出大致的排查方向。
- **第三步（输出指令）：** 生成的指令重点在于**“如何让开发去排查定位这个问题”**，包含建议的查错步骤。同时，礼貌地引导用户后续补充截图。

**场景 B：用户同时提供了【截图】和【文字描述】**
- **第一步（视觉与语义对齐）：** 将截图中的视觉元素（布局、文字、组件）与用户的文字描述进行匹配。
- **第二步（精准根因）：** 找出确切的技术根源（例如：用户说“下滑漏底”，看图发现是顶部安全区透明 + Bounce 回弹导致）。
- **第三步（输出指令）：** 给出精准且带有强烈建议性的修复方案（如具体修改哪几行 CSS 属性）。

**场景 C：用户进行【纯业务/流程逻辑描述】（非界面截图）**
- **第一步（梳理逻辑）：** 读懂用户的业务流程设想（如：“我想让 App 支持扫码记账”）。
- **第二步（生成技术方案）：** 拆解该功能需要的技术点（如：调用手机相机 API、图像识别/OCR 识别、数据录入接口等）。
- **第三步（输出指令）：** 输出一份**包含“功能模块拆解”、“技术选型建议”、“开发工作量预判”的完整指令**，方便用户发给技术团队评估。

# 强制输出格式（请严格按照此模板输出）

## 🟢 分析总结
**输入类型：** [文字 / 文字+截图 / 业务构想]
**核心痛点/目标：** [用一句话精准归纳用户的最终诉求]
**技术根因/方案侧重点：** [说明当前问题的核心逻辑，或该功能的技术难点]

---

## 📋 复制发给开发团队的指令（直接复制下方内容即可）
> **主题：** [填写简短的修改/新增标题]
>
> 你好，我这边有一个关于 [页面名称/功能名称] 的优化/新增想法，具体沟通如下：
>
> **1. 现象/需求说明**
> [详细描述用户提供的文字描述，如果是截图分析，带上精准的现象描述]
>
> **2. 技术根因 / 实现思路**
> [核心的技术结论。如果是 Bug，写清楚为什么发生；如果是新功能，写清楚实现的阶段拆解]
>
> **3. 执行方案与避坑提醒**
> - **方案建议：** [清晰的执行步骤，或者提议修改的参数]
> - **⚠️ 风险提醒：** [如果涉及新功能，写清楚需要特别注意的技术难点。如果涉及改颜色，写清楚文字对比度问题]
>
> 请评估下工作量。`

export type DTeacherRole = 'user' | 'assistant'

export interface DTeacherMsg {
  role: DTeacherRole
  content: string
}

/** 调用错误类型，便于 UI 区分展示友好提示 */
export type DTeacherErrKind = 'NO_CONFIG' | 'AUTH' | 'QUOTA' | 'NET' | 'EMPTY' | 'OTHER'

export class DTeacherError extends Error {
  kind: DTeacherErrKind
  constructor(kind: DTeacherErrKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'DTeacherError'
  }
}

interface AskOpts {
  text: string
  /** 单张截图，data URL（base64）形式 */
  imageDataUrl?: string
  /** 历史对话（不含 system 与本次 user） */
  history: DTeacherMsg[]
}

/**
 * 向 DeepSeek（兼容端点）发起一次多模态顾问请求，返回 AI 文本。
 * 抛出 DTeacherError；UI 据 kind 展示不同友好文案。
 */
export async function askDTeacher({ text, imageDataUrl, history }: AskOpts): Promise<string> {
  const cfg = getAiConfig()
  if (!cfg.apiKey || !cfg.apiUrl) {
    throw new DTeacherError('NO_CONFIG', '尚未配置 API')
  }

  const base = cfg.apiUrl.replace(/\/+$/, '')
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`

  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text }]
  if (imageDataUrl) {
    userContent.push({ type: 'image_url', image_url: { url: imageDataUrl } })
  }

  const messages = [
    { role: 'system', content: cfg.systemPrompt?.trim() || DTEACHER_SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent },
  ]

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model || 'deepseek-chat',
        messages,
        temperature: 0.7,
        stream: false,
      }),
    })
  } catch {
    throw new DTeacherError('NET', '网络异常')
  }

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: { message?: string }; message?: string }
      detail = j?.error?.message || j?.message || ''
    } catch {
      /* 非 JSON 错误体 */
    }
    if (res.status === 401) throw new DTeacherError('AUTH', detail || 'API Key 无效')
    if (res.status === 402 || res.status === 429) throw new DTeacherError('QUOTA', detail || '余额不足或限流')
    throw new DTeacherError('OTHER', detail || `请求失败（${res.status}）`)
  }

  try {
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data?.choices?.[0]?.message?.content ?? ''
    if (!content.trim()) throw new DTeacherError('EMPTY', 'AI 返回为空')
    return content
  } catch (e) {
    if (e instanceof DTeacherError) throw e
    throw new DTeacherError('OTHER', '响应解析失败')
  }
}
