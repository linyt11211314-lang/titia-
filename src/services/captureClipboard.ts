// Titia 时序 · 一键拾光「剪贴板接力」通道
// 背景：iOS PWA 无法注册 URL Scheme / Universal Link / App Intents（均需原生 App），
// 快捷方式无法直接唤起 PWA 独立窗口。改用系统剪贴板传递识别数据：
//   快捷方式：截屏 → OCR → 文本加前缀写入剪贴板 → 提示打开 Titia
//   App：读取剪贴板（TITIA_CAPTURE:: 前缀）→ 解析 → 显示识别预览 → 确认保存
// 剪贴板是设备级共享（跨 Safari/PWA 容器），数据不经 URL、可扩展（后续可传图片）。

const PREFIX = 'TITIA_CAPTURE::'

export interface CaptureClipData {
  text?: string
  amount?: number // 元
  account?: string
  time?: string
  mediaB64?: string // 预留：图片附件（base64）
}

// 同容器内跨页面传递（App 内部 navigate 不刷新页面，模块级变量最可靠）
let pending: CaptureClipData | null = null

export function setPendingCapture(d: CaptureClipData | null): void {
  pending = d
}

export function takePendingCapture(): CaptureClipData | null {
  const d = pending
  pending = null
  return d
}

export const CAPTURE_PREFIX = PREFIX

/** 读取剪贴板：命中 TITIA_CAPTURE:: 前缀则解析并清空，返回 true；已处理过的内容不重复识别 */
export async function tryReadCaptureClipboard(): Promise<boolean> {
  try {
    const t = await navigator.clipboard.readText()
    if (!t || !t.startsWith(PREFIX)) return false
    const payload = t.slice(PREFIX.length).trim()
    // 防重复（需求九）：同一份内容已处理过 → 不再次进入识别流程
    if (isCaptureDone(payload)) {
      try {
        await navigator.clipboard.writeText('')
      } catch {
        /* 忽略 */
      }
      return false
    }
    markCaptureDone(payload)
    // 结构化 JSON 优先，否则整段作为 OCR 文本
    let data: CaptureClipData = { text: payload }
    if (payload.startsWith('{')) {
      try {
        const j = JSON.parse(payload) as CaptureClipData
        if (j && (j.text || j.amount)) data = j
      } catch {
        /* 非 JSON，按纯文本 */
      }
    }
    setPendingCapture(data)
    // 清空剪贴板，避免重复拾取
    try {
      await navigator.clipboard.writeText('')
    } catch {
      /* 忽略 */
    }
    return true
  } catch {
    // 无权限 / 非用户手势 / 非 secure context → 静默
    return false
  }
}

// ── 防重复（需求九）：识别 ID = 剪贴板内容哈希；已处理的不再进入识别流程 ──
const DONE_KEY = 'titia.captureDone'
const DONE_MAX = 20

function hashOf(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return 'h' + Math.abs(h).toString(36)
}

/** 标记某份剪贴板内容已处理（去重用） */
export function markCaptureDone(payload: string): void {
  try {
    const arr = JSON.parse(localStorage.getItem(DONE_KEY) || '[]') as string[]
    arr.push(hashOf(payload))
    const cut = arr.slice(-DONE_MAX)
    localStorage.setItem(DONE_KEY, JSON.stringify(cut))
  } catch {
    /* 忽略 */
  }
}

/** 该剪贴板内容是否已处理过 */
export function isCaptureDone(payload: string): boolean {
  try {
    const arr = JSON.parse(localStorage.getItem(DONE_KEY) || '[]') as string[]
    return arr.includes(hashOf(payload))
  } catch {
    return false
  }
}
