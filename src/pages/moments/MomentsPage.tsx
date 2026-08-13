import { useEffect, useMemo, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { NavBar } from '../../components/nav/NavBar'
import { PageHost } from '../../components/nav/PageHost'
import { Card } from '../../components/base/Card'
import { SwipeRow } from '../../components/base/SwipeRow'
import { EmptyState } from '../../components/base/EmptyState'
import { PlusIcon } from '../../components/icons'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput, TextArea } from '../../components/base/fields'
import { ImagePicker } from '../../components/base/ImagePicker'
import { MediaImage } from '../../components/base/MediaImage'
import { MediaPreview } from '../../components/base/MediaPreview'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useMomentsStore } from '../../stores/useMomentsStore'
import { useAppStore } from '../../stores/useAppStore'
import type { RecordEntity } from '../../db/types'

// Titia 时序 · 我们的时光（底部 Sheet 表单 + 图片）
type Kind = 'relation_touched' | 'relation_conflict'

interface Draft {
  person: string
  event: string
  whyMoved: string
  wordsToSay: string
  cause: string
  myThought: string
  theirThought: string
  summary: string
  improvement: string
  mediaIds: string[]
}

function emptyDraft(): Draft {
  return {
    person: '',
    event: '',
    whyMoved: '',
    wordsToSay: '',
    cause: '',
    myThought: '',
    theirThought: '',
    summary: '',
    improvement: '',
    mediaIds: [],
  }
}

function payloadOf(d: Draft, kind: Kind): Record<string, unknown> {
  if (kind === 'relation_touched') {
    return { person: d.person || undefined, event: d.event, whyMoved: d.whyMoved, wordsToSay: d.wordsToSay }
  }
  return {
    person: d.person || undefined,
    event: d.event,
    cause: d.cause,
    myThought: d.myThought,
    theirThought: d.theirThought,
    summary: d.summary,
    improvement: d.improvement,
  }
}

