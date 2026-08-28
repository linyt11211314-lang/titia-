import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { NavBar } from '../../components/nav/NavBar'
import { PageHost } from '../../components/nav/PageHost'
import { Card } from '../../components/base/Card'
import { SwipeRow } from '../../components/base/SwipeRow'
import { EmptyState } from '../../components/base/EmptyState'
import { PlusIcon } from '../../components/icons'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput } from '../../components/base/fields'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useTodoStore, isTodoDue } from '../../stores/useTodoStore'
import { useAppStore } from '../../stores/useAppStore'
import type { TodoEntity } from '../../db/types'

function fmt(ts?: number): string {
  return ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : ''
}

function TodoForm({
  initial,
  onSave,
}: {
  initial: { title: string; remindAt: number | null }
  onSave: (title: string, remindAt: number | null) => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [remind, setRemind] = useState(initial.remindAt ? fmt(initial.remindAt) : '')
  return (
    <div>
      <Field label="待办内容">
        <TextInput value={title} onChange={setTitle} placeholder="想记住的小事" />
      </Field>
      <Field label="提醒时间（可空）">
        <TextInput value={remind} onChange={setRemind} placeholder="YYYY-MM-DD HH:mm" />
      </Field>
      <button
        onClick={() => {
          if (!title.trim()) return
          const ts = remind.trim() ? dayjs(remind.trim()).valueOf() : null
          if (remind.trim() && Number.isNaN(ts)) return
          onSave(title.trim(), ts)
        }}
        className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg"
      >
        保存
      </button>
    </div>
  )
}

// Titia 时序 · 待办（独立模块页）
// 交互：点击完成 → 该项立即从列表消失（收进「已完成」折叠区），无需手动删除。
// 数据不删（done=true 保留在 IndexedDB），折叠区可展开回顾/恢复/删除。
export function TodoPage() {
  const { todos, loaded, load, create, update, toggle, remove } = useTodoStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  // 未完成项（主列表，点击完成即消失）；已完成项（折叠区）
  const active = [...todos]
    .filter((t) => !t.done)
    .sort((a, b) => {
      const rank = (t: TodoEntity) => (isTodoDue(t) ? 0 : 1)
      return rank(a) - rank(b) || (a.remindAt ?? 0) - (b.remindAt ?? 0) || (a.order ?? 0) - (b.order ?? 0)
    })
  const doneList = todos.filter((t) => t.done)

  const startAdd = () => {
    open(
      <Sheet title="新待办" onClose={close}>
        <TodoForm
          initial={{ title: '', remindAt: null }}
          onSave={async (title, remindAt) => {
            await create(title, remindAt ?? undefined)
            close()
            showToast('已添加')
          }}
        />
      </Sheet>,
    )
  }

  const startEdit = (t: TodoEntity) => {
    open(
      <Sheet title="编辑待办" onClose={close}>
        <TodoForm
          initial={{ title: t.title, remindAt: t.remindAt ?? null }}
          onSave={async (title, remindAt) => {
            await update(t.id, { title, remindAt })
            close()
            showToast('已更新')
          }}
        />
      </Sheet>,
    )
  }

  const onDelete = async (t: TodoEntity) => {
    if (await confirmSheet('删除待办', '删除这条待办？')) {
      await remove(t.id)
      showToast('已删除')
    }
  }

  return (
    <>
      <NavBar
        title="待办"
        right={
          <button onClick={startAdd} className="pressable flex h-9 w-9 items-center justify-center rounded-pill bg-primary text-bg" aria-label="新增待办">
            <PlusIcon width={18} height={18} />
          </button>
        }
      />
      <PageHost>
        {todos.length === 0 ? (
          <EmptyState
            text="还没有待办，添加第一件小事"
            action={
              <button onClick={startAdd} className="rounded-pill bg-primary px-4 py-2 text-sm text-bg">
                添加待办
              </button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {active.length === 0 ? (
              <p className="rounded-card bg-surface px-4 py-8 text-center text-sm text-ink-3 shadow-soft">全部完成 🎉</p>
            ) : (
              active.map((t) => {
                const due = isTodoDue(t)
                return (
                  <SwipeRow key={t.id} onDelete={() => onDelete(t)}>
                  <Card onPress={() => startEdit(t)}>
                    <div className="flex items-center gap-3 p-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle(t.id, !t.done)
                        }}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-pill border"
                        style={{
                          borderColor: t.done ? 'var(--color-primary)' : due ? 'var(--color-accent)' : 'var(--color-line)',
                          background: t.done ? 'var(--color-primary)' : 'transparent',
                        }}
                        aria-label="标记完成"
                      >
                        {t.done && <span className="text-xs text-on-primary">✓</span>}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate ${due ? 'font-medium text-ink' : 'text-ink'}`}>{t.title}</p>
                        {t.remindAt && <p className="mt-0.5 text-xs text-ink-3">{fmt(t.remindAt)}{due ? ' · 到点' : ''}</p>}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(t)
                        }}
                        className="flex-shrink-0 text-ink-3"
                      >
                        删除
                      </button>
                    </div>
                  </Card>
                  </SwipeRow>
                )
              })
            )}

            {/* 已完成折叠区（点击完成即移入，默认收起） */}
            {doneList.length > 0 && (
              <button
                onClick={() => setShowDone((v) => !v)}
                className="mt-1 flex w-full items-center justify-between rounded-card bg-surface-sunken px-4 py-3 text-left"
                aria-expanded={showDone}
              >
                <span className="text-sm text-ink-3">已完成 {doneList.length} 项</span>
                <span className={`text-ink-3 transition-transform ${showDone ? 'rotate-180' : ''}`}>▾</span>
              </button>
            )}
            {showDone &&
              doneList.map((t) => (
                <SwipeRow key={t.id} onDelete={() => onDelete(t)}>
                <Card variant="plain" onPress={() => toggle(t.id, !t.done)}>
                  <div className="flex items-center gap-3 p-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(t.id, !t.done)
                      }}
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-pill border"
                      style={{ borderColor: 'var(--color-primary)', background: 'var(--color-primary)' }}
                      aria-label="标记未完成"
                    >
                      <span className="text-xs text-on-primary">✓</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ink-3 line-through">{t.title}</p>
                      {t.remindAt && <p className="mt-0.5 text-xs text-ink-3">{fmt(t.remindAt)}</p>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(t)
                      }}
                      className="flex-shrink-0 text-ink-3"
                    >
                      删除
                    </button>
                  </div>
                </Card>
                </SwipeRow>
              ))}
          </div>
        )}
      </PageHost>
    </>
  )
}
