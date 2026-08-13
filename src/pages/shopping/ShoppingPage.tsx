import { useEffect, useState } from 'react'
import { NavBar } from '../../components/nav/NavBar'
import { PageHost } from '../../components/nav/PageHost'
import { EmbeddedHeader } from '../../components/nav/EmbeddedHeader'
import { Card } from '../../components/base/Card'
import { EmptyState } from '../../components/base/EmptyState'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput } from '../../components/base/fields'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useShoppingStore } from '../../stores/useShoppingStore'
import { useAppStore } from '../../stores/useAppStore'
import type { ShoppingEntity } from '../../db/types'
import { SwipeRow } from '../../components/base/SwipeRow'

// Titia 时序 · 购物清单（/shopping）
// 输入即增；勾选置「已买」→ 立即从「想买」列表消失（收进可展开的「已买」折叠区），无需手动删除。
// 数据不删（status=completed 保留），折叠区可展开回顾/恢复/移除。
// embedded：供空间页右栏内嵌，去掉 NavBar/PageHost 外壳。

export function ShoppingPage({ embedded = false }: { embedded?: boolean }) {
  const { items, loaded, load, add, toggle, update, remove } = useShoppingStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const submit = () => {
    if (!draft.trim()) return
    add(draft.trim())
    setDraft('')
    showToast('已加入清单')
  }

  const todo = items.filter((i) => i.status !== 'completed')
  const done = items.filter((i) => i.status === 'completed')

  const onRemove = async (it: ShoppingEntity) => {
    if (await confirmSheet('移除', `从清单移除「${it.name}」？`)) {
      remove(it.id)
    }
  }

  // 修改清单项（名称）；今日页共用同一 store，修改后自动同步
  const openEdit = (it: ShoppingEntity) => {
    open(
      <Sheet title="修改清单项" onClose={close}>
        <EditForm
          initial={it.name}
          onSave={async (name) => {
            await update(it.id, { name: name.trim() })
            close()
            showToast('已修改')
          }}
        />
      </Sheet>,
    )
  }

  const content = (
    <>
      {embedded && <EmbeddedHeader title="购物清单" />}
      <div className="mb-3 rounded-card bg-surface p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="想买点什么…"
            className="titia-input min-w-0 flex-1 rounded-btn bg-surface-sunken px-3 py-2 text-ink outline-none"
          />
          <button onClick={submit} className="flex-shrink-0 rounded-pill bg-primary px-4 py-2 text-sm text-bg">
            加
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          text="清单还是空的"
          action={<span className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">记下一笔</span>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Group title="想买" items={todo} onToggle={toggle} onEdit={openEdit} onRemove={onRemove} />
          {/* 已买折叠区（勾选即移入，默认收起） */}
          {done.length > 0 && (
            <button
              onClick={() => setShowDone((v) => !v)}
              className="flex w-full items-center justify-between rounded-card bg-surface-sunken px-4 py-3 text-left"
              aria-expanded={showDone}
            >
              <span className="text-sm text-ink-3">已买 {done.length} 项</span>
              <span className={`text-ink-3 transition-transform ${showDone ? 'rotate-180' : ''}`}>▾</span>
            </button>
          )}
          {showDone && <Group title="" items={done} onToggle={toggle} onEdit={openEdit} onRemove={onRemove} muted />}
        </div>
      )}
    </>
  )

  if (embedded) return content
  return (
    <>
      <NavBar title="购物清单" />
      <PageHost>{content}</PageHost>
    </>
  )
}

// —— 修改表单（独立组件自管 useState，避免 Sheet 快照锁定受控输入） ——
function EditForm({ initial, onSave }: { initial: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial)
  return (
    <div>
      <Field label="名称">
        <TextInput value={name} onChange={setName} placeholder="想买点什么" />
      </Field>
      <button
        onClick={() => name.trim() && onSave(name)}
        disabled={!name.trim()}
        className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg disabled:opacity-50"
      >
        保存
      </button>
    </div>
  )
}

function Group({
  title,
  items,
  onToggle,
  onEdit,
  onRemove,
  muted = false,
}: {
  title: string
  items: ShoppingEntity[]
  onToggle: (id: string, bought: boolean) => void
  onEdit: (it: ShoppingEntity) => void
  onRemove: (it: ShoppingEntity) => void
  muted?: boolean
}) {
  if (items.length === 0) return null
  return (
    <section>
      {title && <h2 className="mb-2 text-base font-semibold text-ink">{title}</h2>}
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <SwipeRow key={it.id} onDelete={() => onRemove(it)} onPress={() => onToggle(it.id, it.status !== 'completed')}>
            <div className="flex items-center justify-between p-4">
              <span className={`flex-1 text-ink ${muted ? 'text-ink-3 line-through' : ''}`}>{it.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(it)
                }}
                className="text-xs text-ink-3"
              >
                改
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(it)
                }}
                className="ml-3 text-xs text-ink-3"
              >
                删除
              </button>
            </div>
          </SwipeRow>
        ))}
      </div>
    </section>
  )
}
