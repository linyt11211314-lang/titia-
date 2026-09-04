import { useMemo, useRef, useState, type TouchEvent } from 'react'
import dayjs from 'dayjs'
import {
  getDayStatus,
  getFestivalName,
  isMakeupDay,
  getUserDayStatus,
  setUserDayStatus,
} from '../../services/schedule'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

// 应用内编辑面板：切换某天 休/班/补班（即时存本机 localStorage）
function DayStatusEditor({ date }: { date: dayjs.Dayjs }) {
  const cur = getUserDayStatus(date)
  const options: { key: '休' | '班' | '补班'; label: string }[] = [
    { key: '休', label: '休' },
    { key: '班', label: '班' },
    { key: '补班', label: '补班' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => setUserDayStatus(date, o.key)}
          className={`pressable rounded-pill py-2 text-sm ${
            cur === o.key
              ? 'bg-primary font-semibold text-bg'
              : 'bg-bg text-ink-2 ring-1 ring-black/5'
          }`}
        >
          {o.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setUserDayStatus(date, null)}
        className={`pressable rounded-pill py-2 text-sm ${
          !cur ? 'bg-primary font-semibold text-bg' : 'bg-bg text-ink-3 ring-1 ring-black/5'
        }`}
      >
        默认
      </button>
    </div>
  )
}


// 排班日历：Sheet 内容。支持左右翻页（历史/未来年份），默认当前月并高亮今日。
export function ScheduleCalendar() {
  const today = dayjs().startOf('day')
  const [view, setView] = useState<dayjs.Dayjs>(today.startOf('month'))
  // 应用内编辑：当前选中的日期
  const [selected, setSelected] = useState<dayjs.Dayjs | null>(null)

  const openEdit = (d: dayjs.Dayjs) => {
    if (movedRef.current) {
      movedRef.current = false // 滑动结束后的一次点按视为误触，忽略
      return
    }
    setSelected(d)
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

  // 左右滑动切换月份（触摸）。拖动时网格跟随手指预览，松手超过阈值即切换。
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const movedRef = useRef(false)
  const [dragX, setDragX] = useState(0)

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    startRef.current = { x: t.clientX, y: t.clientY }
    movedRef.current = false
    setDragX(0)
  }
  const onTouchMove = (e: TouchEvent) => {
    if (!startRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - startRef.current.x
    const dy = t.clientY - startRef.current.y
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > 8) movedRef.current = true
      setDragX(dx)
    }
  }
  const onTouchEnd = () => {
    const dx = dragX
    startRef.current = null
    if (Math.abs(dx) > 50) {
      if (dx < 0) next() // 左滑 → 下一月
      else prev() // 右滑 → 上一月
    }
    setDragX(0)
  }

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

      {/* 日期网格（可左右滑动切换月份） */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
        className="select-none"
      >
        <div
          className="grid grid-cols-7 gap-y-2 gap-x-1"
          style={{
            transform: dragX ? `translateX(${dragX}px)` : undefined,
            transition: dragX ? 'none' : 'transform 0.2s ease',
            opacity: dragX ? 0.85 : 1,
          }}
        >
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const status = getDayStatus(d)
            const isToday = d.isSame(today, 'day')
            const isRest = status === '休'
            const festival = getFestivalName(d)
            const isMakeup = isMakeupDay(d)
            const isSel = selected?.isSame(d, 'day') ?? false
            // 单元格主标签优先级：补班(amber) > 节日名 > 无（无则显示 休/班）
            const label = isMakeup ? '补班' : festival
            const showStatusOnly = !label
            const labelCls = isMakeup
              ? 'bg-amber-100 text-amber-700'
              : isRest
                ? 'bg-primary/12 text-primary'
                : 'bg-surface-sunken text-ink-2'
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
                {showStatusOnly ? (
                  <span className={`mt-0.5 text-[10px] ${isRest ? 'text-primary' : 'text-ink-3'}`}>
                    {status}
                  </span>
                ) : (
                  <span
                    className={`mt-0.5 max-w-[42px] truncate rounded px-1 text-[9px] leading-tight ${labelCls}`}
                  >
                    {label}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 应用内编辑：点日期后展开，切换 休/班/补班，即时存本机 */}
      {selected && (
        <div className="mt-3 rounded-2xl bg-surface-sunken p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">{selected.format('M月D日')} 排班</span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="pressable text-xs text-ink-3"
            >
              收起
            </button>
          </div>
          <DayStatusEditor date={selected} />
          <p className="mt-2 text-[11px] text-ink-3">
            本机保存，刷新不丢 · 优先级高于大小周与节假日表
          </p>
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
        左右滑动或点箭头切换月份 · 点日期改 休/班/补班 · 基准：2026/8/31 起单双周轮替
      </p>
    </div>
  )
}
