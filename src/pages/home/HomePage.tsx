import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '../../components/base/Card'
import { SwipeRow } from '../../components/base/SwipeRow'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { reloadAll } from '../../services/reload'
import { MotifCorner } from '../../components/base/MotifMark'
import { PlusIcon } from '../../components/icons'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput } from '../../components/base/fields'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useTodoStore, isTodoDue } from '../../stores/useTodoStore'
import { useShoppingStore } from '../../stores/useShoppingStore'
import { useBookStore } from '../../stores/useBookStore'
import { useAppStore } from '../../stores/useAppStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { navigate } from '../../app/useHashRoute'
import { getWeatherDetail, type WeatherDetail } from '../../services/weather'
import { WeatherSheet } from '../../components/weather/WeatherSheet'
import { checkInToday, isCheckedToday, usageDays, streakDays } from '../../services/checkin'
import type { TransactionEntity } from '../../db/types'

const GREET = () => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

// 世界时钟：用 Intl.DateTimeFormat + timeZone 自动处理夏令时（伦敦 BST/GMT 切换），
// 每 30s 刷新一次，组件卸载时清理定时器，避免内存泄漏。
function formatTz(tz: string): { time: string; md: string } {
  try {
    const d = new Date()
    const time = new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
    const md = new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      month: '2-digit',
      day: '2-digit',
      hour12: false,
    }).format(d)
    return { time, md }
  } catch {
    return { time: '--:--', md: '--/--' }
  }
}

function TimeDisplay({ label, timeZone }: { label: string; timeZone: string }) {
  const [v, setV] = useState(() => formatTz(timeZone))
  useEffect(() => {
    const id = setInterval(() => setV(formatTz(timeZone)), 30_000)
    return () => clearInterval(id)
  }, [timeZone])
  return (
    <span className="tabular-nums">
      <span className="opacity-70">{label}</span>
      <span className="ml-1 font-medium">{v.md} {v.time}</span>
    </span>
  )
}

function TodoForm({ onSave }: { onSave: (title: string, remindAt?: number) => void }) {
  const [title, setTitle] = useState('')
  const [remind, setRemind] = useState('')
  return (
    <div>
      <Field label="待办内容">
        <TextInput value={title} onChange={setTitle} placeholder="想记住的小事" />
      </Field>
      <Field label="提醒时间（可空）">
        <TextInput value={remind} onChange={setRemind} placeholder="YYYY-MM-DD HH:mm" />
      </Field>
      <button
        onClick={() => {
          if (!title.trim()) return
          const ts = remind.trim() ? dayjs(remind.trim()).valueOf() : undefined
          if (remind.trim() && Number.isNaN(ts)) return
          onSave(title.trim(), ts)
        }}
        className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg"
      >
        保存
      </button>
    </div>
  )
}

