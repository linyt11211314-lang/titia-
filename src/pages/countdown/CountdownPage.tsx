import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { Lunar } from 'lunar-javascript'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { EmbeddedHeader } from '../../components/nav/EmbeddedHeader'
import { Card } from '../../components/base/Card'
import { EmptyState } from '../../components/base/EmptyState'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput, DateInput, ChipSelect } from '../../components/base/fields'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useCountdownStore } from '../../stores/useCountdownStore'
import { useAppStore } from '../../stores/useAppStore'
import type { CountdownEventEntity } from '../../db/types'
import { SwipeRow } from '../../components/base/SwipeRow'

// Titia 时序 · 倒数日
// 期待（未来）：剩余天数；足迹（已发生）：已经 X 年 X 月 X 天
// 农历：期待支持「八月十五」这类无年份日期，每年自动换算最近一次公历日期；
//       足迹是已发生时间，必须具体到公历日期，故表单不提供农历选项。
// 顶部 iOS 风格横向文字切换（细横线，非胶囊）

const CATS: { key: CountdownEventEntity['category']; label: string; emoji: string }[] = [
  { key: 'family', label: '家人', emoji: '👨‍👩‍👧' },
  { key: 'friend', label: '朋友', emoji: '🧑‍🤝‍🧑' },
  { key: 'partner', label: '伴侣', emoji: '❤️' },
  { key: 'pet', label: '宠物', emoji: '🐱' },
  { key: 'other', label: '其他', emoji: '✨' },
]

export const catLabel = (c: CountdownEventEntity['category']) => CATS.find((x) => x.key === c)?.label ?? '其他'
export const catEmoji = (c: CountdownEventEntity['category']) => CATS.find((x) => x.key === c)?.emoji ?? '✨'

// 期待事件类型（筛选用）
const EVENT_TYPES: { key: NonNullable<CountdownEventEntity['eventType']>; label: string; emoji: string }[] = [
  { key: 'birthday', label: '生日', emoji: '🎂' },
  { key: 'anniversary', label: '纪念日', emoji: '💍' },
  { key: 'other', label: '其他', emoji: '✨' },
]
export const eventTypeLabel = (t: CountdownEventEntity['eventType']) => {
  const e = EVENT_TYPES.find((x) => x.key === t)
  return e ? `${e.emoji} ${e.label}` : '✨ 其他'
}
const FILTERS = [
  { key: 'all', label: '全部' },
  ...EVENT_TYPES,
] as const
type FilterKey = (typeof FILTERS)[number]['key']

// ── 农历解析与换算 ──
const CN: Record<string, number> = {
  正: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 冬: 11, 腊: 12,
}
// 农历月名（index+1 = 月）
const LUNAR_MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']
const CN_N = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

// 农历日名：1→初一 … 10→初十 11→十一 20→二十 21→廿一 30→三十
function lunarDayName(n: number): string {
  if (n < 1 || n > 30) return ''
  if (n === 10) return '初十'
  if (n < 10) return `初${CN_N[n]}`
  if (n === 20) return '二十'
  if (n < 20) return `十${CN_N[n - 10]}`
  if (n === 30) return '三十'
  return `廿${CN_N[n - 20]}`
}
const LUNAR_DAYS = Array.from({ length: 30 }, (_, i) => lunarDayName(i + 1))

// 中文数字串 → 数字（支持 十/十五/二十三/二十 等写法）
function cnToNum(s: string): number {
  if (s === '十') return 10
  if (s.startsWith('十')) return 10 + (CN[s[1]] ?? 0) // 十一~十九
  if (s.endsWith('十')) return (CN[s[0]] ?? 0) * 10 // 二十~九十
  if (s.length === 3 && s[1] === '十') return (CN[s[0]] ?? 0) * 10 + (CN[s[2]] ?? 0) // 二十三
  return CN[s] ?? 0
}

