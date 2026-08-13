import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { Card } from '../../components/base/Card'
import { SwipeRow } from '../../components/base/SwipeRow'
import { EmptyState } from '../../components/base/EmptyState'
import { PlusIcon } from '../../components/icons'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput, TextArea, ChipSelect } from '../../components/base/fields'
import { ImagePicker } from '../../components/base/ImagePicker'
import { MediaImage } from '../../components/base/MediaImage'
import { MediaPreview } from '../../components/base/MediaPreview'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useDiaryStore } from '../../stores/useDiaryStore'
import { useAppStore } from '../../stores/useAppStore'
import type { RecordEntity } from '../../db/types'

// Titia 时序 · 日记（底部 Sheet 表单 + 图片）
const MOODS = [
  { key: '😊', label: '😊' },
  { key: '😐', label: '😐' },
  { key: '😢', label: '😢' },
  { key: '😡', label: '😡' },
  { key: '😌', label: '😌' },
]
const WEATHERS = [
  { key: '☀️', label: '☀️' },
  { key: '🌧️', label: '🌧️' },
  { key: '⛅', label: '⛅' },
  { key: '❄️', label: '❄️' },
  { key: '🌫️', label: '🌫️' },
]

interface Draft {
  title: string
  content: string
  mood: string
  weather: string
  mediaIds: string[]
}

function emptyDraft(): Draft {
  return { title: '', content: '', mood: '', weather: '', mediaIds: [] }
}

// 表单组件自带 useState：Sheet 内的子树靠自身状态刷新，不被外层冻结的 ReactNode 拖累。
function DiaryForm({ initial, onSave }: { initial: Draft; onSave: (d: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>(initial)
  return (
    <div>
      <Field label="标题（可空）">
        <TextInput value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} placeholder="今天想记点什么" />
      </Field>
      <Field label="内容">
        <TextArea value={draft.content} onChange={(v) => setDraft({ ...draft, content: v })} placeholder="写点什么…" rows={4} />
      </Field>
      <Field label="心情">
        <ChipSelect options={MOODS} value={draft.mood} onChange={(v) => setDraft({ ...draft, mood: v })} />
      </Field>
      <Field label="天气">
        <ChipSelect options={WEATHERS} value={draft.weather} onChange={(v) => setDraft({ ...draft, weather: v })} />
      </Field>
      <Field label="图片（可空）">
        <ImagePicker mediaIds={draft.mediaIds} onChange={(ids) => setDraft({ ...draft, mediaIds: ids })} />
      </Field>
      <button onClick={() => onSave(draft)} className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg">
        保存
      </button>
    </div>
  )
}

function MediaRow({ ids }: { ids: string[] }) {
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  if (!ids || ids.length === 0) return null
  return (
    <>
      <div className="mt-2 flex gap-2 overflow-x-auto touch-manipulation">
        {ids.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setPreviewIdx(i)
            }}
            aria-label="查看图片"
            className="flex-shrink-0 p-0"
          >
            <MediaImage id={id} className="h-20 w-20 rounded-img object-cover" />
          </button>
        ))}
      </div>
      {previewIdx !== null && <MediaPreview ids={ids} initial={previewIdx} onClose={() => setPreviewIdx(null)} />}
    </>
  )
}