function MomentForm({ initial, kind, onSave }: { initial: Draft; kind: Kind; onSave: (d: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>(initial)
  const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v })
  return (
    <div>
      <Field label="关联人物（可空）">
        <TextInput value={draft.person} onChange={(v) => set('person', v)} placeholder="对象 / 朋友" />
      </Field>
      <Field label={kind === 'relation_touched' ? '发生了什么让你感动？' : '发生了什么矛盾？'}>
        <TextArea value={draft.event} onChange={(v) => set('event', v)} rows={3} />
      </Field>
      {kind === 'relation_touched' ? (
        <>
          <Field label="为什么感动？">
            <TextArea value={draft.whyMoved} onChange={(v) => set('whyMoved', v)} rows={2} />
          </Field>
          <Field label="想对 TA 说的话">
            <TextArea value={draft.wordsToSay} onChange={(v) => set('wordsToSay', v)} rows={2} />
          </Field>
        </>
      ) : (
        <>
          <Field label="原因">
            <TextArea value={draft.cause} onChange={(v) => set('cause', v)} rows={2} />
          </Field>
          <Field label="我的想法">
            <TextArea value={draft.myThought} onChange={(v) => set('myThought', v)} rows={2} />
          </Field>
          <Field label="对方可能的想法">
            <TextArea value={draft.theirThought} onChange={(v) => set('theirThought', v)} rows={2} />
          </Field>
          <Field label="事后总结">
            <TextArea value={draft.summary} onChange={(v) => set('summary', v)} rows={2} />
          </Field>
          <Field label="下次如何改善">
            <TextArea value={draft.improvement} onChange={(v) => set('improvement', v)} rows={2} />
          </Field>
        </>
      )}
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

export function MomentsPage({ embedded = false, registerAdd }: { embedded?: boolean; registerAdd?: (fn: () => void) => void }) {
  const { items, loaded, load, create, update, remove } = useMomentsStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [kind, setKind] = useState<Kind>('relation_touched')
  // 按月收纳：选中月份（YYYY-MM）进入该月记录列表
  const [month, setMonth] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  // 被时光页（JournalPage）内嵌时，把"新增"入口交给时光页顶栏统一收纳（避免重复 ➕）
  useEffect(() => {
    if (embedded && registerAdd) registerAdd(startAdd)
  }, [embedded, registerAdd, startAdd])

  const draftFrom = (m: RecordEntity): Draft => {
    const p = m.payload as Record<string, string>
    const k = m.type as Kind
    return {
      person: p.person ?? '',
      event: p.event ?? m.content ?? '',
      whyMoved: p.whyMoved ?? '',
      wordsToSay: p.wordsToSay ?? '',
      cause: p.cause ?? '',
      myThought: p.myThought ?? '',
      theirThought: p.theirThought ?? '',
      summary: p.summary ?? '',
      improvement: p.improvement ?? '',
      mediaIds: m.mediaIds ?? [],
    }
  }

  function startAdd() {
    const k = kind
    open(
      <Sheet title={k === 'relation_touched' ? '感动瞬间' : '矛盾复盘'} onClose={close}>
        <MomentForm
          initial={emptyDraft()}
          kind={k}
          onSave={async (d) => {
            if (!d.event.trim()) return
            await create(k, { content: d.event.trim(), payload: payloadOf(d, k), mediaIds: d.mediaIds })
            close()
            showToast('已记录')
          }}
        />
      </Sheet>,
    )
  }

  const startEdit = (m: RecordEntity) => {
    const k = m.type as Kind
    open(
      <Sheet title={k === 'relation_touched' ? '编辑感动瞬间' : '编辑矛盾复盘'} onClose={close}>
        <MomentForm
          initial={draftFrom(m)}
          kind={k}
          onSave={async (d) => {
            await update(m.id, { content: d.event.trim(), payload: payloadOf(d, k), mediaIds: d.mediaIds })
            close()
            showToast('已更新')
          }}
        />
      </Sheet>,
    )
  }

  const onDelete = async (m: RecordEntity) => {
    if (await confirmSheet('删除记录', '这条记录将被删除，且不可恢复。')) {
      await remove(m.id)
      showToast('已删除')
    }
  }

  // 详情 Sheet（只读完整内容；编辑/删除入口在底部；图片可点击预览）
  const openDetail = (m: RecordEntity) => {
    open(
      <Sheet title={m.type === 'relation_touched' ? '感动瞬间' : '矛盾复盘'} onClose={close}>
        <MomentDetail
          m={m}
          onEdit={() => {
            close()
            startEdit(m)
          }}
          onDelete={async () => {
            close()
            await onDelete(m)
          }}
        />
      </Sheet>,
    )
  }

  const content = (
    <>
      {/* + 按钮：顶部右对齐（参考憨憨把主要入口放在显眼位置）；被时光页内嵌时隐藏，由时光页顶栏统一收纳 */}
      {!registerAdd && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={startAdd}
            className="pressable flex h-9 w-9 items-center justify-center rounded-pill bg-primary text-bg"
            aria-label="新增"
          >
            <PlusIcon width={18} height={18} />
          </button>
        </div>
      )}

      {/* 二级分类入口：分段控制器（横格排列） */}
      <div className="mb-4 flex rounded-pill bg-surface-sunken p-1">
        {[
          { key: 'relation_touched', icon: '💞', label: '感动瞬间' },
          { key: 'relation_conflict', icon: '🔍', label: '矛盾复盘' },
        ].map((e) => {
          const on = kind === e.key
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => setKind(e.key as Kind)}
              aria-current={on ? 'true' : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2 text-sm transition-colors ${
                on ? 'bg-surface font-semibold text-ink shadow-soft' : 'text-ink-3'
              }`}
            >
              <span>{e.icon}</span>
              <span>{e.label}</span>
            </button>
          )
        })}
      </div>

      {(() => {
        const list = items.filter((m) => m.type === kind)
        if (list.length === 0) {
          return (
            <EmptyState
              text={kind === 'relation_touched' ? '还没有感动瞬间' : '还没有矛盾复盘'}
              action={
                <button onClick={startAdd} className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">
                  记录第一条
                </button>
              }
            />
          )
        }
        // 按月收纳：选中月份进入该月记录列表；null = 月份卡片列表
        if (month === null) {
          const groups = new Map<string, RecordEntity[]>()
          for (const m of list) {
            const k = dayjs(m.occurredAt).format('YYYY-MM')
            if (!groups.has(k)) groups.set(k, [])
            groups.get(k)!.push(m)
          }
          const entries = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]))
          return (
            <div className="flex flex-col gap-2">
              {entries.map(([key, rows]) => (
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
          )
        }
        // 月份子视图：该月记录列表
        const monthList = list.filter((m) => dayjs(m.occurredAt).format('YYYY-MM') === month)
        return (
          <>
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setMonth(null)}
                aria-label="返回月份列表"
                className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
              >
                ‹
              </button>
              <h2 className="text-base font-semibold text-ink">{dayjs(month + '-01').format('YYYY 年 M 月')}</h2>
              <span className="text-xs text-ink-3">{monthList.length} 条</span>
            </div>
            {monthList.length === 0 ? (
              <p className="rounded-card bg-surface p-4 text-center text-sm text-ink-3 shadow-soft">该月还没有记录</p>
            ) : (
              <div className="flex flex-col gap-2">
                {monthList.map((m) => {
                  const p = m.payload as Record<string, string>
                  const isTouched = m.type === 'relation_touched'
                  return (
                    <SwipeRow key={m.id} onDelete={() => onDelete(m)}>
                    <Card onPress={() => openDetail(m)}>
                      <div className="flex items-center gap-3 p-3.5">
                        <div className="flex h-11 w-14 flex-shrink-0 flex-col items-center justify-center rounded-btn bg-surface-sunken">
                          <span className="text-base font-bold leading-none text-ink">{dayjs(m.occurredAt).format('DD')}</span>
                          <span className="mt-0.5 text-[10px] leading-none text-ink-3">{dayjs(m.occurredAt).format('YYYY-MM')}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{m.content || p.event}</p>
                          <p className="mt-0.5 truncate text-xs text-ink-3">
                            {isTouched ? '💞 感动' : '🔍 矛盾'}
                            {p.person ? ` · @${p.person}` : ''}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-ink-3">›</span>
                      </div>
                    </Card>
                    </SwipeRow>
                  )
                })}
              </div>
            )}
          </>
        )
      })()}
    </>
  )

  if (embedded) return content
  return (
    <>
      <NavBar title="我们的时光" />
      <PageHost>{content}</PageHost>
    </>
  )
}

// —— 记录详情（列表点击后查看；只读完整内容 + 图片预览 + 编辑/删除入口） ——
function MomentDetail({ m, onEdit, onDelete }: { m: RecordEntity; onEdit: () => void; onDelete: () => void }) {
  const p = m.payload as Record<string, string>
  const isTouched = m.type === 'relation_touched'
  const lines: { label: string; value?: string }[] = isTouched
    ? [
        { label: '发生了什么', value: p.event || m.content },
        { label: '为什么感动', value: p.whyMoved },
        { label: '想对 TA 说', value: p.wordsToSay },
      ]
    : [
        { label: '发生了什么矛盾', value: p.event || m.content },
        { label: '原因', value: p.cause },
        { label: '我的想法', value: p.myThought },
        { label: '对方可能的想法', value: p.theirThought },
        { label: '事后总结', value: p.summary },
        { label: '下次如何改善', value: p.improvement },
      ]
  return (
    <div>
      <div className="flex items-center justify-between">
        <span
          className="rounded-pill px-2.5 py-1 text-xs"
          style={{ background: 'var(--color-highlight-soft)', color: 'var(--color-ink-2)' }}
        >
          {isTouched ? '💞 感动瞬间' : '🔍 矛盾复盘'}
        </span>
        <span className="text-xs text-ink-3">{dayjs(m.occurredAt).format('YYYY-MM-DD HH:mm')}</span>
      </div>
      {p.person && (
        <p className="mt-2 text-sm text-ink-2">
          关联人物：<span className="text-ink">{p.person}</span>
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2.5">
        {lines
          .filter((l) => l.value)
          .map((l) => (
            <div key={l.label}>
              <p className="text-xs text-ink-3">{l.label}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{l.value}</p>
            </div>
          ))}
      </div>
      {m.mediaIds && m.mediaIds.length > 0 && <MediaRow ids={m.mediaIds} />}
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