// 解析「八月十五 / 六月初三 / 腊月三十 / 正月初一」→ { month, day }
function parseLunar(text: string): { month: number; day: number } | null {
  const t = (text || '').replace(/\s/g, '')
  const idx = t.indexOf('月')
  if (idx <= 0) return null
  const ms = t.slice(0, idx) // 「八」「六月」「腊」「正月」的月部分
  const ds = t.slice(idx + 1).replace(/日/g, '') // 「十五」「初三」的日部分
  let month: number
  if (ms.includes('正')) month = 1
  else if (ms.includes('冬')) month = 11
  else if (ms.includes('腊')) month = 12
  else {
    month = cnToNum(ms)
    if (month < 1 || month > 12) return null
  }
  if (!ds) return null
  let day = 0
  if (ds.startsWith('初')) day = CN[ds[1]] ?? 0
  else if (ds.startsWith('廿')) day = 20 + (CN[ds[1]] ?? 0)
  else if (ds === '三十') day = 30
  else day = cnToNum(ds)
  if (day < 1 || day > 30) return null
  return { month, day }
}

// 期待公历：日期已过时自动顺延到下一年同月日（每年重复，无需每年修改）
function nextOccurrence(solarDate: string): string | null {
  const d = dayjs(solarDate)
  if (!d.isValid()) return null
  const now = dayjs().startOf('day')
  let next = d.startOf('day')
  while (next.isBefore(now)) next = next.add(1, 'year')
  return next.format('YYYY-MM-DD')
}

// 期待日期：公历过期自动顺延；农历换算「今天之后最近一次」——
// 设了起始年份（lunarYear）从该年起找，未设（每年）从今年起找，已过自动顺延次年
export function expectedSolarDate(it: CountdownEventEntity): string | null {
  if (it.dateType !== 'lunar' || !it.lunarDate) return nextOccurrence(it.solarDate ?? '')
  const p = parseLunar(it.lunarDate)
  if (!p) return null
  const now = dayjs().startOf('day')
  const startY = it.lunarYear && it.lunarYear > 0 ? it.lunarYear : now.year()
  for (let y = startY; y <= startY + 1; y++) {
    try {
      const d = dayjs(Lunar.fromYmd(y, p.month, p.day).getSolar().toYmd())
      if (!d.isBefore(now)) return d.format('YYYY-MM-DD')
    } catch {
      /* 该年无此农历日（闰月差异等），尝试下一年 */
    }
  }
  return null
}

// 期待：剩余天数（目标 - 今天）
export function daysUntil(date: string): number {
  return Math.max(0, Math.round((dayjs(date).startOf('day').valueOf() - dayjs().startOf('day').valueOf()) / 86400000))
}

// 足迹：已经 X 年 X 月 X 天
function spanSince(date: string): string {
  const start = dayjs(date)
  if (!start.isValid()) return ''
  const end = dayjs()
  let years = end.diff(start, 'year')
  let months = end.subtract(years, 'year').diff(start, 'month')
  let days = end.subtract(years, 'year').subtract(months, 'month').diff(start, 'day')
  if (days < 0) {
    months -= 1
    days = end.subtract(years, 'year').subtract(months, 'month').diff(start, 'day')
  }
  if (months < 0) {
    years -= 1
    months = 12 + months
  }
  const parts: string[] = []
  if (years > 0) parts.push(`${years}年`)
  if (months > 0) parts.push(`${months}个月`)
  parts.push(`${days}天`)
  return parts.join('')
}

function spanTotalDays(date: string): number {
  return Math.max(0, Math.round((dayjs().startOf('day').valueOf() - dayjs(date).startOf('day').valueOf()) / 86400000))
}

