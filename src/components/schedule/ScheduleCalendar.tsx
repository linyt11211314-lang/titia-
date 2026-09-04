import { memo, useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
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

// 单月网格。用 memo 包裹：滑动期间父组件不重渲染，故单元格不重算，保证丝滑。
const MonthGrid = memo(function MonthGrid({
  month,
  isCenter,
  selected,
  today,
  onPickDay,
  onJumpMonth,
}: {
  month: dayjs.Dayjs
  isCenter: boolean
  selected: dayjs.Dayjs | null
  today: dayjs.Dayjs
  onPickDay: (d: dayjs.Dayjs) => void
  onJumpMonth: (m: dayjs.Dayjs) => void
}) {
  const first = month.startOf('month')
  const leading = first.day() // 0=周日，前置空格数
  const days = month.daysInMonth()
  const cells: (dayjs.Dayjs | null)[] = []
  for (let i = 0; i < leading; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(first.date(d))
  while (cells.length % 7 !== 0) cells.push(null) // 补齐整周

  return (
    <div className="grid grid-cols-7 gap-y-2 gap-x-1">
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
            onClick={() => (isCenter ? onPickDay(d) : onJumpMonth(month))}
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
  )
})

// 排班日历：Sheet 内容。支持左右滑动切换月份（相邻月预览），默认当前月并高亮今日。
export function ScheduleCalendar() {
  const today = dayjs().startOf('day')
  const [view, setView] = useState<dayjs.Dayjs>(today.startOf('month'))
  // 应用内编辑：当前选中的日期
  const [selected, setSelected] = useState<dayjs.Dayjs | null>(null)

  // 滑动手势相关（全部走 ref，不触发 React 重渲染，保证丝滑）
  const outerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const wRef = useRef(0) // 单页（=容器）宽度
  const drag = useRef({ active: false, startX: 0, lastX: 0, moved: false, horizontal: true })
  const rafRef = useRef<number | null>(null)
  const movedRef = useRef(false) // 滑动结束后的一次点按视为误触，忽略

  const openEdit = useCallback((d: dayjs.Dayjs) => {
    if (movedRef.current) {
      movedRef.current = false // 滑动误触，忽略
      return
    }
    setSelected(d)
  }, [])
  const jumpMonth = useCallback((m: dayjs.Dayjs) => {
    movedRef.current = false
    setView(m.startOf('month'))
  }, [])

  // 初始把轨道定位到中间页
  useEffect(() => {
    const w = outerRef.current?.clientWidth ?? 0
    wRef.current = w
    if (trackRef.current) {
      trackRef.current.style.transition = 'none'
      trackRef.current.style.transform = `translateX(${-w}px)`
    }
  }, [])

  const prev = () => setView((v) => v.subtract(1, 'month'))
  const next = () => setView((v) => v.add(1, 'month'))

  // 直接改轨道 DOM 的 transform（不进 React state，零重渲染）
  const setTrack = (px: number, animate: boolean) => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = animate ? 'transform 0.22s ease' : 'none'
    el.style.transform = `translateX(${px}px)`
  }

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    const w = outerRef.current?.clientWidth ?? wRef.current
    wRef.current = w
    drag.current = { active: true, startX: t.clientX, lastX: t.clientX, moved: false, horizontal: true }
    setTrack(-w, false)
  }

  const onTouchMove = (e: TouchEvent) => {
    const d = drag.current
    if (!d.active) return
    const t = e.touches[0]
    d.lastX = t.clientX
    const dx = t.clientX - d.startX
    const dy = t.clientY - d.startY
    if (Math.abs(dx) > Math.abs(dy)) d.horizontal = true
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) d.moved = true
    // rAF 节流：每个动画帧最多更新一次，避免高频重排
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const dd = drag.current
      if (!dd.active) return
      const dxn = dd.lastX - dd.startX
      const clamped = Math.max(-wRef.current, Math.min(wRef.current, dxn))
      setTrack(-wRef.current + clamped, false)
    })
  }

  const onTouchEnd = () => {
    const d = drag.current
    if (!d.active) return
    d.active = false
    const dx = d.lastX - d.startX
    const w = wRef.current
    // 超过阈值（屏宽 20% 且 >40px）且以横向为主 → 切月
    if (d.horizontal && Math.abs(dx) > Math.max(40, w * 0.2)) {
      const goNext = dx < 0
      const target = goNext ? view.add(1, 'month') : view.subtract(1, 'month')
      // 先顺滑滑到相邻页，再切月并瞬移回中间（内容已是目标月，无缝）
      setTrack(goNext ? -2 * w : 0, true)
      movedRef.current = true
      window.setTimeout(() => {
        setView(target)
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTrack(-w, false)),
        )
      }, 200)
    } else {
      setTrack(-w, true) // 不足阈值，回弹到当前月
    }
  }

  const prevM = useMemo(() => view.subtract(1, 'month'), [view])
  const nextM = useMemo(() => view.add(1, 'month'), [view])

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

      {/* 日期轨道：三页（上月/本月/下月）并排，可左右滑动预览 */}
      <div
        ref={outerRef}
        className="select-none overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        <div ref={trackRef} className="flex" style={{ width: '300%', willChange: 'transform' }}>
          <div className="w-1/3 shrink-0">
            <MonthGrid
              month={prevM}
              isCenter={false}
              selected={selected}
              today={today}
              onPickDay={openEdit}
              onJumpMonth={jumpMonth}
            />
          </div>
          <div className="w-1/3 shrink-0">
            <MonthGrid
              month={view}
              isCenter
              selected={selected}
              today={today}
              onPickDay={openEdit}
              onJumpMonth={jumpMonth}
            />
          </div>
          <div className="w-1/3 shrink-0">
            <MonthGrid
              month={nextM}
              isCenter={false}
              selected={selected}
              today={today}
              onPickDay={openEdit}
              onJumpMonth={jumpMonth}
            />
          </div>
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
