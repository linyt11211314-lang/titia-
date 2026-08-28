import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { PageHost } from '../../components/nav/PageHost'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { reloadAll } from '../../services/reload'
import { haptic } from '../../services/haptic'
import { CyclePage } from '../cycle/CyclePage'
import { PetPage } from '../pet/PetPage'
import { VaultPage } from '../vault/VaultPage'
import { CountdownPage, daysUntil, expectedSolarDate, eventTypeLabel, catEmoji } from '../countdown/CountdownPage'
import { useCountdownStore } from '../../stores/useCountdownStore'
import { useCycleStore, predictNext } from '../../stores/useCycleStore'
import { usePetStore } from '../../stores/usePetStore'
import { useRecordStore } from '../../stores/useRecordStore'
import type { CountdownEventEntity, RecordEntity } from '../../db/types'

// Titia 时序 · 空间（左侧常驻导航栏 + 右侧内嵌完整模块页 / 首页预览）
//
// 交互契约（多版返工后定稿，别再改）：
//   · 左侧导航栏在空间页的任何板块下都常驻可见，点击即切换右侧板块。
//   · 切换是页内 state，不走路由——所以导航栏不会消失，也没有返回键往返。
//   · 右侧是模块的【完整页面】（embedded 模式）或【首页预览】（聚合看板）。

type TabKey = 'home' | 'countdown' | 'cycle' | 'pet' | 'vault'
type Tone = 'accent' | 'highlight' | 'neutral'

const NAV: { key: TabKey; icon: string; short: string; tone: Tone }[] = [
  { key: 'home', icon: '🏠', short: '首页', tone: 'accent' },
  { key: 'countdown', icon: '🕰', short: '倒数日', tone: 'accent' },
  { key: 'cycle', icon: '🌙', short: '周期', tone: 'accent' },
  { key: 'pet', icon: '🐱', short: '憨憨', tone: 'accent' },
  { key: 'vault', icon: '🔐', short: '密码', tone: 'neutral' },
]

const ICON_ON: Record<Tone, string> = {
  accent: 'bg-accent-soft text-accent',
  highlight: 'bg-highlight-soft text-highlight',
  neutral: 'bg-primary-soft text-primary',
}

