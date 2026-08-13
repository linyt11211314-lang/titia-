import { useState } from 'react'
import { Sheet } from '../../components/base/Sheet'
import { useBookStore } from '../../stores/useBookStore'
import { useCategoryStore } from '../../stores/useCategoryStore'
import { useAccountStore } from '../../stores/useAccountStore'
import { useAppStore } from '../../stores/useAppStore'
import type { RuleEntity } from '../../db/types'

// Titia 时序 · 识别规则管理（关键词 / 交易方规则 → 自动归类）
// 复用现有 rules 表（RuleEntity：keyword + merchant + category + account + priority + hitCount）。
// 列表：按 priority 降序；支持新增/编辑/删除/调优先级。系统默认规则（priority 0）与用户规则一起展示，均可管理。

function RuleForm({
  initial,
  onCancel,
  onDone,
}: {
  initial?: RuleEntity
  onCancel: () => void
  onDone: () => void
}) {
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  const showToast = useAppStore((s) => s.showToast)
  const saveRule = useBookStore((s) => s.saveRule)
  const updateRule = useBookStore((s) => s.updateRule)
  const isEdit = !!initial
  const [d, setD] = useState({
    keyword: initial?.keyword ?? '',
    merchant: initial?.merchant ?? '',
    category: initial?.category ?? '',
    account: initial?.account ?? '',
    priority: initial?.priority ?? 1,
  })

  const submit = async () => {
    const keyword = d.keyword.trim()
    const merchant = d.merchant.trim()
    if (!keyword && !merchant) {
      showToast('关键词或交易方至少填一项')
      return
    }
    const payload = {
      keyword: keyword || merchant, // 只有交易方时用它做关键词兜底，保证可匹配
      merchant: merchant || undefined,
      category: d.category.trim() || undefined,
      account: d.account.trim() || undefined,
      priority: d.priority,
    }
    try {
      if (isEdit) {
        await updateRule(initial.id, payload)
        showToast('已更新规则')
      } else {
        await saveRule({ ...payload, hitCount: 0 })
        showToast('已添加规则')
      }
      onDone()
    } catch {
      showToast('保存失败')
    }
  }

  return (
    <Sheet title={isEdit ? '编辑规则' : '新增规则'} onClose={onCancel}>
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-sm font-medium text-ink-2">关键词</p>
          <input
            value={d.keyword}
            onChange={(e) => setD((p) => ({ ...p, keyword: e.target.value }))}
            placeholder="如 超市 / 瑞幸（匹配备注或交易对象包含该词）"
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-sm text-ink outline-none"
          />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-ink-2">交易方（可空）</p>
          <input
            value={d.merchant}
            onChange={(e) => setD((p) => ({ ...p, merchant: e.target.value }))}
            placeholder="如 山姆会员店（匹配交易对象包含该词）"
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-sm text-ink outline-none"
          />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-ink-2">目标分类</p>
          <select
            value={d.category}
            onChange={(e) => setD((p) => ({ ...p, category: e.target.value }))}
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-sm text-ink outline-none"
          >
            <option value="">默认（不指定分类）</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-ink-2">账户（可空）</p>
          <select
            value={d.account}
            onChange={(e) => setD((p) => ({ ...p, account: e.target.value }))}
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-sm text-ink outline-none"
          >
            <option value="">默认（不指定账户）</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium text-ink-2">优先级（数字越大越优先）</p>
          <select
            value={d.priority}
            onChange={(e) => setD((p) => ({ ...p, priority: Number(e.target.value) }))}
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-sm text-ink outline-none"
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button onClick={() => void submit()} className="pressable mt-1 w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-medium text-bg">
          保存
        </button>
      </div>
    </Sheet>
  )
}

export function RulesManager() {
  const rules = useBookStore((s) => s.rules)
  const updateRule = useBookStore((s) => s.updateRule)
  const removeRule = useBookStore((s) => s.removeRule)
  const showToast = useAppStore((s) => s.showToast)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RuleEntity | undefined>(undefined)

  const sorted = [...rules].sort((a, b) => b.priority - a.priority || b.hitCount - a.hitCount)

  const bump = async (r: RuleEntity, delta: number) => {
    const next = Math.min(9, Math.max(0, r.priority + delta))
    if (next === r.priority) return
    await updateRule(r.id, { priority: next })
    showToast(`优先级 → ${next}`)
  }

  const del = async (r: RuleEntity) => {
    await removeRule(r.id)
    showToast('已删除规则')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-2">识别规则（{sorted.length}）</p>
        <button
          onClick={() => {
            setEditing(undefined)
            setFormOpen(true)
          }}
          className="pressable rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-bg"
        >
          + 新增规则
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((r) => (
          <div key={r.id} className="rounded-card bg-surface-sunken/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {r.keyword}
                {r.merchant && r.merchant !== r.keyword ? <span className="text-ink-3">（{r.merchant}）</span> : null}
              </p>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  onClick={() => void bump(r, -1)}
                  aria-label="降低优先级"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink-2"
                >
                  −
                </button>
                <span className="min-w-[26px] text-center text-xs text-ink-3">P{r.priority}</span>
                <button
                  onClick={() => void bump(r, 1)}
                  aria-label="提高优先级"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink-2"
                >
                  ＋
                </button>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-xs text-ink-3">
                {r.category ? `→ ${r.category}` : '未指定分类'}
                {r.account ? ` · ${r.account}` : ''}
                {r.hitCount > 0 ? ` · 命中 ${r.hitCount} 次` : ''}
              </p>
              <div className="flex flex-shrink-0 gap-3">
                <button
                  onClick={() => {
                    setEditing(r)
                    setFormOpen(true)
                  }}
                  className="text-xs text-primary"
                >
                  编辑
                </button>
                <button onClick={() => void del(r)} className="text-xs text-ink-3">
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="rounded-card bg-surface-sunken/60 p-4 text-sm text-ink-3">
            还没有识别规则。点「+ 新增规则」添加关键词或交易方规则，命中后自动预填分类/账户（系统内置规则也会显示在这里）。
          </p>
        )}
      </div>

      {formOpen && (
        <RuleForm
          initial={editing}
          onCancel={() => setFormOpen(false)}
          onDone={() => setFormOpen(false)}
        />
      )}
    </div>
  )
}
