import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { getDayStatus, getFestivalName, getDayOverride } from '../../services/schedule'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

// 排班日历：Sheet 内容。支持左右翻页（历史/未来年份），默认当前月并高亮今日。
export function ScheduleCalendar() {
  const today = dayjs().startOf('day')
  const [view, setView] = useState<dayjs.Dayjs>(today.startOf('month'))

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
          return (
            <div key={i} className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-pill text-sm ${
                  isToday
                    ? 'bg-primary font-semibold text-bg ring-2 ring-primary/30'
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
        基准：2026/8/31 起单双周轮替 · 法定节假日优先
      </p>
    </div>
  )
}
