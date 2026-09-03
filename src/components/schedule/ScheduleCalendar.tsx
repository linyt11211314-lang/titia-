import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { getDayStatus, getFestivalName, getDayOverride, setUserFestival } from '../../services/schedule'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

// 排班日历：Sheet 内容。支持左右翻页（历史/未来年份），默认当前月并高亮今日。
export function ScheduleCalendar() {
  const today = dayjs().startOf('day')
  const [view, setView] = useState<dayjs.Dayjs>(today.startOf('month'))
  // 应用内编辑：当前选中的日期 + 输入框草稿
  const [selected, setSelected] = useState<dayjs.Dayjs | null>(null)
  const [draft, setDraft] = useState('')

  const openEdit = (d: dayjs.Dayjs) => {
    setSelected(d)
    setDraft(getFestivalName(d))
  }

  const cells = useMemo(() => {
    const first = view.startOf('month')
    const leading = first.day() // 0=周日，前置空格数
    const daysInMonth = view.daysInMonth()
    const arr: (dayjs.Dayjs | null)[] = []
    for (let i = 0; i < leading; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(first.date(d))
    while (arr.length % 7 !== 0) arr.push(null) // 补齐整周
    return arr
  }, [view])

  const prev = () => setView((v) => v.subtract(1, 'month'))
  const next = () => setView((v) => v.add(1, 'month'))

  return (
    <div>
      {/* 月份切换：< 2026年9月 > */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          aria-label="上一月"
          className="pressable flex h-9 w-9 items-center justify-center rounded-pill bg-surface-sunken text-lg text-ink-2"
        >
          ‹
        </button>
        <div className="text-base font-semibold text-ink">{view.format('YYYY年M月')}</div>
        <button
          type="button"
          onClick={next}
          aria-label="下一月"
          className="pressable flex h-9 w-9 items-center justify-center rounded-pill bg-surface-sunken text-lg text-ink-2"
        >
          ›
        </button>
      </div>

      {/* 星期表头 */}
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-ink-3">
        {WEEK_LABELS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-y-2 gap-x-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const status = getDayStatus(d)
          const isToday = d.isSame(today, 'day')
          const isRest = status === '休'
          const festival = getFestivalName(d)
          // 调休补班：表中标记为「班」且非节日（如春节前的周六补班）
          const isMakeup = !festival && getDayOverride(d) === '班'
          const label = festival || (isMakeup ? '调休' : '')
          const labelCls = festival
            ? isRest
              ? 'bg-primary/12 text-primary'
              : 'bg-surface-sunken text-ink-2'
            : 'bg-amber-100 text-amber-700'
          const isSel = selected?.isSame(d, 'day') ?? false
          return (
            <div
              key={i}
              onClick={() => openEdit(d)}
              className={`flex cursor-pointer flex-col items-center rounded-lg py-1 ${
                isSel ? 'bg-surface-sunken ring-1 ring-primary/30' : ''
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-pill text-sm ${
                  isToday
                    ? 'bg-primary font-semibold text-bg ring-2 ring-primary/30'
                    : isSel
                      ? 'font-semibold text-primary'
                      : 'text-ink'
                }`}
              >
                {d.date()}
              </div>
              {label ? (
                <span className={`mt-0.5 max-w-[42px] truncate rounded px-1 text-[9px] leading-tight ${labelCls}`}>
                  {label}
                </span>
              ) : (
                <span className={`mt-0.5 text-[10px] ${isRest ? 'text-primary' : 'text-ink-3'}`}>
                  {status}
                </span>
              )}
              {label ? (
                <span className={`text-[9px] ${isRest ? 'text-primary' : 'text-ink-3'}`}>{status}</span>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* 应用内编辑：点日期后展开，输入即存本机 */}
      {selected && (
        <div className="mt-3 rounded-2xl bg-surface-sunken p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">
              {selected.format('M月D日')} 节日名
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="pressable text-xs text-ink-3"
            >
              收起
            </button>
          </div>
          <input
            value={draft}
            onChange={(e) => {
              const v = e.target.value
              setDraft(v)
              setUserFestival(selected, v) // 即时保存本机
            }}
            placeholder="输入节日名称（留空=不显示）"
            className="w-full rounded-pill bg-bg px-3 py-2 text-sm text-ink outline-none ring-1 ring-black/5"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUserFestival(selected, '')
                setDraft('')
              }}
              className="pressable rounded-pill bg-red-500/10 px-3 py-1.5 text-xs text-red-500"
            >
              删除
            </button>
            <span className="text-[11px] text-ink-3">本机保存，刷新不丢，不影响预设排班</span>
          </div>
        </div>
      )}

      {/* 图例 + 基准说明 */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>
          <span className="font-semibold text-primary">休</span> 休息
        </span>
        <span>
          <span className="font-semibold text-ink-2">班</span> 上班
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">调休</span> 补班
        </span>
      </div>
      <p className="mt-2 text-center text-[11px] text-ink-3">
        点任意日期可编辑节日名 · 基准：2026/8/31 起单双周轮替
      </p>
    </div>
  )
}
