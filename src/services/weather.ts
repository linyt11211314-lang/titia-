// Titia 时序 · 天气服务（和风天气 QWeather）
// ---------------------------------------------------------------------------
// ⚙️  配置（请替换为你的真实值）：
//   QWEATHER_API_KEY  —— 和风天气 API Key（免费版每天 1000 次调用）
//   QWEATHER_API_HOST —— API 域名。免费版用 devapi.qweather.com；
//                        若你申请后获得专属域名（如 xxxxx.qweatherapi.com）请填专属域名。
// 注册指引见仓库根目录 WEATHER_SETUP.md
// ---------------------------------------------------------------------------
export const QWEATHER_API_KEY = 'dc69a3209e0949309629580dc8a89313'
export const QWEATHER_API_HOST = 'https://n47aatrcfa.re.qweatherapi.com'

// 缓存：localStorage，按「城市 location」分桶，15 分钟内复用，避免频繁调用 API
const CACHE_PREFIX = 'titia.wx.cache.'
const CACHE_TTL = 15 * 60_000
const CITY_KEY = 'titia.wx.city' // 用户手动切换的城市 { name, location }

// ───────────────────────── 类型 ─────────────────────────

export interface WeatherNow {
  city: string
  temp: number
  feelsLike: number
  text: string // 中文状况，如「晴」
  icon: string // emoji
  aqi: number
  aqiLevel: string // 优 / 良 / 轻度污染 …
  humidity: number // %
  windDir: string // 东南风
  windScale: string // 3
  uv: number // 等级数值（1-5）
  uvLevel: string // 低 / 中等 / 高 …
  uvText: string // 建议文案
}

export interface HourlyPoint {
  time: string // HH:mm
  temp: number
  icon: string
  text: string
}

export interface DailyPoint {
  date: string // MM/DD
  week: string // 周几
  tempMax: number
  tempMin: number
  icon: string
  text: string
}

export interface WeatherDetail extends WeatherNow {
  hourly: HourlyPoint[]
  daily: DailyPoint[]
}

// ───────────────────────── 工具 ─────────────────────────

// 和风天气文字状况 → emoji（按关键词匹配，覆盖绝大多数场景）
function qtIcon(text: string): string {
  if (/雷/.test(text)) return '⛈️'
  if (/雨/.test(text)) return '🌧️'
  if (/雪/.test(text)) return '❄️'
  if (/雾|霾|沙|尘/.test(text)) return '🌫️'
  if (/阴/.test(text)) return '☁️'
  if (/多云|少云|云/.test(text)) return '⛅'
  if (/晴/.test(text)) return '☀️'
  return '🌡️'
}