export function HomePage() {
  const { todos, loaded, load, create, toggle, remove } = useTodoStore()
  const { items: shopItems, loaded: shopLoaded, load: shopLoad, toggle: shopToggle } = useShoppingStore()
  const { transactions, loaded: bookLoaded, load: loadBook } = useBookStore()
  const showToast = useAppStore((s) => s.showToast)
  const skin = useSettingsStore((s) => s.skin)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [weather, setWeather] = useState<WeatherDetail | null>(null)
  // 打卡统计（已使用 = 2026.8.3 至今日历天数；连续 = 手动打卡连续；今日打卡按钮）
  const [checkin, setCheckin] = useState({ usage: 0, streak: 0, checkedToday: false })
  const refreshCheckin = async () => {
    const [streak, checkedToday] = await Promise.all([streakDays(), isCheckedToday()])
    setCheckin({ usage: usageDays(), streak, checkedToday })
  }
  useEffect(() => {
    void refreshCheckin()
  }, [])
  // 跨日自动刷新：每日 0 点后打卡按钮恢复可点（轻量每分钟检查，跨日即刻生效）
  useEffect(() => {
    const id = setInterval(() => void refreshCheckin(), 60_000)
    return () => clearInterval(id)
  }, [])
  const onCheckIn = async () => {
    if (await checkInToday()) {
      await refreshCheckin()
      showToast('打卡成功，今天也来看我啦 🎉')
    }
  }

  useEffect(() => {
    if (!loaded) load()
    if (!shopLoaded) shopLoad()
    if (!bookLoaded) loadBook()
  }, [loaded, load, shopLoaded, shopLoad, bookLoaded, loadBook])

  useEffect(() => {
    getWeatherDetail().then(setWeather).catch(() => {})
  }, [])

  // 今日 / 本月消费（支出；转账不计消费；与账单列表同一数据源 transactions，账单变化自动重渲染）
  const isExpense = (t: TransactionEntity): boolean => t.txType === 'expense' || (!t.txType && t.amount > 0)
  const todayKey = dayjs().format('YYYY-MM-DD')
  const monthKey = dayjs().format('YYYY-MM')
  const todayExpense = transactions.filter((t) => isExpense(t) && t.time.startsWith(todayKey)).reduce((s, t) => s + Math.abs(t.amount), 0)
  const monthExpense = transactions.filter((t) => isExpense(t) && t.time.startsWith(monthKey)).reduce((s, t) => s + Math.abs(t.amount), 0)

  const unbought = shopItems.filter((i) => i.status !== 'completed')
  // 待办速览只显示未完成项（点击完成即从速览消失）
  const activeTodos = todos.filter((t) => !t.done)

  const onDelete = async (id: string) => {
    if (await confirmSheet('删除待办', '删除这条待办？')) {
      remove(id)
      showToast('已删除')
    }
  }

  // 天气小模块（和风天气，点击展开详情）——首页 Banner 与玉桂狗 Hero 共用
  const weatherModule = (
    <div
      onClick={() =>
        open(
          <Sheet title="天气" onClose={close}>
            <WeatherSheet />
          </Sheet>,
        )
      }
      className="pressable flex min-w-[4.5rem] cursor-pointer flex-col items-end text-right"
    >
      {weather ? (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-2xl leading-none">{weather.icon}</span>
            <span className="text-xl font-semibold text-ink">{weather.temp}°</span>
          </div>
          <p className="mt-1 text-xs text-ink-2">{weather.text}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            紫外线 {weather.uv} {weather.uvLevel}
          </p>
        </>
      ) : (
        <div className="h-12 w-16 animate-pulse rounded-card bg-surface-sunken" />
      )}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Banner（固定不滚动；顶部安全区由全局遮罩兜底，标签在左上角） */}
      <div className="shrink-0 px-5 pb-3 pt-[calc(var(--safe-top)+12px)]">
        {/* 今日 Banner：统一信息卡，不占用插画位置；主题元素由卡片肌理(skin-card) + 全局飘浮层体现 */}
        <div className="relative overflow-hidden flex items-start justify-between rounded-card bg-surface p-5 shadow-card skin-card">
          <MotifCorner size={88} opacity={0.1} />
          <div className="relative">
            <p className="text-xs text-ink-3">Titia 时序</p>
            <h1 className="mt-0.5 text-2xl font-semibold text-ink">{GREET()}</h1>
            {/* 世界时钟：伦敦 / 迪拜 实时时间 */}
            <div className="mt-1.5 flex flex-col gap-0.5 text-[13px] leading-tight text-ink-2">
              <TimeDisplay label="伦敦" timeZone="Europe/London" />
              <TimeDisplay label="迪拜" timeZone="Asia/Dubai" />
            </div>
          </div>
          {weatherModule}
        </div>
      </div>

      {/* 下方内容区：打卡 / 待办 / 购物清单（独立滚动 + 下拉刷新，不被底部导航遮挡） */}
      <div className="min-h-0 flex-1">
      <PullToRefresh
        onRefresh={reloadAll}
        className="flex h-full flex-col overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2"
      >
      {/* 打卡面板 + 消费卡片（banner 下方、待办上方；消费真实同步账单今日/本月花销） */}
      <section className="mb-5 fade-up">
        <div className="grid grid-cols-2 gap-2">
          {/* 已使用：2026.8.3 至今过去多少天 */}
          <div className="flex flex-col justify-between rounded-card bg-surface p-4 shadow-soft skin-card">
            <p className="text-xs text-ink-3">📅 已使用</p>
            <p className="mt-2 text-3xl font-bold leading-none text-ink">
              {checkin.usage}
              <span className="ml-1 text-sm font-normal text-ink-3">天</span>
            </p>
            <p className="mt-2 text-[11px] text-ink-3">2026.8.3 起 · 今天第 {checkin.usage} 天</p>
          </div>
          {/* 连续打卡：手动打卡按钮（每日 0 点恢复可打卡） */}
          <div
            className={`flex flex-col justify-between rounded-card p-4 shadow-soft skin-card ${
              checkin.checkedToday ? 'bg-primary-soft' : 'bg-surface'
            }`}
          >
            <p className="text-xs text-ink-3">🔥 连续打卡</p>
            <p className="mt-2 text-3xl font-bold leading-none text-ink">
              {checkin.streak}
              <span className="ml-1 text-sm font-normal text-ink-3">天</span>
            </p>
            {checkin.checkedToday ? (
              <button
                type="button"
                disabled
                className="mt-2.5 rounded-pill bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary"
              >
                ✓ 今日已打卡
              </button>
            ) : (
              <button
                type="button"
                onClick={onCheckIn}
                className="pressable mt-2.5 rounded-pill bg-primary px-3 py-2 text-center text-xs font-semibold text-bg shadow-card"
              >
                📅 打卡
              </button>
            )}
            <p className="mt-1.5 text-[11px] text-ink-3">真棒！今天又来看我啦～</p>
          </div>
          {/* 今日消费 / 本月消费（真实同步账单） */}
          <div className="rounded-card bg-surface p-4 shadow-soft skin-card">
            <p className="text-xs text-ink-3">💰 今日消费</p>
            <p className="mt-2 text-xl font-bold text-ink">¥{(todayExpense / 100).toFixed(2)}</p>
          </div>
          <div className="rounded-card bg-surface p-4 shadow-soft skin-card">
            <p className="text-xs text-ink-3">📊 本月消费</p>
            <p className="mt-2 text-xl font-bold text-ink">¥{(monthExpense / 100).toFixed(2)}</p>
          </div>
        </div>
      </section>

      {/* 待办事项 */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            待办
            {todos.some(isTodoDue) && <span className="h-2.5 w-2.5 rounded-pill bg-accent" />}
            <button onClick={() => navigate('/todo')} className="ml-auto text-xs font-normal text-ink-3">
              全部 ›
            </button>
          </h2>
          <button
            onClick={() =>
              open(
                <Sheet title="新待办" onClose={close}>
                  <TodoForm
                    onSave={async (title, remindAt) => {
                      await create(title, remindAt)
                      close()
                      showToast('已添加')
                    }}
                  />
                </Sheet>,
              )
            }
            className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-primary text-bg"
            aria-label="新增待办"
          >
            <PlusIcon width={18} height={18} />
          </button>
        </div>
        {activeTodos.length === 0 ? (
          <div className="rounded-card bg-surface p-4 text-center shadow-soft">
            <p className="text-sm text-ink-2">今天没有待办，享受当下</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeTodos.slice(0, 3).map((t) => {
              const due = isTodoDue(t)
              return (
                <SwipeRow key={t.id} onDelete={() => onDelete(t.id)}>
                <Card variant="plain" onPress={() => toggle(t.id, !t.done)}>
                  <div className="flex items-center gap-3 p-4">
                    <span className={`h-5 w-5 rounded-pill border ${t.done ? 'border-primary bg-primary' : due ? 'border-accent' : 'border-line'}`} />
                    <span className={`flex-1 ${t.done ? 'text-ink-3 line-through' : due ? 'font-medium text-ink' : 'text-ink'}`}>{t.title}</span>
                    {due && <span className="text-xs text-accent">到点</span>}
                  </div>
                </Card>
                </SwipeRow>
              )
            })}
            {activeTodos.length > 3 && <p className="px-1 text-sm text-ink-3">还有 {activeTodos.length - 3} 条</p>}
          </div>
        )}
      </section>

      {/* 购物清单 · 待买（点按标记为已买） */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">购物清单 · 待买</h2>
          <button onClick={() => navigate('/shopping')} className="text-xs font-normal text-ink-3">
            管理 ›
          </button>
        </div>
        {unbought.length === 0 ? (
          <p className="rounded-card bg-surface p-4 text-sm text-ink-3 shadow-card">都买好啦 🎉</p>
        ) : (
          <div className="flex flex-col gap-2">
            {unbought.map((i) => (
              <div
                key={i.id}
                onClick={() => {
                  shopToggle(i.id, true)
                  showToast(`已买：${i.name}`)
                }}
                className="pressable flex items-center gap-3 rounded-card bg-surface p-4 shadow-card"
              >
                <span className="h-5 w-5 flex-shrink-0 rounded-pill border-2 border-line" />
                <span className="flex-1 text-ink">{i.name}</span>
                <span className="text-xs text-ink-3">标记已买</span>
              </div>
            ))}
          </div>
        )}
      </section>
      </PullToRefresh>
      </div>
    </div>
  )
}
