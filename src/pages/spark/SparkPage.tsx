import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '../../components/base/Card'
import { EmptyState } from '../../components/base/EmptyState'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextArea, ChipSelect } from '../../components/base/fields'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useSparkStore } from '../../stores/useSparkStore'
import { useAppStore } from '../../stores/useAppStore'
import { DTeacherChat } from './DTeacherChat'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { reloadAll } from '../../services/reload'
import { back } from '../../app/useHashRoute'
import { BackIcon } from '../../components/icons'
import { SwipeRow } from '../../components/base/SwipeRow'

// Titia 时序 · 灵光一闪（Phase 7）
// 轻量：想法 + 归类 + 完成标记；无标题字段。
// 备忘录（category=memo）：多行输入，保存后点卡片可再编辑。

const CATS = [
  { key: 'movie', label: '电影' },
  { key: 'music', label: '音乐' },
  { key: 'study', label: '研究' },
  { key: 'product', label: '产品' },
  { key: 'other', label: '脑洞' },
  { key: 'memo', label: '备忘录' },
]

// 备忘录编辑表单
function MemoForm({
  initial,
  onSave,
}: {
  initial: { content: string; category: string }
  onSave: (d: { content: string; category: string }) => void
}) {
  const [d, setD] = useState(initial)
  return (
    <div>
      <Field label="内容">
        <TextArea value={d.content} onChange={(v) => setD({ ...d, content: v })} rows={5} />
      </Field>
      <Field label="分类">
        <ChipSelect
          options={CATS.map((c) => ({ key: c.key, label: c.label }))}
          value={d.category}
          onChange={(v) => setD({ ...d, category: v })}
        />
      </Field>
      <button onClick={() => onSave(d)} className="pressable mt-2 w-full rounded-pill bg-highlight px-4 py-2.5 text-sm text-bg">
        保存
      </button>
    </div>
  )
}

export function SparkPage() {
  const { items, loaded, load, create, toggleDone, update, remove } = useSparkStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [cat, setCat] = useState('other')
  const [draft, setDraft] = useState('')
  const [chatOpen, setChatOpen] = useState(false)

  const isMemo = cat === 'memo'

  const onRemove = async (id: string) => {
    if (await confirmSheet('删除灵光', '删除这条灵光一闪？')) {
      remove(id)
    }
  }

  const openMemoForm = (item: (typeof items)[number] | null) => {
    const editing = item
    open(
      <Sheet title={editing ? '编辑备忘录' : '新备忘录'} onClose={close}>
        <MemoForm
          initial={{
            content: editing?.content ?? draft,
            category: ((editing?.payload as { category?: string })?.category as string) ?? 'memo',
          }}
          onSave={async (d) => {
            if (!d.content.trim()) return
            if (editing) {
              await update(editing.id, {
                content: d.content.trim(),
                payload: { ...editing.payload, category: d.category },
              })
              showToast('已更新')
            } else {
              await create({ content: d.content.trim(), category: d.category })
              setDraft('')
              showToast('已记录')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const submit = () => {
    if (!draft.trim()) return
    create({ content: draft.trim(), category: cat })
    setDraft('')
    showToast('记下了')
  }

  return (
    <div className="flex h-full flex-col">
      {/* 固定头部：全宽铺满、无卡片/边框/阴影，不随列表滚动（彻底解决漏底/割裂/遮挡） */}
      <header className="flex-none bg-bg" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
        {/* 标题行（含返回，替代原 NavBar；底色同页，无分隔线） */}
        <div className="flex items-center gap-1 px-5 pb-2">
          <button
            onClick={back}
            className="pressable -ml-1 flex h-9 w-9 items-center justify-center text-ink"
            aria-label="返回"
          >
            <BackIcon width={24} height={24} />
          </button>
          <h1 className="text-xl font-semibold text-ink">灵光一闪</h1>
        </div>

        {/* 输入区：归类标签 + 想法输入（固定在头部，不再作为悬浮卡片） */}
        <div className="px-5 pb-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`rounded-pill px-3 py-1 text-xs ${cat === c.key ? 'bg-highlight text-bg' : 'bg-surface-sunken text-ink-2'}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* AI 智能顾问：永久置顶独立入口（脱离列表、区别于普通备忘录） */}
          <button
            onClick={() => setChatOpen(true)}
            className="mb-3 mt-3 flex w-full items-center gap-3 rounded-btn bg-highlight-soft px-4 py-3 text-left active:opacity-80"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-pill bg-highlight text-base text-bg">
              ✨
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">小 D 老师</p>
              <p className="truncate text-xs text-ink-2">AI 智能顾问 · 随时聊聊你的灵感</p>
            </div>
            <span className="flex-shrink-0 text-lg text-ink-3">›</span>
          </button>

          <div className="flex items-center gap-2">
            {isMemo ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="记一条备忘录…（支持多行，保存后可编辑）"
                rows={3}
                className="min-h-[64px] flex-1 resize-none rounded-btn bg-surface-sunken px-3 py-2 text-ink outline-none"
                style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
              />
            ) : (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="一闪而过的念头…"
                className="flex-1 rounded-btn bg-surface-sunken px-3 py-2 text-ink outline-none"
                style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
              />
            )}
            <button onClick={submit} className="rounded-pill bg-highlight px-4 py-2 text-sm text-bg">
              记
            </button>
          </div>
        </div>
      </header>

      {/* 列表区：独立滚动容器，overflow 裁剪，内容永不越过头部下边缘（物理斩断漏底） */}
      <PullToRefresh onRefresh={reloadAll} className="px-5 pt-2 pb-[calc(var(--safe-top)+16px)]">
        {items.length === 0 ? (
          <EmptyState
            text="还没有灵光"
            action={<span className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">记下第一个念头</span>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((s) => {
              const p = s.payload as { category: string; done: boolean }
              const catLabel = CATS.find((c) => c.key === p.category)?.label ?? '脑洞'
              const isMemoItem = p.category === 'memo'
              return (
              <SwipeRow
                key={s.id}
                onDelete={() => onRemove(s.id)}
                onPress={() => (isMemoItem ? openMemoForm(s) : toggleDone(s.id, !p.done))}
                className={isMemoItem ? 'col-span-2' : ''}
              >
                  <div className="p-4">
                    <span className="rounded-pill bg-highlight-soft px-2 py-0.5 text-xs text-ink-2">{catLabel}</span>
                    <p className={`mt-2 whitespace-pre-wrap text-sm text-ink ${p.done ? 'text-ink-3 line-through' : ''}`}>
                      {s.content}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemove(s.id)
                        }}
                        className="text-xs text-ink-3"
                      >
                        {p.done && !isMemoItem ? '已完成 · 删除' : isMemoItem ? '删除' : '删除'}
                      </button>
                      {isMemoItem && (
                        <span className="text-xs text-ink-3">{dayjs(s.occurredAt).format('MM-DD HH:mm')}</span>
                      )}
                    </div>
                  </div>
                </SwipeRow>
              )
            })}
          </div>
        )}
      </PullToRefresh>

      {/* 全屏 AI 顾问（独立 fixed 层，盖住整个 App） */}
      {chatOpen && <DTeacherChat onClose={() => setChatOpen(false)} />}
    </div>
  )
}
