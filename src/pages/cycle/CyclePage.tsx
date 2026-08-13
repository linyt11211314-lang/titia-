import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import dayjs from 'dayjs'
import { NavBar } from '../../components/nav/NavBar'
import { PageHost } from '../../components/nav/PageHost'
import { EmbeddedHeader } from '../../components/nav/EmbeddedHeader'
import { Card } from '../../components/base/Card'
import { EmptyState } from '../../components/base/EmptyState'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput, DateInput } from '../../components/base/fields'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useCycleStore, predictNext } from '../../stores/useCycleStore'
import { useAppStore } from '../../stores/useAppStore'
import type { CycleEntity } from '../../db/types'
import { SwipeRow } from '../../components/base/SwipeRow'

// Titia 时序 · 生理周期（底部 Sheet 记录）
function buildMonth(viewYM: string) {
  const start = dayjs(viewYM + '-01')
  const daysInMonth = start.daysInMonth()
  const lead = start.day()
  const cells: (string | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(start.date(d).format('YYYY-MM-DD'))
  return cells
}

function CycleForm({ initial, onSave }: { initial: { start: string; end: string }; onSave: (d: { start: string; end: string }) => void }) {
  const [d, setD] = useState(initial)
  return (
    <div>
      <Field label="本次开始日期">
        <DateInput value={d.start} onChange={(v) => setD({ ...d, start: v })} />
      </Field>
      <Field label="结束日期（可空）">
        <DateInput value={d.end} onChange={(v) => setD({ ...d, end: v })} />
      </Field>
      <button onClick={() => onSave(d)} className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg">
        保存
      </button>
    </div>
  )
}

export function CyclePage({ embedded = false }: { embedded?: boolean }) {
  const { items, loaded, load, record, update, remove } = useCycleStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [viewYM, setViewYM] = useState(dayjs().format('YYYY-MM'))
  const [avgPeriodDays, setAvgPeriodDays] = useState(5)
  // 独立的历史记录入口：overview（本次/预计/月历）↔ history（记录列表）
  const [view, setView] = useState<'overview' | 'history'>('overview')

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const periodDays = useMemo(() => {
    const set = new Set<string>()
    for (const c of items) {
      const end = c.endDate ?? dayjs(c.startDate).add(avgPeriodDays - 1, 'day').format('YYYY-MM-DD')
      let cur = c.startDate
      while (cur <= end) {
        set.add(cur)
        cur = dayjs(cur).add(1, 'day').format('YYYY-MM-DD')
      }
    }
    return set
  }, [items, avgPeriodDays])

  const { avgCycleDays, nextStart } = useMemo(() => predictNext(items), [items])
  const today = dayjs().format('YYYY-MM-DD')
  const dayOfCycle = (() => {
    const past = items.map((c) => c.startDate).filter((d) => d <= today).sort().pop()
    return past ? dayjs(today).diff(dayjs(past), 'day') + 1 : null
  })()

  // 预计月经日（nextStart 起 avgPeriodDays 天）——与顶部「预计下次」同源，天然同步
  const predictDays = useMemo(() => {
    const set = new Set<string>()
    if (!nextStart) return set
    for (let i = 0; i < avgPeriodDays; i++) set.add(dayjs(nextStart).add(i, 'day').format('YYYY-MM-DD'))
    return set
  }, [nextStart, avgPeriodDays])

  const cells = buildMonth(viewYM)

  const openCycleForm = (editing: CycleEntity | null) => {
    open(
      <Sheet title={editing ? '编辑周期记录' : '记录周期'} onClose={close}>
        <CycleForm
          initial={{ start: editing?.startDate ?? today, end: editing?.endDate ?? '' }}
          onSave={async (d) => {
            if (!d.start.trim()) return
            if (editing) {
              await update(editing.id, { startDate: d.start.trim(), endDate: d.end.trim() || undefined })
              showToast('已更新')
            } else {
              await record(d.start.trim(), d.end.trim() || undefined)
              showToast('已记录')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }

  const onRemove = async (c: CycleEntity) => {
    if (await confirmSheet('删除记录', '删除这条周期记录？')) {
      await remove(c.id)
      showToast('已删除')
    }
  }

  // 月历点按：记录/取消当日周期（一键标记，自动同步进「历史记录」）
  // 连续点按的相邻日期会自动合并为一条区间记录，避免把一天误记成一段周期、打乱预测；
  // 再次点按已标记的日期即取消（区间中间被取消会自动拆成前后两段，其余天数保留）。
  const toggleDate = async (date: string) => {
    const endOf = (c: CycleEntity) =>
      c.endDate ?? dayjs(c.startDate).add(avgPeriodDays - 1, 'day').format('YYYY-MM-DD')
    const prevDay = dayjs(date).subtract(1, 'day').format('YYYY-MM-DD')
    const nextDay = dayjs(date).add(1, 'day').format('YYYY-MM-DD')
    // 当前覆盖该日期的记录（记录不重叠，取首条即可）
    const covering = items.filter((c) => c.startDate <= date && date <= endOf(c))
    if (covering.length === 0) {
      // 新建单日，并尝试与相邻的「前一天/后一天」记录合并成连续区间
      let start = date
      let end = date
      const prev = items.find((c) => endOf(c) === prevDay)
      if (prev) {
        start = prev.startDate
        await remove(prev.id)
      }
      const next = items.find((c) => c.startDate === nextDay)
      if (next) {
        end = endOf(next)
        await remove(next.id)
      }
      await record(start, end)
      showToast('已记录 ' + date)
      return
    }
    const rec = covering[0]
    const recEnd = endOf(rec)
    if (rec.startDate === date && recEnd === date) {
      await remove(rec.id) // 单日记录 → 直接删除（取消）
    } else if (rec.startDate === date) {
      await update(rec.id, { startDate: nextDay, endDate: recEnd }) // 取消区间起点
    } else if (recEnd === date) {
      await update(rec.id, { startDate: rec.startDate, endDate: prevDay }) // 取消区间终点
    } else {
      // 取消区间中间的某天 → 拆成前后两段，其余天数保留
      await update(rec.id, { startDate: rec.startDate, endDate: prevDay })
      await record(nextDay, recEnd)
    }
    showToast('已取消 ' + date)
  }

  const recordBtn = (
    <button onClick={() => openCycleForm(null)} className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg">
      记录
    </button>
  )

  const content = (
    <>
      {embedded && <EmbeddedHeader title="生理周期" right={recordBtn} />}

      {view === 'overview' ? (
        <>
          {/* 本次周期 / 预计下次（与日历 predictDays 同源同步） */}
          <div className="mb-3 flex items-center justify-between rounded-card bg-surface-sunken p-4">
            <div>
              <p className="text-sm text-ink-2">本次周期</p>
              <p className="text-xl font-semibold text-ink">{dayOfCycle ? `第 ${dayOfCycle} 天` : '暂无'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-ink-2">预计下次</p>
              <p className="text-ink">{nextStart ?? '—'}</p>
            </div>
          </div>

          {/* 历史记录：独立入口 */}
          <button
            onClick={() => setView('history')}
            className="mb-3 flex w-full items-center justify-between rounded-card bg-surface p-4 shadow-soft"
          >
            <span className="text-ink">历史记录</span>
            <span className="text-xs text-ink-3">{items.length} 条 ›</span>
          </button>

          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => setViewYM(dayjs(viewYM + '-01').subtract(1, 'month').format('YYYY-MM'))} className="text-ink-2">
              ‹
            </button>
            <span className="text-sm font-medium text-ink">{viewYM}</span>
            <button onClick={() => setViewYM(dayjs(viewYM + '-01').add(1, 'month').format('YYYY-MM'))} className="text-ink-2">
              ›
            </button>
          </div>

          {/* 月历：实际经期粉底 / 预计月经浅粉 / 今天蓝色边框 */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
              <div key={w} className="py-1 text-ink-3">
                {w}
              </div>
            ))}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDate(d)}
                  className="flex aspect-square items-center justify-center rounded-[10px] text-xs transition active:scale-95"
                  style={
                    (() => {
                      const isPeriod = periodDays.has(d)
                      const isPredict = predictDays.has(d)
                      const isToday = d === today
                      let style: CSSProperties = { background: 'var(--color-surface)' }
                      if (isPeriod) style = { background: '#F9A8C7', color: '#880E4F' } // 实际经期：粉色高亮
                      else if (isPredict) style = { background: '#FCE4EC', color: '#D81B60' } // 预计月经：浅粉
                      if (isToday) style = { ...style, boxShadow: '0 0 0 2px #3B82F6' } // 今天：蓝色边框
                      return style
                    })()
                  }
                >
                  {dayjs(d).date()}
                </button>
              ) : (
                <div key={i} className="aspect-square" />
              ),
            )}
          </div>
          <p className="mt-2 text-center text-xs text-ink-3">
            点按日期即可记录当天周期，再次点按取消；相邻日期自动连成一段，并同步到「历史记录」。
          </p>
        </>
      ) : (
        <>
          {/* 历史记录列表（独立入口进入） */}
          <button
            onClick={() => setView('overview')}
            className="mb-3 flex items-center gap-1 rounded-card bg-surface-sunken px-4 py-2 text-sm text-primary"
          >
            ‹ 返回月历
          </button>
          {items.length === 0 ? (
            <EmptyState
              text="还没有记录"
              action={
                <button onClick={() => openCycleForm(null)} className="rounded-pill bg-primary px-4 py-2 text-sm text-bg">
                  记录一次
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {items
                .slice()
                .reverse()
                .map((c) => (
                  <SwipeRow key={c.id} onDelete={() => onRemove(c)} onPress={() => openCycleForm(c)}>
                    <div className="flex items-center justify-between p-4">
                      <div className="min-w-0">
                        <p className="truncate text-ink">
                          {c.startDate}{' '}
                          {c.endDate
                            ? c.endDate === c.startDate
                              ? '（1 天）'
                              : `→ ${c.endDate}`
                            : '（进行中）'}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-3">平均周期 {avgCycleDays} 天</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemove(c)
                        }}
                        className="ml-2 flex-shrink-0 text-xs text-ink-3"
                      >
                        删除
                      </button>
                    </div>
                  </SwipeRow>
                ))}
            </div>
          )}
        </>
      )}
    </>
  )

  if (embedded) return content
  return (
    <>
      <NavBar title="生理周期" right={<button onClick={() => openCycleForm(null)} className="text-sm text-primary">记录</button>} />
      <PageHost>{content}</PageHost>
    </>
  )
}
