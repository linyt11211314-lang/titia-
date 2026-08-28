import { useEffect, useMemo, useState } from 'react'
import { SwipeRow } from '../../components/base/SwipeRow'
import { Sheet } from '../../components/base/Sheet'
import { confirmSheet } from '../../components/base/Confirm'
import { ChevronIcon } from '../../components/icons'
import { useWujiStore, type WujiInput } from '../../stores/useWujiStore'
import { useAppStore } from '../../stores/useAppStore'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { WujiForm } from './WujiForm'
import {
  WUJI_CATEGORIES,
  categoryEmoji,
  categoryLabel,
  statusLabel,
  daysUsed,
  dailyCost,
  targetProgress,
  holdDays,
  actualDailyCost,
  profit,
  formatYuan,
} from './wujiUtils'
import type { WujiCategory, WujiItemRow, WujiStatus } from '../../db/types'

type TabKey = 'overview' | 'list' | 'form'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '我的资产' },
  { key: 'list', label: '物品清单' },
  { key: 'form', label: '录入物品' },
]

type SortKey = 'recent' | 'daily'

export function WujiPage() {
  const items = useWujiStore((s) => s.items)
  const loaded = useWujiStore((s) => s.loaded)
  const load = useWujiStore((s) => s.load)
  const createItem = useWujiStore((s) => s.create)
  const updateItem = useWujiStore((s) => s.update)
  const removeItem = useWujiStore((s) => s.remove)
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)

  const [tab, setTab] = useState<TabKey>('overview')
  const [filter, setFilter] = useState<WujiCategory | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('recent')

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const activeItems = useMemo(() => items.filter((i) => i.status === 'active'), [items])

  const stats = useMemo(() => {
    const netWorth = activeItems.reduce((s, i) => s + i.buyPrice, 0)
    const dailyTotal = activeItems.reduce((s, i) => s + dailyCost(i), 0)
    const counts: Record<WujiStatus, number> = { active: 0, idle: 0, sold: 0 }
    items.forEach((i) => (counts[i.status] += 1))
    const recent = [...items]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
    const byCategory = WUJI_CATEGORIES.map((c) => {
      const inCat = items.filter((i) => i.category === c.key)
      return {
        ...c,
        count: inCat.length,
        total: inCat.reduce((s, i) => s + i.buyPrice, 0),
      }
    }).filter((c) => c.count > 0)
    return { netWorth, dailyTotal, counts, recent, byCategory }
  }, [items, activeItems])

  const listItems = useMemo(() => {
    let list = items
    if (filter !== 'all') list = list.filter((i) => i.category === filter)
    if (sort === 'daily') {
      list = [...list].sort((a, b) => {
        const av = a.status === 'active' ? dailyCost(a) : Infinity
        const bv = b.status === 'active' ? dailyCost(b) : Infinity
        return av - bv
      })
    } else {
      list = [...list].sort((a, b) => b.createdAt - a.createdAt)
    }
    return list
  }, [items, filter, sort])

  const handleCreate = async (data: WujiInput) => {
    await createItem(data)
    showToast('已保存物品')
    setTab('list')
  }

  const handleUpdate = async (id: string, data: WujiInput) => {
    await updateItem(id, data)
    close()
    showToast('已保存修改')
  }

  const handleDelete = async (it: WujiItemRow) => {
    if (!(await confirmSheet('删除物品', `删除「${it.name}」？此操作不可恢复。`))) return
    await removeItem(it.id)
    showToast('已删除')
  }

  const openEdit = (it: WujiItemRow) => {
    open(
      <Sheet title="编辑物品" onClose={close}>
        <WujiForm
          initial={it}
          submitLabel="保存修改"
          onSubmit={(d: WujiInput) => void handleUpdate(it.id, d)}
        />
      </Sheet>,
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 固定标题栏（与 Aura 主页同模式） */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-[calc(var(--safe-top)+12px)]">
        <h1 className="text-xl font-semibold text-ink">物集</h1>
        <span className="text-sm text-ink-3">{items.length} 件物品</span>
      </div>

      {/* 子 Tab 切换（文字 Tab，非胶囊） */}
      <div className="flex shrink-0 border-b border-line px-5">
        {TABS.map((t) => {
          const on = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`pressable relative px-4 py-2.5 text-sm font-medium ${
                on ? 'text-primary' : 'text-ink-2'
              }`}
            >
              {t.label}
              {on && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>

      {/* 内容滚动区 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto overscroll-none touch-pan-y bg-bg px-5 pb-28">
          {tab === 'overview' && (
            <Overview stats={stats} onAdd={() => setTab('form')} />
          )}
          {tab === 'list' && (
            <ListContent
              items={listItems}
              filter={filter}
              sort={sort}
              onFilter={setFilter}
              onSort={setSort}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}
          {tab === 'form' && (
            <WujiForm onSubmit={(d) => void handleCreate(d)} submitLabel="保存物品" />
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── 我的资产（总览看板） ─────────────────────────

function Overview({
  stats,
  onAdd,
}: {
  stats: {
    netWorth: number
    dailyTotal: number
    counts: Record<WujiStatus, number>
    recent: WujiItemRow[]
    byCategory: { key: WujiCategory; label: string; emoji: string; count: number; total: number }[]
  }
  onAdd: () => void
}) {
  const [recentOpen, setRecentOpen] = useState(true)

  if (stats.recent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="text-5xl">📦</span>
        <p className="mt-3 text-base font-semibold text-ink">还没有任何物品</p>
        <p className="mt-1 text-sm text-ink-3">录入你的第一件资产，开始算日均成本吧。</p>
        <button
          type="button"
          onClick={onAdd}
          className="pressable mt-4 rounded-pill bg-primary px-5 py-2.5 font-semibold text-bg"
        >
          录入物品
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* 核心指标 */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-card bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-3">总资产净值</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{formatYuan(stats.netWorth)}</p>
          <p className="mt-0.5 text-xs text-ink-3">服役中物品买入价合计</p>
        </div>
        <div className="rounded-card bg-surface p-4 shadow-card">
          <p className="text-xs text-ink-3">日均消费总额</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{formatYuan(stats.dailyTotal)}</p>
          <p className="mt-0.5 text-xs text-ink-3">服役中物品日均成本之和</p>
        </div>
      </div>

      {/* 状态分布 */}
      <div className="mb-3 rounded-card bg-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-semibold text-ink">物品状态</p>
        <div className="flex items-center gap-3 text-sm">
          <Stat label="服役中" value={stats.counts.active} dot="bg-primary" />
          <Stat label="闲置" value={stats.counts.idle} dot="bg-accent" />
          <Stat label="已卖出" value={stats.counts.sold} dot="bg-surface-sunken" />
        </div>
      </div>

      {/* 分类统计 */}
      {stats.byCategory.length > 0 && (
        <div className="mb-3 rounded-card bg-surface p-4 shadow-card">
          <p className="mb-2 text-sm font-semibold text-ink">分类统计</p>
          <div className="flex flex-col gap-2">
            {stats.byCategory.map((c) => (
              <div key={c.key} className="flex items-center justify-between text-sm">
                <span className="text-ink-2">
                  {c.emoji} {c.label}
                  <span className="ml-1 text-ink-3">· {c.count} 件</span>
                </span>
                <span className="font-medium text-ink">{formatYuan(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近添加（可收起面板） */}
      <div className="mb-2 overflow-hidden rounded-card bg-surface shadow-card">
        <button
          type="button"
          onClick={() => setRecentOpen((v) => !v)}
          className="pressable flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-ink">最近添加</span>
          <ChevronIcon up={recentOpen} className="h-4 w-4 text-ink-3" />
        </button>
        <div
          className={`grid transition-all duration-200 ${
            recentOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2.5 px-4 pb-4">
              {stats.recent.map((it) => (
                <RecentRow key={it.id} item={it} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-ink-2">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  )
}

function RecentRow({ item }: { item: WujiItemRow }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-surface-sunken text-lg">
        {categoryEmoji(item.category)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">{item.name}</p>
        <p className="truncate text-xs text-ink-3">{categoryLabel(item.category)}</p>
      </div>
      <span className="text-sm font-medium text-ink">{formatYuan(item.buyPrice)}</span>
    </div>
  )
}

// ───────────────────────── 物品清单（筛选 + 列表） ─────────────────────────

function ListContent({
  items,
  filter,
  sort,
  onFilter,
  onSort,
  onEdit,
  onDelete,
}: {
  items: WujiItemRow[]
  filter: WujiCategory | 'all'
  sort: SortKey
  onFilter: (v: WujiCategory | 'all') => void
  onSort: (v: SortKey) => void
  onEdit: (it: WujiItemRow) => void
  onDelete: (it: WujiItemRow) => void
}) {
  const [catExpanded, setCatExpanded] = useState(false)
  const activeCat = filter !== 'all' ? WUJI_CATEGORIES.find((c) => c.key === filter) : null

  return (
    <div>
      {/* 分类筛选（可收起展开） */}
      <div className="mb-3 rounded-card bg-surface p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">分类筛选</span>
          <button
            type="button"
            onClick={() => setCatExpanded((v) => !v)}
            className="pressable flex items-center gap-0.5 text-xs text-ink-3"
          >
            {catExpanded ? '收起' : '展开'}
            <ChevronIcon up={catExpanded} className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {catExpanded ? (
            <>
              <FilterChip label="全部" on={filter === 'all'} onClick={() => onFilter('all')} />
              {WUJI_CATEGORIES.map((c) => (
                <FilterChip
                  key={c.key}
                  label={`${c.emoji}${c.label}`}
                  on={filter === c.key}
                  onClick={() => onFilter(c.key)}
                />
              ))}
            </>
          ) : activeCat ? (
            <FilterChip
              label={`${activeCat.emoji}${activeCat.label}`}
              on
              onClick={() => onFilter(activeCat.key)}
            />
          ) : null}
        </div>
      </div>

      {/* 排序 */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-ink-3">排序</span>
        <button
          type="button"
          onClick={() => onSort('recent')}
          className={`pressable rounded-pill px-3 py-1 text-xs ${
            sort === 'recent' ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'
          }`}
        >
          最近录入
        </button>
        <button
          type="button"
          onClick={() => onSort('daily')}
          className={`pressable rounded-pill px-3 py-1 text-xs ${
            sort === 'daily' ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'
          }`}
        >
          日均成本↑
        </button>
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">该分类下还没有物品</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <SwipeRow key={it.id} onDelete={() => onDelete(it)} onPress={() => onEdit(it)}>
              <ItemCard item={it} />
            </SwipeRow>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable rounded-pill px-3 py-1.5 text-sm ${
        on ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'
      }`}
    >
      {label}
    </button>
  )
}

function statusBadgeClass(s: WujiStatus): string {
  if (s === 'active') return 'bg-primary-soft text-primary'
  if (s === 'idle') return 'bg-accent-soft text-accent'
  return 'bg-surface-sunken text-ink-3'
}

function ItemCard({ item }: { item: WujiItemRow }) {
  const used = daysUsed(item)
  const daily = dailyCost(item)
  const prog = targetProgress(item)

  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn bg-surface-sunken text-xl">
          {categoryEmoji(item.category)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-ink">{item.name}</p>
            <span className={`shrink-0 rounded-pill px-2 py-0.5 text-xs ${statusBadgeClass(item.status)}`}>
              {statusLabel(item.status)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-3">
            {categoryLabel(item.category)}
            {item.brand ? ` · ${item.brand}` : ''} · 买入 {formatYuan(item.buyPrice)}
          </p>
        </div>
      </div>

      {item.status === 'active' && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>已使用 {used} 天</span>
            <span>均摊每日 {formatYuan(daily)}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken">
            <div className="h-full rounded-pill bg-primary" style={{ width: `${prog}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-3">
            目标达成 {Math.round(prog)}%（日均成本已低于目标值）
          </p>
        </div>
      )}

      {item.status === 'sold' && (
        <div className="mt-3 text-xs text-ink-3">
          <p>
            持有 {holdDays(item)} 天 · 卖出 {formatYuan(item.sellPrice ?? 0)}
          </p>
          <p className="mt-0.5">
            均摊每日 {formatYuan(daily)}（买入价 ÷ 已用 {used} 天）
          </p>
          <p className="mt-0.5">
            {actualDailyCost(item) >= 0
              ? `持有期间每天实际花 ${formatYuan(actualDailyCost(item))}`
              : `持有期间每天净赚 ${formatYuan(-actualDailyCost(item))}`}
            {' · '}
            {profit(item) >= 0
              ? `盈亏 +${formatYuan(profit(item))}`
              : `盈亏 ${formatYuan(profit(item))}`}
          </p>
        </div>
      )}

      {item.status === 'idle' && (
        <p className="mt-3 text-xs text-ink-3">
          闲置中 · 均摊每日 {formatYuan(daily)}（买入价 ÷ 已用 {used} 天）
        </p>
      )}
    </div>
  )
}