// 请求和风天气接口；优先直连，跨域/失败时走 CORS 代理兜底
async function qw(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${QWEATHER_API_HOST}${path}${sep}key=${QWEATHER_API_KEY}`
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`qweather ${r.status}`)
    const j = await r.json()
    if (j.code && j.code !== '200') throw new Error(`qweather code ${j.code}`)
    return j
  } catch {
    // 兜底：通过 allorigins 代理中转（解决浏览器跨域）
    const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    const r2 = await fetch(proxied)
    if (!r2.ok) throw new Error('proxy failed')
    const txt = await r2.text()
    const j = JSON.parse(txt)
    if (j.code && j.code !== '200') throw new Error(`qweather code ${j.code}`)
    return j
  }
}

// 城市名 / 经纬度 → 和风 location（id 或 "lon,lat"）+ 中文名
async function geoLookup(q: string): Promise<{ location: string; name: string } | null> {
  try {
    const d = await qw(`/geo/v2/city/lookup?location=${encodeURIComponent(q)}`)
    const c = d?.location?.[0]
    if (c?.id) return { location: c.id, name: c.name }
  } catch {
    /* 忽略，交给上层回退 */
  }
  return null
}

// 接口聚合：now / 24h / 7d / 空气质量 / 紫外线指数
async function fetchDetail(location: string, name: string): Promise<WeatherDetail> {
  const [nowD, hourlyD, dailyD, airD, uvD] = await Promise.all([
    qw(`/v7/weather/now?location=${location}`),
    qw(`/v7/weather/24h?location=${location}`),
    qw(`/v7/weather/7d?location=${location}`),
    qw(`/v7/airquality/now?location=${location}`).catch(() => ({ now: null })),
    qw(`/v7/indices/1d?type=5&location=${location}`).catch(() => ({ daily: [] })),
  ])

  const now = nowD?.now ?? {}
  const air = airD?.now ?? {}
  const uv = uvD?.daily?.[0] ?? {}

  const hourly: HourlyPoint[] = (hourlyD?.hourly ?? [])
    .filter((_: any, i: number) => i % 3 === 0)
    .slice(0, 8)
    .map((h: any) => ({
      time: (h.fxTime || '').slice(11, 16) || '--:--',
      temp: Math.round(Number(h.temp)),
      icon: qtIcon(h.text || ''),
      text: h.text || '',
    }))

  const weekMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const daily: DailyPoint[] = (dailyD?.daily ?? []).slice(0, 7).map((d: any) => {
    const dt = new Date(d.fxDate)
    return {
      date: `${dt.getMonth() + 1}/${dt.getDate()}`,
      week: weekMap[dt.getDay()],
      tempMax: Math.round(Number(d.tempMax)),
      tempMin: Math.round(Number(d.tempMin)),
      icon: qtIcon(d.textDay || d.text || ''),
      text: d.textDay || d.text || '',
    }
  })

  return {
    city: name,
    temp: Math.round(Number(now.temp)),
    feelsLike: Math.round(Number(now.feelsLike ?? now.temp)),
    text: now.text || '—',
    icon: qtIcon(now.text || ''),
    aqi: Number(air.aqi ?? 0),
    aqiLevel: air.category || '—',
    humidity: Math.round(Number(now.humidity ?? 0)),
    windDir: now.windDir || '—',
    windScale: now.windScale || '0',
    uv: Number(uv.level ?? 0),
    uvLevel: uv.category || '—',
    uvText: uv.text || '',
    hourly,
    daily,
  }
}

// ───────────────────────── 定位 / 城市解析 ─────────────────────────

function getPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('no geolocation'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 8000, maximumAge: 600_000 },
    )
  })
}

// 读取本地保存的手动城市（优先）
function getSavedCity(): { name: string; location: string } | null {
  try {
    const raw = localStorage.getItem(CITY_KEY)
    if (raw) {
      const c = JSON.parse(raw)
      if (c?.name && c?.location) return c
    }
  } catch {
    /* 忽略 */
  }
  return null
}

// 解析「用哪个 location 请求」：手动城市 > 定位 > 默认深圳
async function resolveLocation(): Promise<{ location: string; name: string }> {
  const saved = getSavedCity()
  if (saved) return saved

  try {
    const pos = await getPosition()
    const ll = `${pos.lon.toFixed(2)},${pos.lat.toFixed(2)}`
    // 反查城市名（失败则用「当前位置」）
    const g = await geoLookup(ll).catch(() => null)
    return { location: ll, name: g?.name || '当前位置' }
  } catch {
    // 定位失败回退默认深圳（22.5431,114.0579）
    return { location: '114.06,22.54', name: '深圳' }
  }
}

// ───────────────────────── 缓存 ─────────────────────────

function cacheKey(location: string) {
  return CACHE_PREFIX + location
}

function readCache(location: string): WeatherDetail | null {
  try {
    const raw = localStorage.getItem(cacheKey(location))
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts < CACHE_TTL && data) return data as WeatherDetail
  } catch {
    /* 忽略 */
  }
  return null
}

function writeCache(location: string, data: WeatherDetail) {
  try {
    localStorage.setItem(cacheKey(location), JSON.stringify({ ts: Date.now(), data }))
  } catch {
    /* 存储满忽略 */
  }
}

// ───────────────────────── 对外接口 ─────────────────────────

// 获取完整天气详情（含当前/逐小时/7天）。force=true 忽略缓存（切换城市/重试时）
export async function getWeatherDetail(force = false): Promise<WeatherDetail> {
  const { location, name } = await resolveLocation()
  if (!force) {
    const cached = readCache(location)
    if (cached) return cached
  }
  const detail = await fetchDetail(location, name)
  writeCache(location, detail)
  return detail
}

// 仅取「当前天气」用于首页 Banner（复用 getWeatherDetail 的缓存，只请求一次）
export async function getWeatherNow(force = false): Promise<WeatherNow> {
  return getWeatherDetail(force)
}

// 切换城市：保存并校验（找不到城市返回 false）
export async function setCity(cityName: string): Promise<boolean> {
  const q = cityName.trim()
  if (!q) return false
  const g = await geoLookup(q)
  if (!g) return false
  try {
    localStorage.setItem(CITY_KEY, JSON.stringify({ name: g.name, location: g.location }))
  } catch {
    /* 忽略 */
  }
  return true
}

// 清除手动城市，恢复「定位 > 默认深圳」
export function clearCity() {
  try {
    localStorage.removeItem(CITY_KEY)
  } catch {
    /* 忽略 */
  }
}

// 兼容旧调用：暴露紫外线等级换算（数值 → 文案）
export function uvLevel(uv: number): string {
  if (uv < 3) return '低'
  if (uv < 6) return '中等'
  if (uv < 8) return '高'
  if (uv < 11) return '很高'
  return '极高'
}