export function DiaryPage({ embedded = false, registerAdd }: { embedded?: boolean; registerAdd?: (fn: () => void) => void }) {
  const { items, loaded, load, create, update, remove } = useDiaryStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const moodOf = (rec: RecordEntity): string => (rec.payload as { mood?: string }).mood ?? ''

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  // 被时光页（JournalPage）内嵌时，把"写日记"入口交给时光页顶栏统一收纳（避免重复 ➕）
  useEffect(() => {
    if (embedded && registerAdd) registerAdd(startAdd)
  }, [embedded, registerAdd, startAdd])

  // 心情筛选（'' = 全部；分段控制器，置于月份列表内筛选该月记录）
  const [moodFilter, setMoodFilter] = useState('')
  // 按月收纳：选中月份（YYYY-MM）进入该月记录列表；null = 月份卡片列表
  const [month, setMonth] = useState<string | null>(null)
  const monthGroups = useMemo(() => {
    const map = new Map<string, RecordEntity[]>()
    for (const r of items) {
      const k = dayjs(r.occurredAt).format('YYYY-MM')
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])
  const monthItems = month ? items.filter((r) => dayjs(r.occurredAt).format('YYYY-MM') === month) : []
  const monthFiltered = moodFilter ? monthItems.filter((r) => moodOf(r) === moodFilter) : monthItems

  function startAdd() {
    open(
      <Sheet title="写日记" onClose={close}>
        <DiaryForm
          initial={emptyDraft()}
          onSave={async (d) => {
            if (!d.content.trim() && !d.title.trim()) return
            await create({
              title: d.title.trim() || undefined,
              content: d.content.trim() || undefined,
              mood: d.mood || undefined,
              weather: d.weather || undefined,
              mediaIds: d.mediaIds,
            })
            close()
            showToast('已记录')
          }}
        />
      </Sheet>,
    )
  }

  const startEdit = (rec: RecordEntity) => {
    const p = rec.payload as { mood?: string; weather?: string }
    const initial: Draft = {
      title: rec.title ?? '',
      content: rec.content ?? '',
      mood: p.mood ?? '',
      weather: p.weather ?? '',
      mediaIds: rec.mediaIds ?? [],
    }
    open(
      <Sheet title="编辑日记" onClose={close}>
        <DiaryForm
          initial={initial}
          onSave={async (d) => {
            await update(rec.id, {
              title: d.title.trim() || undefined,
              content: d.content.trim() || undefined,
              payload: { mood: d.mood || undefined, weather: d.weather || undefined },
              mediaIds: d.mediaIds,
            })
            close()
            showToast('已更新')
          }}
        />
      </Sheet>,
    )
  }

  const onDelete = async (rec: RecordEntity) => {
    if (await confirmSheet('删除日记', '这条日记将被删除，且不可恢复。')) {
      await remove(rec.id)
      showToast('已删除')
    }
  }

  // 详情 Sheet（只读完整内容；编辑/删除入口在底部；图片可点击预览）
  const openDetail = (rec: RecordEntity) => {
    open(
      <Sheet title="日记详情" onClose={close}>
        <DiaryDetail
          rec={rec}
          onEdit={() => {
            close()
            startEdit(rec)
          }}
          onDelete={async () => {
            close()
            await onDelete(rec)
          }}
        />
      </Sheet>,
    )
  }

  // 记录行（紧凑列表：日期块 + 标题/摘要 + 心情）
  const rowOf = (rec: RecordEntity) => {
    const mood = moodOf(rec)
    const weather = (rec.payload as { weather?: string }).weather
    return (
      <SwipeRow key={rec.id} onDelete={() => onDelete(rec)}>
      <Card onPress={() => openDetail(rec)}>
        <div className="flex items-center gap-3 p-3.5">
          <div className="flex h-11 w-14 flex-shrink-0 flex-col items-center justify-center rounded-btn bg-surface-sunken">
            <span className="text-base font-bold leading-none text-ink">{dayjs(rec.occurredAt).format('DD')}</span>
            <span className="mt-0.5 text-[10px] leading-none text-ink-3">{dayjs(rec.occurredAt).format('YYYY-MM')}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{rec.title || dayjs(rec.occurredAt).format('YYYY-MM-DD HH:mm')}</p>
            <p className="mt-0.5 truncate text-xs text-ink-3">{rec.content || '无内容'}</p>
          </div>
          {(mood || weather) && (
            <span className="flex-shrink-0 text-lg leading-none">
              {mood} {weather}
            </span>
          )}
          <span className="flex-shrink-0 text-ink-3">›</span>
        </div>
      </Card>
      </SwipeRow>
    )
  }

  // 月份子视图头部（返回 + 月份标题 + 心情分段控制器）：固定头部内容，独立渲染，避免悬浮割裂
  const subHeader = month !== null && (
    <>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setMonth(null)}
          aria-label="返回月份列表"
          className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
        >
          ‹
        </button>
        <h2 className="text-base font-semibold text-ink">{dayjs(month + '-01').format('YYYY 年 M 月')}</h2>
        <span className="text-xs text-ink-3">{monthItems.length} 条</span>
      </div>
      <div className="flex rounded-pill bg-surface-sunken p-1">
        {[{ key: '', label: '全部' }, ...MOODS].map((m) => (
          <button
            key={m.key || 'all'}
            onClick={() => setMoodFilter(moodFilter === m.key ? '' : m.key)}
            className={`flex-1 rounded-pill py-1.5 text-xs transition-colors ${
              moodFilter === m.key ? 'bg-surface font-semibold text-ink shadow-soft' : 'text-ink-3'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </>
  )

  // 列表内容（不含头部；头部由固定层渲染）
  const content = (
    <>
      {month === null ? (
        <>
          {!registerAdd && (
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-ink-3">按月归档</p>
              <button
                onClick={startAdd}
                className="pressable flex h-10 w-10 items-center justify-center rounded-pill bg-primary text-bg"
                aria-label="写日记"
              >
                <PlusIcon width={20} height={20} />
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <EmptyState
              text="还没有日记"
              action={
                <button onClick={startAdd} className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">
                  写下第一篇
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {monthGroups.map(([key, rows]) => (
                <Card key={key} onPress={() => setMonth(key)}>
                  <div className="flex items-center justify-between p-4">
                    <p className="font-medium text-ink">{dayjs(key + '-01').format('YYYY 年 M 月')}</p>
                    <span className="text-xs text-ink-3">
                      {rows.length} 条 ›
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {monthFiltered.length === 0 ? (
            <p className="rounded-card bg-surface p-4 text-center text-sm text-ink-3 shadow-soft">
              {moodFilter ? '该心情下本月还没有日记' : '该月还没有日记'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">{monthFiltered.map((rec) => rowOf(rec))}</div>
          )}
        </>
      )}
    </>
  )

  // 内嵌模式（空间/记录页右栏）：沿用宿主滚动容器，头部以 sticky 保留（去阴影，避免割裂）
  if (embedded) {
    return (
      <>
        {subHeader && (
          <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-2 pt-2">{subHeader}</div>
        )}
        {content}
      </>
    )
  }

  // 独立页面（底部 tab）：固定头部 + 独立滚动列表（彻底解决漏底/割裂/遮挡）
  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex-none bg-bg px-4 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
        {month === null ? (
          <h1 className="text-xl font-semibold text-ink">日记</h1>
        ) : (
          subHeader
        )}
      </header>
      <PullToRefresh onRefresh={reloadAll} className="bg-bg px-4 pb-[calc(var(--safe-top)+16px)] pt-2">
        {content}
      </PullToRefresh>
    </div>
  )
}

// —— 日记详情（列表点击后查看；只读完整内容 + 图片预览 + 编辑/删除入口） ——
function DiaryDetail({
  rec,
  onEdit,
  onDelete,
}: {
  rec: RecordEntity
  onEdit: () => void
  onDelete: () => void
}) {
  const mood = (rec.payload as { mood?: string }).mood
  const weather = (rec.payload as { weather?: string }).weather
  return (
    <div>
      <p className="text-lg font-semibold text-ink">{rec.title || dayjs(rec.occurredAt).format('YYYY-MM-DD HH:mm')}</p>
      <p className="mt-1 text-xs text-ink-3">
        {dayjs(rec.occurredAt).format('YYYY-MM-DD HH:mm')}
        {mood || weather ? ` · ${mood ?? ''} ${weather ?? ''}` : ''}
      </p>
      {rec.content && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{rec.content}</p>}
      {rec.mediaIds && rec.mediaIds.length > 0 && <MediaRow ids={rec.mediaIds} />}
      <div className="mt-5 flex gap-2">
        <button onClick={onDelete} className="flex-1 rounded-pill bg-surface-sunken px-4 py-2.5 text-sm text-ink-2">
          删除
        </button>
        <button onClick={onEdit} className="pressable flex-[1.4] rounded-pill bg-primary px-4 py-2.5 text-sm font-medium text-bg">
          编辑
        </button>
      </div>
    </div>
  )
}
