// Titia 时序 · 天气详情（底部半屏）
import { useEffect, useState } from 'react'
import { getWeatherDetail, setCity, type WeatherDetail } from '../../services/weather'
import { useAppStore } from '../../stores/useAppStore'

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card bg-surface/70 p-2.5">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{sub}</p>}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-44 animate-pulse rounded-card bg-surface-sunken" />
      <div className="h-24 animate-pulse rounded-card bg-surface-sunken" />
      <div className="h-52 animate-pulse rounded-card bg-surface-sunken" />
    </div>
  )
}

export function WeatherSheet() {
  const showToast = useAppStore((s) => s.showToast)
  const [detail, setDetail] = useState<WeatherDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [cityInput, setCityInput] = useState('')

  const load = async (force = false) => {
    setLoading(true)
    setError(false)
    try {
      const d = await getWeatherDetail(force)
      setDetail(d)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const onSwitch = async () => {
    const name = cityInput.trim()
    if (!name) return
    setLoading(true)
    const ok = await setCity(name)
    if (!ok) {
      setLoading(false)
      showToast('未找到该城市，换个名字试试')
      return
    }
    setEditing(false)
    setCityInput('')
    await load(true)
  }

  if (loading) return <Skeleton />
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-ink-2">网络开了小差</p>
        <button
          type="button"
          onClick={() => void load(true)}
          className="pressable mt-4 rounded-pill bg-primary px-5 py-2.5 text-sm text-bg"
        >
          点击重试
        </button>
        {!navigator.onLine && <p className="mt-2 text-xs text-ink-3">请检查网络连接</p>}
      </div>
    )
  }
  if (!detail) return null

  return (
    <div className="flex flex-col gap-4">
      {/* 当前天气卡片 */}
      <div className="rounded-card bg-primary-soft p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-ink">{detail.city}</p>
            <p className="text-xs text-ink-3">{detail.text}</p>
          </div>
          <span className="text-5xl leading-none">{detail.icon}</span>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-5xl font-bold leading-none text-ink">{detail.temp}°</span>
          <span className="mb-1.5 text-sm text-ink-2">体感 {detail.feelsLike}°</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="空气质量" value={`${detail.aqi} ${detail.aqiLevel}`} />
          <Metric label="湿度" value={`${detail.humidity}%`} />
          <Metric label="风" value={`${detail.windDir} ${detail.windScale}级`} />
          <Metric label="紫外线" value={`${detail.uv} ${detail.uvLevel}`} sub={detail.uvText} />
        </div>
      </div>

      {/* 逐小时预报 */}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">未来 24 小时</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {detail.hourly.map((h, i) => (
            <div
              key={i}
              className="flex w-16 shrink-0 flex-col items-center rounded-card bg-surface p-3 shadow-soft"
            >
              <span className="text-xs text-ink-3">{h.time}</span>
              <span className="my-1.5 text-xl">{h.icon}</span>
              <span className="text-sm font-medium text-ink">{h.temp}°</span>
            </div>
          ))}
        </div>
      </div>

      {/* 7 天预报 */}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">未来 7 天</p>
        <div className="flex flex-col gap-0.5 rounded-card bg-surface p-2 shadow-soft">
          {detail.daily.map((d, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <span className="w-12 text-sm text-ink-2">{i === 0 ? '今天' : d.week}</span>
              <span className="w-10 text-center text-xl">{d.icon}</span>
              <span className="flex-1 text-xs text-ink-3">{d.text}</span>
              <span className="text-sm text-ink-3">{d.tempMin}°</span>
              <span className="mx-1 text-ink-3">/</span>
              <span className="text-sm font-medium text-ink">{d.tempMax}°</span>
            </div>
          ))}
        </div>
      </div>

      {/* 切换城市 */}
      <div className="pt-1">
        {editing ? (
          <div className="flex gap-2">
            <input
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onSwitch()
              }}
              placeholder="输入城市名，如 北京"
              className="flex-1 rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void onSwitch()}
              className="pressable rounded-pill bg-primary px-4 py-2 text-sm text-bg"
            >
              确定
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="pressable w-full rounded-pill bg-surface-sunken py-2.5 text-sm text-ink-2"
          >
            切换城市
          </button>
        )}
      </div>
    </div>
  )
}