export function SpacePage() {
  const [active, setActive] = useState<TabKey>('home')
  const rightRef = useRef<HTMLDivElement>(null)

  return (
    <PageHost contentClassName="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 顶部横向滑动标签（替代左侧垂直导航）：单行可横向滑动，激活=主色下划线；顶部避让状态栏 */}
        <div className="flex shrink-0 items-stretch gap-5 overflow-x-auto border-b border-line bg-bg px-4 pt-[calc(var(--safe-top)+8px)]">
          {NAV.map((n) => {
            const on = n.key === active
            return (
              <button
                key={n.key}
                onClick={() => {
                  haptic()
                  setActive(n.key)
                }}
                aria-current={on ? 'page' : undefined}
                className={`relative flex shrink-0 items-center gap-1 pb-2.5 pt-1 text-[15px] transition-colors ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}
              >
                <span className="text-base leading-none">{n.icon}</span>
                <span className="whitespace-nowrap leading-none">{n.short}</span>
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                  style={{ background: on ? 'var(--color-primary)' : 'transparent' }}
                />
              </button>
            )
          })}
        </div>

        {/* 内容区（全宽，内嵌完整模块页 / 首页预览，各自独立滚动（含下拉刷新）；不透明背景避免滚动透出） */}
        <PullToRefresh
          scrollRef={rightRef}
          onRefresh={reloadAll}
          className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-0"
        >
          <div key={active} className="fade-up">
            {active === 'home' && <SpaceHome onNavigate={setActive} />}
            {active === 'countdown' && <CountdownPage embedded />}
            {active === 'cycle' && <CyclePage embedded />}
            {active === 'pet' && <PetPage embedded />}
            {active === 'vault' && <VaultPage embedded />}
          </div>
        </PullToRefresh>
      </div>
    </PageHost>
  )
}

// ── 首页预览：聚合小窝各模块的最近一条精华（2+1 非对称网格） ──
function SpaceHome({ onNavigate }: { onNavigate: (k: TabKey) => void }) {
  const { items: cd, loaded: cdLoaded, load: cdLoad } = useCountdownStore()
  const { items: cy, loaded: cyLoaded, load: cyLoad } = useCycleStore()
  const { pets, loaded: petLoaded, load: petLoad, health, loadHealth } = usePetStore()
  const { records, loaded: recLoaded, load: recLoad } = useRecordStore()

  useEffect(() => {
    if (!cdLoaded) cdLoad()
    if (!cyLoaded) cyLoad()
    if (!petLoaded) petLoad()
    if (!recLoaded) recLoad()
  }, [cdLoaded, cdLoad, cyLoaded, cyLoad, petLoaded, petLoad, recLoaded, recLoad])

  const pet0 = pets[0]
  // 憨憨健康记录（含体重）：宠物就绪后加载
  useEffect(() => {
    if (pet0) void loadHealth(pet0.id)
  }, [pet0, loadHealth])

  // ① 最近倒数日（期待中剩余天数最少者）
  const upcoming = useMemo(() => {
    let best: { it: CountdownEventEntity; date: string; days: number } | null = null
    for (const it of cd) {
      if (it.kind !== 'expected') continue
      const date = expectedSolarDate(it)
      if (!date) continue
      const days = daysUntil(date)
      if (!best || days < best.days) best = { it, date, days }
    }
    return best
  }, [cd])

  // ② 周期预估下次开始 + 距今天数
  const cycle = useMemo(() => {
    const { avgCycleDays, nextStart } = predictNext(cy)
    return nextStart ? { date: nextStart, days: daysUntil(nextStart), avg: avgCycleDays } : null
  }, [cy])

  // ③ 憨憨：体重（最近一条 + 较上次差值）与年龄（按生日精确到月）
  const weights = useMemo(() => {
    if (!pet0) return []
    return health
      .filter((h) => h.kind === 'weight' && h.petId === pet0.id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }, [health, pet0])
  const latestW = weights[weights.length - 1]
  const prevW = weights[weights.length - 2]
  const diffW =
    latestW && prevW && latestW.value != null && prevW.value != null
      ? Number(latestW.value) - Number(prevW.value)
      : null
  const ageText = useMemo(() => {
    if (!pet0?.birthday) return null
    const b = dayjs(pet0.birthday)
    if (!b.isValid()) return null
    const now = dayjs()
    const years = now.diff(b, 'year')
    const months = now.subtract(years, 'year').diff(b, 'month')
    if (years <= 0 && months <= 0) return '刚出生'
    return `${years > 0 ? `${years}岁` : ''}${months}个月`
  }, [pet0])

  // ④ 本周动态摘要（周一起算：本周新增记录 / 成长时光 / 体重记录）
  const weekStats = useMemo(() => {
    const now = dayjs()
    const dow = now.day()
    const monday = now.startOf('day').subtract(dow === 0 ? 6 : dow - 1, 'day').valueOf()
    const inWeek = (t: number) => t >= monday
    const weekRecords = records.filter((r) => inWeek(r.occurredAt)).length
    const weekMoments = records.filter((r) => r.type === 'pet_moment' && inWeek(r.occurredAt)).length
    const weekWeights = weights.filter((w) => inWeek(dayjs(w.date).valueOf())).length
    return { weekRecords, weekMoments, weekWeights }
  }, [records, weights])

  return (
    <div className="flex flex-col gap-3">
      {/* 欢迎标题 */}
      <div className="pt-1">
        <p className="text-xs text-ink-3">Titia 时序 · 小窝</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-ink">今天也记得看看他们</h1>
      </div>

      {/* 第一行：2+1 非对称网格（最近倒数日 60% + 周期预测 40%） */}
      <div className="grid grid-cols-5 gap-3">
        {/* ① 最近倒数日（60%） */}
        <button
          onClick={() => onNavigate('countdown')}
          className="pressable col-span-3 rounded-card bg-surface p-4 text-left shadow-soft"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-2">最近倒数日</span>
            <span className="text-xs text-ink-3">查看全部 ›</span>
          </div>
          {upcoming ? (
            <div className="mt-2.5 flex items-center gap-3">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[16px] bg-highlight-soft text-2xl">
                {upcoming.it.avatar || catEmoji(upcoming.it.category)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-ink">{upcoming.it.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-3">
                  {eventTypeLabel(upcoming.it.eventType)} · {dayjs(upcoming.date).format('M 月 D 日')}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-2xl font-bold leading-none" style={{ color: 'var(--color-primary)' }}>
                  {upcoming.days}
                </p>
                <p className="mt-0.5 text-xs text-ink-3">天后</p>
              </div>
            </div>
          ) : (
            <p className="mt-2.5 text-sm text-ink-3">还没有倒数日，去添加一个值得期待的日子吧</p>
          )}
        </button>

        {/* ② 周期预测（40%） */}
        <button
          onClick={() => onNavigate('cycle')}
          className="pressable col-span-2 rounded-card bg-surface p-4 text-left shadow-soft"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-2">周期预测</span>
            <span className="text-xs text-ink-3">记录 ›</span>
          </div>
          {cycle ? (
            <div className="mt-2.5">
              <p className="text-2xl font-bold leading-none" style={{ color: 'var(--color-primary)' }}>
                {cycle.days}
                <span className="ml-1 text-sm font-normal text-ink-3">天后</span>
              </p>
              <p className="mt-1.5 truncate text-xs text-ink-3">预计 {dayjs(cycle.date).format('M 月 D 日')}</p>
            </div>
          ) : (
            <p className="mt-2.5 text-sm text-ink-3">记录一次周期后，这里会预测下次</p>
          )}
        </button>
      </div>

      {/* 第二行：憨憨横向轻量条（体重 + 年龄；浅灰底无边框，~80pt 轻量感） */}
      <button
        onClick={() => onNavigate('pet')}
        className="pressable block w-full rounded-card bg-surface-sunken px-4 text-left"
        style={{ paddingTop: 12, paddingBottom: 12, minHeight: 80 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink-2">🐱 {pet0 ? pet0.name : '憨憨'}</span>
          <span className="text-xs text-ink-3">去看看 ›</span>
        </div>
        {!pet0 ? (
          <p className="mt-2 text-sm text-ink-3">还没有毛孩子，添加第一只吧</p>
        ) : (
          <div className="mt-1.5 flex items-center gap-6">
            {/* 体重：最近一次 + 较上次增减（绿降/红升/灰平） */}
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⚖️</span>
              <div>
                {latestW && latestW.value != null ? (
                  <>
                    <p className="text-lg font-semibold leading-tight text-ink">
                      {Number(latestW.value).toFixed(1)}
                      <span className="ml-0.5 text-xs font-normal text-ink-3">kg</span>
                    </p>
                    {diffW !== null && Math.abs(diffW) >= 0.01 && (
                      <p
                        className={`mt-0.5 text-xs leading-none ${
                          diffW > 0 ? 'text-red-500' : 'text-green-600'
                        }`}
                      >
                        {diffW > 0 ? '▲' : '▼'} 较上次 {diffW > 0 ? '+' : ''}
                        {diffW.toFixed(1)} kg
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-3">未记录体重</p>
                )}
              </div>
            </div>
            {/* 年龄：精确到月，与体重并排 */}
            {ageText && (
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🎂</span>
                <p className="text-lg font-semibold leading-tight text-ink">{ageText}</p>
              </div>
            )}
          </div>
        )}
      </button>

      {/* 本周动态摘要：填充原卡片移除后的空间（真实可聚合数据） */}
      <div className="rounded-card bg-surface p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink-2">本周动态</span>
          <span className="text-xs text-ink-3">本周一至今</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-btn bg-surface-sunken py-2.5">
            <p className="text-xl font-bold text-ink">{weekStats.weekRecords}</p>
            <p className="mt-0.5 text-xs text-ink-3">新增记录</p>
          </div>
          <div className="rounded-btn bg-surface-sunken py-2.5">
            <p className="text-xl font-bold text-ink">{weekStats.weekMoments}</p>
            <p className="mt-0.5 text-xs text-ink-3">成长时光</p>
          </div>
          <div className="rounded-btn bg-surface-sunken py-2.5">
            <p className="text-xl font-bold text-ink">{weekStats.weekWeights}</p>
            <p className="mt-0.5 text-xs text-ink-3">体重记录</p>
          </div>
        </div>
      </div>
    </div>
  )
}