// ── 新增/编辑表单 ──
function CountdownForm({
  initial,
  onSave,
}: {
  initial: {
    kind: 'expected' | 'footprint'
    title: string
    relation: string
    category: CountdownEventEntity['category']
    eventType: CountdownEventEntity['eventType']
    avatar: string
    solarDate: string
    dateType: 'solar' | 'lunar'
    lunarM: number
    lunarD: number
    lunarYear: number
  }
  onSave: (d: {
    kind: 'expected' | 'footprint'
    title: string
    relation: string
    category: CountdownEventEntity['category']
    eventType: CountdownEventEntity['eventType']
    avatar: string
    solarDate: string
    dateType: 'solar' | 'lunar'
    lunarDate?: string
    lunarYear?: number
  }) => void
}) {
  const [d, setD] = useState(initial)
  const set = (k: string, v: string) => setD({ ...d, [k]: v })
  const setNum = (k: string, v: number) => setD({ ...d, [k]: v })
  const handleSave = () => {
    onSave(
      d.dateType === 'lunar'
        ? { ...d, lunarDate: `${LUNAR_MONTHS[d.lunarM - 1]}${lunarDayName(d.lunarD)}` }
        : { ...d },
    )
  }
  // 年份候选：今年 ~ 今年+10（"每年"= 0）
  const yearOptions = Array.from({ length: 11 }, (_, i) => dayjs().year() + i)
  return (
    <div>
      <Field label="事件名称">
        <TextInput value={d.title} onChange={(v) => set('title', v)} placeholder="如 妈妈生日 / 我的猫" />
      </Field>
      <Field label="人物关系（可空）">
        <TextInput value={d.relation} onChange={(v) => set('relation', v)} placeholder="如 妈妈 / 女儿 / 我的猫" />
      </Field>
      {/* 期待才有事件类型（筛选用）；足迹不参与筛选 */}
      {d.kind !== 'footprint' && (
        <Field label="类型">
          <ChipSelect
            options={EVENT_TYPES.map((t) => ({ key: t.key, label: `${t.emoji} ${t.label}` }))}
            value={d.eventType ?? 'other'}
            onChange={(v) => setD({ ...d, eventType: v as CountdownEventEntity['eventType'] })}
          />
        </Field>
      )}
      <Field label="分类">
        <ChipSelect
          options={CATS.map((c) => ({ key: c.key, label: `${c.emoji} ${c.label}` }))}
          value={d.category}
          onChange={(v) => set('category', v)}
        />
      </Field>
      {/* 足迹是已发生时间，必须具体到公历日期，不提供农历 */}
      {d.kind !== 'footprint' && (
        <Field label="日期类型">
          <ChipSelect
            options={[
              { key: 'solar', label: '公历' },
              { key: 'lunar', label: '农历' },
            ]}
            value={d.dateType}
            onChange={(v) => set('dateType', v)}
          />
        </Field>
      )}
      <Field label={d.dateType === 'lunar' ? '农历日期' : d.kind === 'expected' ? '日期（每年自动更新）' : '开始日期'}>
        {d.dateType === 'lunar' ? (
          <div className="flex gap-2">
            <select
              value={d.lunarYear || 0}
              onChange={(e) => setNum('lunarYear', Number(e.target.value))}
              className="titia-input flex-1 rounded-btn bg-surface-sunken px-2 py-2.5 text-ink outline-none"
            >
              <option value={0}>每年</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </select>
            <select
              value={d.lunarM}
              onChange={(e) => setNum('lunarM', Number(e.target.value))}
              className="titia-input flex-1 rounded-btn bg-surface-sunken px-2 py-2.5 text-ink outline-none"
            >
              {LUNAR_MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={d.lunarD}
              onChange={(e) => setNum('lunarD', Number(e.target.value))}
              className="titia-input flex-1 rounded-btn bg-surface-sunken px-2 py-2.5 text-ink outline-none"
            >
              {LUNAR_DAYS.map((n, i) => (
                <option key={n} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <DateInput value={d.solarDate ?? ''} onChange={(v) => set('solarDate', v)} />
        )}
      </Field>
      <Field label="图标（emoji）">
        <TextInput value={d.avatar} onChange={(v) => set('avatar', v)} placeholder="❤️ / 🐱 / 🎂" />
      </Field>
      <button onClick={handleSave} className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg">
        保存
      </button>
    </div>
  )
}

// ── 主页面 ──
export function CountdownPage({ embedded = false }: { embedded?: boolean }) {
  const { items, loaded, load, create, update, remove } = useCountdownStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [tab, setTab] = useState<'expected' | 'footprint' | 'timeline'>('expected')
  const [filter, setFilter] = useState<FilterKey>('all')
  // 时间轴：年份 / 展开的月份 / 选中日期弹窗
  const [tlYear, setTlYear] = useState(dayjs().year())
  const [tlMonth, setTlMonth] = useState<number | null>(null)
  const [tlPopup, setTlPopup] = useState<{ date: string; events: { type: string; title: string; emoji: string; label: string; relation?: string }[] } | null>(null)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  // 期待：按剩余天数升序（用换算后的"下一次日期"，农历/顺延均正确）＋类型筛选；足迹：按开始日期倒序
  const list = useMemo(() => {
    let filtered = items.filter((i) => i.kind === tab)
    if (tab === 'expected' && filter !== 'all') {
      filtered = filtered.filter((i) => (i.eventType ?? 'other') === filter)
    }
    if (tab === 'expected') {
      const daysOf = (i: CountdownEventEntity) => daysUntil(expectedSolarDate(i) ?? '9999-12-31')
      return filtered.sort((a, b) => daysOf(a) - daysOf(b))
    }
    return filtered.sort((a, b) => (b.solarDate ?? '').localeCompare(a.solarDate ?? ''))
  }, [items, tab, filter])

  const openForm = (editing: CountdownEventEntity | null) => {
    const isEdit = !!editing
    const parsedLunar = editing?.dateType === 'lunar' ? parseLunar(editing.lunarDate ?? '') : null
    open(
      <Sheet title={isEdit ? '编辑事件' : '新增事件'} onClose={close}>
        <CountdownForm
          initial={{
            kind: editing?.kind ?? (tab === 'timeline' ? 'expected' : tab),
            title: editing?.title ?? '',
            relation: editing?.relation ?? '',
            category: editing?.category ?? 'family',
            eventType: editing?.eventType ?? 'other',
            avatar: editing?.avatar ?? '✨',
            solarDate: editing?.solarDate ?? (editing?.dateType === 'lunar' ? '' : dayjs().format('YYYY-MM-DD')),
            dateType: editing?.dateType ?? 'solar',
            lunarM: parsedLunar?.month ?? 8,
            lunarD: parsedLunar?.day ?? 15,
            lunarYear: editing?.lunarYear ?? 0,
          }}
          onSave={async (d) => {
            if (!d.title.trim()) return
            const isLunar = d.dateType === 'lunar'
            const payload = {
              title: d.title.trim(),
              relation: d.relation.trim() || undefined,
              category: d.category,
              eventType: d.kind === 'footprint' ? undefined : (d.eventType ?? 'other'),
              dateType: d.dateType,
              solarDate: isLunar ? undefined : (d.solarDate.trim() || undefined),
              lunarDate: isLunar ? (d.lunarDate?.trim() || undefined) : undefined,
              lunarYear: isLunar && (d.lunarYear ?? 0) > 0 ? d.lunarYear : undefined,
              avatar: d.avatar.trim() || '✨',
            }
            if (editing) {
              await update(editing.id, payload)
              showToast('已更新')
            } else {
              await create({ ...payload, kind: d.kind })
              showToast('已添加')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }

  const onDelete = async (e: CountdownEventEntity) => {
    if (await confirmSheet('删除事件', `删除「${e.title}」？此操作不可恢复。`)) {
      await remove(e.id)
      showToast('已删除')
    }
  }

  // 顶部切换 + 筛选：固定头部内容（吸顶），独立渲染，避免悬浮割裂
  const countdownTabs = (
    <>
      {/* 顶部 iOS 风格横向文字切换（细横线，非胶囊） */}
      <div className="flex gap-8 px-1">
        {(
          [
            { key: 'expected', label: '期待' },
            { key: 'footprint', label: '足迹' },
            { key: 'timeline', label: '时间轴' },
          ] as const
        ).map((t) => {
          const on = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative pb-2.5 text-lg ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}
              style={{ transition: 'color 200ms' }}
            >
              {t.label}
              {/* 细横线：宽度与文字对应 */}
              <span
                className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                style={{
                  background: on ? 'var(--color-primary)' : 'transparent',
                  transform: on ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: 'center',
                  transition: 'transform 250ms cubic-bezier(.4,0,.2,1)',
                }}
              />
            </button>
          )
        })}
      </div>

      {/* 期待：类型筛选（生日/纪念日/其他） */}
      {tab === 'expected' && (
        <div className="mt-2 flex gap-2 overflow-x-auto touch-manipulation">
          {FILTERS.map((f) => {
            const on = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-shrink-0 rounded-pill px-3 py-1 text-xs ${on ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'}`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )

  // 列表内容（不含头部；头部由固定层渲染）
  const content = (
    <>
      {tab === 'timeline' ? (
        <TimelineView
          year={tlYear}
          setYear={setTlYear}
          month={tlMonth}
          setMonth={setTlMonth}
          popup={tlPopup}
          setPopup={setTlPopup}
          items={items}
        />
      ) : list.length === 0 ? (
        <EmptyState
          image={undefined}
          text={
            tab === 'expected'
              ? filter !== 'all'
                ? '该类型下还没有期待'
                : '记录那些正在等待的日子'
              : '保存已经发生的珍贵时间'
          }
          action={
            <button onClick={() => openForm(null)} className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">
              {tab === 'expected' ? '添加第一个期待' : '添加第一个足迹'}
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((it) => {
            const today = dayjs().format('YYYY-MM-DD')
            if (tab === 'expected') {
              const nextDate = expectedSolarDate(it)
              const days = nextDate ? daysUntil(nextDate) : null
              return (
                <SwipeRow key={it.id} onDelete={() => onDelete(it)} onPress={() => openForm(it)}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void onDelete(it)
                    }}
                    className="absolute right-2 top-2 z-10 rounded-pill px-2 py-0.5 text-xs text-ink-3"
                  >
                    删除
                  </button>
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[16px] bg-highlight-soft text-2xl">
                        {it.avatar || catEmoji(it.category)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{it.title}</p>
                        <p className="mt-0.5 text-sm text-ink-3">
                          {eventTypeLabel(it.eventType)} · {catEmoji(it.category)} {catLabel(it.category)}
                          {it.relation ? ` · ${it.relation}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        {days !== null ? (
                          <>
                            <p className="text-2xl font-bold leading-none" style={{ color: 'var(--color-primary)' }}>
                              {days}
                              <span className="ml-1 text-sm font-normal text-ink-3">天</span>
                            </p>
                            <p className="mt-1 text-xs text-ink-3">还有 {days} 天</p>
                          </>
                        ) : (
                          <p className="text-sm font-semibold text-ink-3">每年</p>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-ink-3">
                      {it.dateType === 'lunar' ? (
                        <>
                          农历 {it.lunarDate}
                          {it.lunarYear ? ` · ${it.lunarYear} 年起` : ' · 每年'}
                          {nextDate ? <span className="ml-1 text-ink-3/60">下一次 {nextDate}</span> : null}
                        </>
                      ) : (
                        <>
                          🎂 {dayjs(it.solarDate).format('YYYY.MM.DD')}
                          {nextDate && nextDate !== (it.solarDate ?? '') ? (
                            <span className="ml-1 text-ink-3/60">下一次 {nextDate}</span>
                          ) : null}
                        </>
                      )}
                    </p>
                  </div>
                </SwipeRow>
              )
            }
            // 足迹
            const days = spanTotalDays(it.solarDate ?? '')
            return (
              <SwipeRow key={it.id} onDelete={() => onDelete(it)}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    void onDelete(it)
                  }}
                  className="absolute right-2 top-2 z-10 rounded-pill px-2 py-0.5 text-xs text-ink-3"
                >
                  删除
                </button>
                <div className="p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[16px] bg-highlight-soft text-2xl">
                      {it.avatar || catEmoji(it.category)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{it.title}</p>
                      <p className="mt-0.5 text-sm text-ink-3">
                        {catEmoji(it.category)} {catLabel(it.category)}
                        {it.relation ? ` · ${it.relation}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-card bg-surface-sunken px-4 py-3">
                    <p className="text-xs text-ink-3">已经陪伴</p>
                    <p className="mt-0.5 text-lg font-semibold text-ink">
                      {spanSince(it.solarDate ?? '')}
                      <span className="ml-1 text-sm font-normal text-ink-3">（{days} 天）</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {dayjs(it.solarDate).isValid() ? `${dayjs(it.solarDate).format('YYYY.MM.DD')} 开始` : `农历 ${it.lunarDate ?? ''} 开始`}
                    </p>
                  </div>
                </div>
              </SwipeRow>
            )
          })}
        </div>
      )}

      {/* 时间轴事件毛玻璃弹窗 */}
      {tlPopup && <TLEventPopup popup={tlPopup} onClose={() => setTlPopup(null)} />}
    </>
  )

  // 内嵌模式（空间页右栏）：沿用宿主滚动容器，头部以 sticky 保留（去阴影，避免割裂）
  if (embedded) {
    return (
      <>
        <div className="sticky top-0 z-20 -mx-4 bg-bg px-4 pb-2 pt-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">倒数日</h2>
            <button onClick={() => openForm(null)} className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg">+ 新增</button>
          </div>
          {countdownTabs}
        </div>
        {content}
      </>
    )
  }

  // 独立页面（底部 tab）：固定头部 + 独立滚动列表（彻底解决漏底/割裂/遮挡）
  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex-none bg-bg px-4 pb-4" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">倒数日</h1>
          <button onClick={() => openForm(null)} className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg">
            + 新增
          </button>
        </div>
        {countdownTabs}
      </header>
      <PullToRefresh onRefresh={reloadAll} className="bg-bg px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2">
        {content}
      </PullToRefresh>
    </div>
  )
}


// ── 时间轴（月份卡片墙 + 月历 + 事件毛玻璃弹窗） ──
const TL_META: Record<string, { emoji: string; label: string; rank: number }> = {
  footprint: { emoji: '📍', label: '足迹', rank: 1 },
  anniversary: { emoji: '💍', label: '纪念日', rank: 2 },
  birthday: { emoji: '🎂', label: '生日', rank: 3 },
  other: { emoji: '✨', label: '其他', rank: 4 },
}
const WEEK = ['日', '一', '二', '三', '四', '五', '六']

function TimelineView({
  year,
  setYear,
  month,
  setMonth,
  popup,
  setPopup,
  items,
}: {
  year: number
  setYear: (y: number) => void
  month: number | null
  setMonth: (m: number | null) => void
  popup: { date: string; events: { type: string; title: string; emoji: string; label: string; relation?: string }[] } | null
  setPopup: (p: { date: string; events: { type: string; title: string; emoji: string; label: string; relation?: string }[] } | null) => void
  items: CountdownEventEntity[]
}) {
  // 当年事件 → 按日期分组（期待按每年重复换算到当年；足迹取具体日期）
  const eventsByDate = useMemo(() => {
    const map = new Map<string, { type: string; title: string; emoji: string; label: string; rank: number; relation?: string }[]>()
    const push = (date: string, it: CountdownEventEntity) => {
      const type = it.kind === 'footprint' ? 'footprint' : (it.eventType ?? 'other')
      const m = TL_META[type]
      const arr = map.get(date) ?? []
      arr.push({ type, title: it.title, emoji: m.emoji, label: m.label, rank: m.rank, relation: it.relation })
      map.set(date, arr)
    }
    for (const it of items) {
      if (it.kind === 'footprint') {
        const d = dayjs(it.solarDate)
        if (d.isValid() && d.year() === year) push(d.format('YYYY-MM-DD'), it)
      } else {
        let md: { month: number; day: number } | null = null
        if (it.dateType === 'lunar') md = parseLunar(it.lunarDate ?? '')
        else {
          const d = dayjs(it.solarDate)
          if (d.isValid()) md = { month: d.month() + 1, day: d.date() }
        }
        if (!md) continue
        let solar = ''
        if (it.dateType === 'lunar') {
          try {
            solar = Lunar.fromYmd(year, md.month, md.day).getSolar().toYmd()
          } catch {
            continue
          }
        } else {
          solar = `${year}-${String(md.month).padStart(2, '0')}-${String(md.day).padStart(2, '0')}`
        }
        push(solar, it)
      }
    }
    // 排序：日期升序；同日期按优先级（足迹 > 纪念日 > 生日 > 其他）
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.rank - b.rank)
      map.set(k, arr)
    }
    return map
  }, [items, year])

  const monthHas = (m: number) => {
    const key = `${year}-${String(m).padStart(2, '0')}`
    for (const d of eventsByDate.keys()) if (d.startsWith(key)) return true
    return false
  }

  // 月份卡片墙
  if (month === null) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setYear(year - 1)} className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-sunken text-ink-2">
            ‹
          </button>
          <p className="text-lg font-semibold text-ink">{year} 年</p>
          <button onClick={() => setYear(year + 1)} className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-sunken text-ink-2">
            ›
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className="pressable relative flex h-20 flex-col items-center justify-center rounded-card bg-surface shadow-soft"
            >
              <span className="text-lg font-medium text-ink">{m} 月</span>
              {monthHas(m) && (
                <span className="mt-1 flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-pill bg-primary" />
                  <span className="h-1.5 w-1.5 rounded-pill bg-primary/40" />
                </span>
              )}
            </button>
          ))}
        </div>
        {eventsByDate.size === 0 && (
          <p className="mt-6 text-center text-sm text-ink-3">{year} 年还没有事件，去期待/足迹添加吧</p>
        )}
      </div>
    )
  }

  // 月历
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setMonth(null)}
          className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
        >
          ‹
        </button>
        <p className="text-lg font-semibold text-ink">
          {year} 年 {month} 月
        </p>
        <span className="w-9" />
      </div>
      <div className="rounded-card bg-surface p-3 shadow-soft">
        <div className="grid grid-cols-7 text-center">
          {WEEK.map((w) => (
            <span key={w} className="py-1.5 text-xs text-ink-3">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {cells.map((d, i) => {
            if (d === null) return <span key={`b${i}`} />
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            const evs = eventsByDate.get(dateStr)
            return (
              <button
                key={dateStr}
                onClick={() => evs && setPopup({ date: dateStr, events: evs.map((e) => ({ type: e.type, title: e.title, emoji: e.emoji, label: e.label, relation: e.relation })) })}
                className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm ${
                  evs ? 'font-semibold text-primary' : 'text-ink'
                }`}
              >
                {d}
                {evs && <span className="absolute bottom-0.5 h-1 w-1 rounded-pill bg-primary" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── 事件毛玻璃弹窗（点击日期出现；点外/下滑关闭） ──
function TLEventPopup({
  popup,
  onClose,
}: {
  popup: { date: string; events: { type: string; title: string; emoji: string; label: string; relation?: string }[] }
  onClose: () => void
}) {
  const startY = useRef<number | null>(null)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
      onTouchMove={(e) => {
        if (startY.current === null) return
        if (e.touches[0].clientY - startY.current > 40) onClose()
      }}
      onTouchEnd={() => (startY.current = null)}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[280px] rounded-[28px] bg-white/85 p-5 shadow-card backdrop-blur-xl"
        style={{ animation: 'popupUp 260ms cubic-bezier(.32,.72,0,1)' }}
      >
        <p className="text-base font-semibold text-ink">{dayjs(popup.date).format('YYYY 年 M 月 D 日')}</p>
        <div className="mt-3 space-y-2.5">
          {popup.events.map((e, i) => (
            <div key={i} className="rounded-card bg-surface-sunken/70 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <span className="text-base">{e.emoji}</span>
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <span className="flex-shrink-0 text-xs text-ink-3">{e.label}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-3">
                {e.relation && <span>人物：{e.relation}</span>}
                <span>类型：{e.label}</span>
                <span>日期：{dayjs(popup.date).format('YYYY-MM-DD')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes popupUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  )
}
