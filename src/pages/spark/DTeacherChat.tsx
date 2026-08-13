import { useEffect, useRef, useState, type ChangeEvent, type TouchEvent } from 'react'
import { askDTeacher, DTeacherError, DTEACHER_SYSTEM_PROMPT, type DTeacherMsg } from '../../services/dteacher'
import { getAiConfig, saveAiConfig, type AiConfig as AiCfg } from '../../services/aiConfig'
import { MarkdownLite } from '../../components/base/MarkdownLite'
import { useAppStore } from '../../stores/useAppStore'

// 小 D 老师 · 全屏 AI 顾问
// 纯前端：用户 DeepSeek API Key 直传，不经服务器。
// 全屏层 fixed inset-0 z-[80]（高于 Sheet z-50 / MediaPreview z-70），适配灵动岛安全区；
// 键盘弹起时 fixed 容器相对 visual viewport 重定位，底部输入栏自动贴键盘、对话列表 flex-1 跟随滚动。

export function DTeacherChat({ onClose }: { onClose: () => void }) {
  const showToast = useAppStore((s) => s.showToast)
  const [messages, setMessages] = useState<DTeacherMsg[]>([])
  const [input, setInput] = useState('')
  const [image, setImage] = useState<{ dataUrl: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setImage({ dataUrl: reader.result as string })
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  const send = async () => {
    if (sending) return
    if (!input.trim() && !image) return
    setError(null)
    const text = input.trim() || '（请结合截图分析）'
    const hasImg = !!image
    const history = messages
    setMessages((m) => [...m, { role: 'user', content: text + (hasImg ? ' [附截图]' : '') }])
    setInput('')
    const img = image?.dataUrl
    setImage(null)
    setSending(true)
    try {
      const reply = await askDTeacher({ text, imageDataUrl: img, history })
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (e) {
      const msg =
        e instanceof DTeacherError
          ? e.kind === 'NO_CONFIG'
            ? '请先配置 DeepSeek API（右上角 ⚙）'
            : e.kind === 'AUTH'
              ? 'API Key 无效，请检查配置'
              : e.kind === 'QUOTA'
                ? 'API 余额不足或限流，请稍后重试'
                : '暂时无法连接 AI，请稍后重试'
          : '暂时无法连接 AI，请稍后重试'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制')
    } catch {
      showToast('复制失败')
    }
  }

  // 右滑返回：从左边缘起、向右滑 >80px 触发
  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (touchX.current < 40 && dx > 80) onClose()
    touchX.current = null
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-bg"
      onTouchStart={showConfig ? undefined : onTouchStart}
      onTouchEnd={showConfig ? undefined : onTouchEnd}
    >
      {showConfig ? (
        <ConfigView onBack={() => setShowConfig(false)} />
      ) : (
        <>
          {/* 顶部：返回箭头 + 标题 + 配置（安全区避让） */}
          <header
            className="flex items-center gap-1 px-2 py-2"
            style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
          >
            <button
              onClick={onClose}
              aria-label="返回"
              className="flex h-9 w-9 items-center justify-center rounded-pill text-2xl leading-none text-ink"
            >
              ‹
            </button>
            <h1 className="flex-1 text-center text-base font-semibold text-ink">小 D 老师</h1>
            <button
              onClick={() => setShowConfig(true)}
              aria-label="接口配置"
              className="flex h-9 w-9 items-center justify-center rounded-pill text-lg text-ink-2"
            >
              ⚙
            </button>
          </header>

          {/* 对话列表 */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
            {messages.length === 0 && !sending && (
              <div className="mt-12 px-6 text-center text-sm leading-relaxed text-ink-3">
                把你的产品想法或界面问题告诉小 D 老师，可附一张截图，它会生成可直接发给开发团队的优化指令。
              </div>
            )}
            {messages.map((m, idx) =>
              m.role === 'user' ? (
                <div key={idx} className="flex justify-end">
                  <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl bg-primary-soft px-3 py-2 text-[13px] leading-relaxed text-ink">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={idx} className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl bg-surface px-3 py-2 shadow-soft">
                    <MarkdownLite text={m.content} />
                    <button
                      onClick={() => copy(m.content)}
                      className="mt-2 text-xs font-medium text-highlight"
                    >
                      一键复制
                    </button>
                  </div>
                </div>
              ),
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-surface px-3 py-2 text-[13px] text-ink-3">思考中…</div>
              </div>
            )}
          </div>

          {/* 错误提示条 */}
          {error && (
            <div className="mx-3 mb-1 flex items-center justify-between gap-2 rounded-btn bg-surface-sunken px-3 py-2 text-xs text-ink-2">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-ink-3" aria-label="关闭提示">
                ×
              </button>
            </div>
          )}

          {/* 底部输入栏（安全区避让，键盘弹起时贴键盘上方） */}
          <div
            className="border-t border-line bg-bg px-3 pt-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
          >
            {image && (
              <div className="mb-2 flex items-center gap-2">
                <img src={image.dataUrl} alt="" className="h-14 w-14 rounded-img object-cover" />
                <button onClick={() => setImage(null)} className="text-xs text-ink-3">
                  移除
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="添加截图"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-lg text-ink-2"
              >
                📷
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={1}
                placeholder="描述你的想法或界面问题…"
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-btn bg-surface-sunken px-3 py-2 text-sm text-ink outline-none"
                style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
              />
              <button
                onClick={() => void send()}
                disabled={sending}
                className="h-10 shrink-0 rounded-pill bg-highlight px-4 text-sm text-bg disabled:opacity-40"
              >
                {sending ? '…' : '发送'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 隐藏的文件选择器（始终存在，被配置视图隐藏也不影响） */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
    </div>
  )
}

// 接口配置子视图（内联，避免与全屏层叠加层级冲突）
function ConfigView({ onBack }: { onBack: () => void }) {
  const showToast = useAppStore((s) => s.showToast)
  const [cfg, setCfg] = useState<AiCfg>(() => getAiConfig())

  const save = () => {
    if (!cfg.apiKey.trim()) {
      showToast('请填写 API Key')
      return
    }
    saveAiConfig(cfg)
    showToast('已保存')
    onBack()
  }

  const field = (label: string, value: string, onChange: (v: string) => void, type = 'text', placeholder = '') => (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-2">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-btn bg-surface-sunken px-3 py-2 text-sm text-ink outline-none"
        style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
      />
    </label>
  )

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex items-center gap-2 px-2 py-2"
        style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
      >
        <button
          onClick={onBack}
          aria-label="返回"
          className="flex h-9 w-9 items-center justify-center rounded-pill text-2xl leading-none text-ink"
        >
          ‹
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-ink">接口配置</h1>
        <div className="w-9" />
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {field('接口地址（不含 /chat/completions）', cfg.apiUrl, (v) => setCfg({ ...cfg, apiUrl: v }), 'text', 'https://api.deepseek.com')}
        {field('API Key（直传 DeepSeek，不经服务器）', cfg.apiKey, (v) => setCfg({ ...cfg, apiKey: v }), 'password', 'sk-...')}
        {field('模型名（多模态端点对应的模型 id）', cfg.model, (v) => setCfg({ ...cfg, model: v }), 'text', 'deepseek-chat')}

        {/* 系统提示词（自定义 System Prompt）：多行可滚动文本框，默认预填写死代码内置值 */}
        <div className="block">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-ink-2">系统提示词 (System Prompt)</span>
            <button
              type="button"
              onClick={() => setCfg({ ...cfg, systemPrompt: '' })}
              className="text-xs font-medium text-highlight"
            >
              恢复默认提示词
            </button>
          </div>
          <textarea
            value={cfg.systemPrompt || DTEACHER_SYSTEM_PROMPT}
            onChange={(e) => setCfg({ ...cfg, systemPrompt: e.target.value })}
            rows={10}
            className="w-full resize-none rounded-btn bg-surface-sunken px-3 py-2 text-sm leading-relaxed text-ink outline-none"
            style={{ WebkitUserSelect: 'text', userSelect: 'text', maxHeight: '14rem' }}
          />
          <p className="mt-1 text-xs leading-relaxed text-ink-3">
            你可以在此自由调整小 D 老师的思考方式和回答边界。修改后的提示词将在下一次提问时生效。
          </p>
        </div>

        <p className="text-xs leading-relaxed text-ink-3">
          Key 与提示词均仅保存在本机（localStorage），不会上传到任何服务器，也不会进入备份导出。调用时由你的设备直连 DeepSeek，费用从你的账户扣减。
        </p>
      </div>
      <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2">
        <button onClick={save} className="w-full rounded-pill bg-highlight py-2.5 text-sm text-bg">
          保存
        </button>
      </div>
    </div>
  )
}
