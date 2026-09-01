// Titia 时序 · 主题皮肤（全局可换肤）
// 每套皮肤定义浅色/深色两套语义 token（与 index.css 中 --color-* 一一对应）。
// 运行时由 applySkin 把 token 写到 document.documentElement 的内联样式上，覆盖默认值，实现全局换肤。
//
// 皮肤分两组：
//   basic     —— 纯配色，无装饰，克制风格
//   character —— 角色皮肤：配色 + 装饰图形(motif) + 更圆更软的形状
// 角色皮肤只取「配色气质」，装饰一律用自绘通用图形（云/星/花/爪印/蝴蝶结），不复刻任何角色形象。

import type { MotifKind } from './motifs'

export interface Palette {
  bg: string
  surface: string
  'surface-sunken': string
  primary: string
  'primary-soft': string
  accent: string
  'accent-soft': string
  highlight: string
  'highlight-soft': string
  ink: string
  'ink-2': string
  'ink-3': string
  line: string
}

/** 形状覆盖：角色皮肤更圆润、阴影更散 */
export interface Shape {
  'radius-card': string
  'radius-sheet': string
  'radius-btn': string
  'radius-img': string
  'shadow-soft': string
  'shadow-card': string
  'shadow-pill': string
}

export interface Skin {
  id: string
  name: string
  group: 'basic' | 'character' | 'clash'
  /** 角色皮肤的装饰图形；其它组不设 = 不渲染任何装饰 */
  motif?: MotifKind
  /** 一句话说明，主题中心展示 */
  note?: string
  /** 内置皮肤版本号；代码里的 version 大于本地预设库时，自动覆盖本地副本，保证迭代更新生效 */
  version?: number
  /** 可选：覆盖该皮肤的形状（圆角/阴影）。不填则按 group 取默认 */
  shape?: Shape
  /** 卡片级配色覆盖（皮肤中心「自定义卡片颜色」）：只影响卡片背景/描边/文字，
   *  不改变全局 bg/ink 等语义。未设置的项回退当前皮肤的 surface / 透明 / 自动黑白。 */
  card?: { light?: CardTokens; dark?: CardTokens }
  light: Palette
  dark: Palette
}

/** 卡片配色覆盖 token：bg 必填（跟随主题时也需显式给 surface），border/text 可选。 */
export interface CardTokens {
  bg: string
  border?: string
  text?: string
}

/** 角色皮肤统一的「软萌」形状：圆角更大、阴影更散更淡 */
const SOFT_SHAPE: Shape = {
  'radius-card': '28px',
  'radius-sheet': '32px',
  'radius-btn': '18px',
  'radius-img': '20px',
  'shadow-soft': '0 8px 24px rgba(90, 110, 150, 0.10)',
  'shadow-card': '0 16px 40px rgba(90, 110, 150, 0.14)',
  'shadow-pill': '0 12px 34px rgba(90, 110, 150, 0.18)',
}

/** 撞色皮肤的「硬朗」形状：圆角收紧、阴影短而实，跟软萌组形成对照 */
const SHARP_SHAPE: Shape = {
  'radius-card': '14px',
  'radius-sheet': '18px',
  'radius-btn': '10px',
  'radius-img': '10px',
  'shadow-soft': '0 2px 8px rgba(20, 20, 30, 0.10)',
  'shadow-card': '0 4px 14px rgba(20, 20, 30, 0.16)',
  'shadow-pill': '0 6px 18px rgba(20, 20, 30, 0.20)',
}

/** 柠檬黄皮肤的「清新」形状：中等圆角（不过分可爱）+ 暖调轻阴影，现代不土 */
const LEMON_SHAPE: Shape = {
  'radius-card': '20px',
  'radius-sheet': '24px',
  'radius-btn': '14px',
  'radius-img': '16px',
  'shadow-soft': '0 6px 18px rgba(120, 100, 30, 0.08)',
  'shadow-card': '0 12px 30px rgba(120, 100, 30, 0.12)',
  'shadow-pill': '0 10px 26px rgba(120, 100, 30, 0.16)',
}

/** basic 皮肤的默认形状（与 index.css 初始值一致） */
const BASE_SHAPE: Shape = {
  'radius-card': '24px',
  'radius-sheet': '28px',
  'radius-btn': '16px',
  'radius-img': '16px',
  'shadow-soft': '0 6px 18px rgba(60, 42, 30, 0.08)',
  'shadow-card': '0 12px 32px rgba(60, 42, 30, 0.12)',
  'shadow-pill': '0 10px 30px rgba(60, 42, 30, 0.16)',
}

export const SKINS: Skin[] = [
  // ── 内置皮肤（含角色皮肤）────────────────────────────
  {
    id: 'sweetcool',
    name: '甜酷黑',
    group: 'basic',
    note: '甜酷粉 × 魔力黑 · 暗感炭黑搭艳玫粉',
    light: {
      bg: '#fdf0f4', surface: '#ffffff', 'surface-sunken': '#fbe0e8',
      primary: '#c92a6e', 'primary-soft': '#fce4ef', accent: '#8b3a5c', 'accent-soft': '#f5e0ea',
      highlight: '#e8659a', 'highlight-soft': '#fee8f0', ink: '#1f141c', 'ink-2': '#6b4a5a', 'ink-3': '#967486', line: '#f0dce4',
    },
    dark: {
      bg: '#373A3F', surface: '#414449', 'surface-sunken': '#2d3034',
      primary: '#E93F80', 'primary-soft': '#3d1e2c', accent: '#c72d68', 'accent-soft': '#2e1524',
      highlight: '#ff6ba6', 'highlight-soft': '#401e30', ink: '#f0ecef', 'ink-2': '#b5a0ab', 'ink-3': '#7d6b76', line: '#4a4d53',
    },
  },
  {
    id: 'blackgold',
    name: '黑黄经典',
    group: 'basic',
    note: '密黄 × 魔力黑 · 经典黑金质感',
    light: {
      bg: '#fdfbf0', surface: '#ffffff', 'surface-sunken': '#f9f3de',
      primary: '#b89a1e', 'primary-soft': '#faf3d0', accent: '#7a6320', 'accent-soft': '#f5edd8',
      highlight: '#e8be34', 'highlight-soft': '#fdf8dc', ink: '#1f1c14', 'ink-2': '#6b6044', 'ink-3': '#968c6a', line: '#ede8ce',
    },
    dark: {
      bg: '#373A3F', surface: '#414449', 'surface-sunken': '#2d3034',
      primary: '#F5D75F', 'primary-soft': '#3d3618', accent: '#c4aa2a', 'accent-soft': '#2e2810',
      highlight: '#ffe066', 'highlight-soft': '#403818', ink: '#f5f2e8', 'ink-2': '#b8ad88', 'ink-3': '#7e795a', line: '#4a4d53',
    },
  },
  {
    id: 'orangeblack',
    name: '热烈橙黑',
    group: 'basic',
    note: '热烈橙 × 魔力黑 · 活力暗调',
    light: {
      bg: '#fdf8f0', surface: '#ffffff', 'surface-sunken': '#faeece',
      primary: '#c46218', 'primary-soft': '#faedda', accent: '#8b4513', 'accent-soft': '#f5e2cc',
      highlight: '#e88830', 'highlight-soft': '#fdf0db', ink: '#1f1a12', 'ink-2': '#6b5838', 'ink-3': '#968262', line: '#ede4cc',
    },
    dark: {
      bg: '#373A3F', surface: '#414449', 'surface-sunken': '#2d3034',
      primary: '#EA6F29', 'primary-soft': '#3d2816', accent: '#c25a15', 'accent-soft': '#2e1a0c',
      highlight: '#ff8c3d', 'highlight-soft': '#402814', ink: '#f5f0e8', 'ink-2': '#b8a67a', 'ink-3': '#7e7554', line: '#4a4d53',
    },
  },
  {
    id: 'brightclash',
    name: '明亮撞色',
    group: 'clash',
    note: '明亮黄 · 青草绿 · 亮粉色 · 节日多色对撞',
    light: {
      bg: '#fefefa', surface: '#ffffff', 'surface-sunken': '#f8f7e8',
      primary: '#FCDF35', 'primary-soft': '#fcf8d8', accent: '#87CC62', 'accent-soft': '#ecf5e6',
      highlight: '#FC6BAD', 'highlight-soft': '#fce8f4', ink: '#1f1e16', 'ink-2': '#6b6a52', 'ink-3': '#96947a', line: '#eeecc8',
    },
    dark: {
      bg: '#1a1c16', surface: '#262820', 'surface-sunken': '#12140e',
      primary: '#f0d43a', 'primary-soft': '#33301a', accent: '#7ab856', 'accent-soft': '#1e3016',
      highlight: '#f05fa0', 'highlight-soft': '#331e2a', ink: '#f2efe4', 'ink-2': '#a8a480', 'ink-3': '#747458', line: '#30322a',
    },
  },
  {
    id: 'cat',
    name: '奶喵喵',
    group: 'character',
    motif: 'paw',
    note: '薄荷绿 × 天空蓝 × 樱花粉 × 云朵白 · 软萌奶喵系（原创小猫主视觉）',
    version: 2,
    light: {
      bg: '#F2FAF6', surface: '#FFFFFF', 'surface-sunken': '#E8F4EF',
      primary: '#54B98A', 'primary-soft': '#DCF3EA', accent: '#5BA8E0', 'accent-soft': '#E3F1FB',
      highlight: '#FF8FB3', 'highlight-soft': '#FDE3EE', ink: '#28403A', 'ink-2': '#5E6F68', 'ink-3': '#8A9A93', line: '#E0EFE8',
    },
    dark: {
      bg: '#16201C', surface: '#1F2A25', 'surface-sunken': '#121A16',
      primary: '#6FCF9F', 'primary-soft': '#1E3329', accent: '#6FB6E8', 'accent-soft': '#192A38',
      highlight: '#FF9BC4', 'highlight-soft': '#33222E', ink: '#EDF5F0', 'ink-2': '#AEC2B8', 'ink-3': '#7E9388', line: '#26332C',
    },
  },
  {
    id: 'lemon',
    name: '柠檬黄',
    group: 'character',
    motif: 'spark',
    note: '明亮柠檬黄 × 抽象星芒光点 · 大面积柠檬黄主题（无水果形象）',
    version: 2,
    shape: LEMON_SHAPE,
    light: {
      bg: '#FFF6C8', surface: '#FFFDF6', 'surface-sunken': '#FFEF9E',
      primary: '#E6B400', 'primary-soft': '#FFF3B0', accent: '#74C69D', 'accent-soft': '#E6F4EC',
      highlight: '#FFD400', 'highlight-soft': '#FFF6CC', ink: '#3A3410', 'ink-2': '#6E6530', 'ink-3': '#9A8F50', line: '#F0E2A0',
    },
    dark: {
      bg: '#1A1606', surface: '#26210E', 'surface-sunken': '#13110A',
      primary: '#F2C200', 'primary-soft': '#332C0E', accent: '#74C69D', 'accent-soft': '#16291F',
      highlight: '#FFD400', 'highlight-soft': '#332C0E', ink: '#FAF3D6', 'ink-2': '#C9BD8C', 'ink-3': '#8E8260', line: '#322C16',
    },
  },
]

const TOKENS: (keyof Palette)[] = [
  'bg', 'surface', 'surface-sunken', 'primary', 'primary-soft', 'accent', 'accent-soft',
  'highlight', 'highlight-soft', 'ink', 'ink-2', 'ink-3', 'line',
]

const SHAPE_TOKENS: (keyof Shape)[] = [
  'radius-card', 'radius-sheet', 'radius-btn', 'radius-img',
  'shadow-soft', 'shadow-card', 'shadow-pill',
]

/** 皮肤注册表（运行时由服务注入，localStorage 持久化）。
 *  分两套：CUSTOM_REGISTRY（用户自建主题）+ PRESET_REGISTRY（出厂内置皮肤的本地可编辑副本）。
 *  启动时分别由 loadCustomSkins / loadPresetSkins 注入；getSkin 统一解析。
 *  解析优先级：预设覆盖 → 自定义 → SKINS 代码常量兜底，保证用户对内置皮肤的编辑优先生效。 */
const CUSTOM_REGISTRY = new Map<string, Skin>()
const PRESET_REGISTRY = new Map<string, Skin>()
/** 用持久化的自定义皮肤列表整体重建注册表（load / delete 时调用） */
export function setCustomSkins(list: Skin[]) {
  CUSTOM_REGISTRY.clear()
  for (const s of list) CUSTOM_REGISTRY.set(s.id, s)
}
/** 注册单个自定义皮肤（save 时调用） */
export function registerCustomSkin(s: Skin) {
  CUSTOM_REGISTRY.set(s.id, s)
}
/** 用持久化的预设皮肤列表整体重建注册表（load / save / delete / reset 时调用） */
export function setPresetSkins(list: Skin[]) {
  PRESET_REGISTRY.clear()
  for (const s of list) PRESET_REGISTRY.set(s.id, s)
}
/** 注册单个预设皮肤（save 时调用） */
export function registerPresetSkin(s: Skin) {
  PRESET_REGISTRY.set(s.id, s)
}

export const getSkin = (id: string): Skin =>
  PRESET_REGISTRY.get(id) ?? CUSTOM_REGISTRY.get(id) ?? SKINS.find((s) => s.id === id) ?? SKINS[0]

export function applySkin(skinId: string, mode: 'light' | 'dark') {
  const skin = getSkin(skinId)
  applySkinTo(skin, mode)
}

/** 直接套用一个 Skin 对象（用于实时预览自定义皮肤，无需先注册到注册表） */
export function applySkinTo(skin: Skin, mode: 'light' | 'dark') {
  const p = mode === 'dark' ? skin.dark : skin.light
  const shape =
    skin.shape ??
    (skin.group === 'character' ? SOFT_SHAPE : skin.group === 'clash' ? SHARP_SHAPE : BASE_SHAPE)
  const root = document.documentElement

  for (const t of TOKENS) root.style.setProperty(`--color-${t}`, p[t])
  for (const t of SHAPE_TOKENS) root.style.setProperty(`--${t}`, shape[t])

  // 所见即所得：主色/强调/高亮按钮的文字色，按各自底色亮度自动选黑或白，保证可读
  // （自定义皮肤现在直接用用户原色，亮底必须配深色字才不会糊；内置皮肤也一并受益）
  const pickOn = (hex: string) => (hexToHsl(hex).l > 0.62 ? '#1a1a1a' : '#ffffff')
  root.style.setProperty('--on-primary', pickOn(p.primary))
  root.style.setProperty('--on-accent', pickOn(p.accent))
  root.style.setProperty('--on-highlight', pickOn(p.highlight))

  // 卡片级配色覆盖（皮肤中心「自定义卡片颜色」）：
  // 背景默认回退 surface；描边默认透明（不显示）；文字默认按卡片背景亮度自动黑白保证可读。
  const cardTok = skin.card?.[mode === 'dark' ? 'dark' : 'light'] ?? skin.card?.light
  const cardBg = cardTok?.bg ?? p.surface
  root.style.setProperty('--card-bg', cardBg)
  root.style.setProperty('--card-border', cardTok?.border ?? 'transparent')
  root.style.setProperty('--card-text', cardTok?.text ?? pickOn(cardBg))

  root.setAttribute('data-theme', skin.id)
  root.setAttribute('data-mode', mode)
  // 供 CSS / 测试判断当前是否角色皮肤
  if (skin.motif) root.setAttribute('data-motif', skin.motif)
  else root.removeAttribute('data-motif')

  // 让 iOS 状态栏（PWA）/ 浏览器地址栏颜色与 App 页面底色始终一致：
  //  - theme-color 控制 Android/浏览器地址栏底色，动态同步为当前皮肤底色 bg；
  //  - iOS 用 black-translucent 半透明叠加方案：状态栏透明，App 背景色（html/body/#root 的 bg-bg）自然透出，
  //    因而不依赖 theme-color（iOS Safari 不支持动态改它），切换深浅/自定义主题即跟随变化。
  //  二者都在 applySkin 内统一更新，换肤/切深浅不漏。
  // iOS 半透明状态栏透出的是 html 背景色，故把 documentElement 背景同步为当前主题 bg，
  // 保证状态栏区域（含页面边缘缝隙）露出的就是主题底色，与页面无缝贴合。
  root.style.backgroundColor = p.bg
  syncStatusChrome(p.bg)
}

/** 捕获设备真实安全区顶高，供 black-translucent 模式兜底。
 *  背景：apple-mobile-web-app-status-bar-style=black-translucent 会令
 *  env(safe-area-inset-top) 归零（内容可延伸到状态栏后面），若不兜底，
 *  所有 calc(var(--safe-top)+…) 会塌成仅 12px，标题被状态栏压住、状态栏与页面背景割裂。
 *  ① 先直接探测 env（非 translucent 场景 / 浏览器模式能读到真实值）；
 *  ② 归零则按屏幕逻辑尺寸推断真实安全区顶：灵动岛系（14/15/16 及 Pro）≈59pt，
 *     刘海系（X~13）≈47pt，老机型（SE/8 及更早）≈20pt。
 *     宁高勿低——顶部是主题底色，多留只是背景延伸、无割裂；少了才会露馅。
 *     当前用户机型 iPhone 14 Pro（393×852pt）→ 59px。缓存一次即可，避免反复探测。 */
let SAFE_TOP_FLOOR = ''
function captureSafeTopFloor(): string {
  if (SAFE_TOP_FLOOR) return SAFE_TOP_FLOOR
  // ① 直接探测 env(safe-area-inset-top)（浏览器模式 / 非 translucent 时有效）
  try {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px)'
    document.body.appendChild(probe)
    const v = getComputedStyle(probe).paddingTop
    document.body.removeChild(probe)
    const n = parseFloat(v)
    if (n > 0) {
      SAFE_TOP_FLOOR = v
      return v
    }
  } catch {
    /* fallthrough */
  }
  // ② env 归零（black-translucent 生效中）→ 按屏幕逻辑尺寸推断
  try {
    const dpr = window.devicePixelRatio || 1
    const w = window.screen?.width ? window.screen.width / dpr : 0
    const h = window.screen?.height ? window.screen.height / dpr : 0
    if ((w >= 390 && w <= 404 && h >= 844) || h >= 850) {
      SAFE_TOP_FLOOR = '59px' // 灵动岛系（14 Pro 393×852 / 14 390×844 / 15 Pro 402×874 / Pro Max 高屏等）
    } else if (h >= 812) {
      SAFE_TOP_FLOOR = '47px' // 刘海系（iPhone X~13 等）
    } else if (h >= 650) {
      SAFE_TOP_FLOOR = '20px' // 老全面屏 / SE 系列
    } else {
      SAFE_TOP_FLOOR = '47px'
    }
  } catch {
    SAFE_TOP_FLOOR = '47px'
  }
  return SAFE_TOP_FLOOR
}

/** 动态更新 viewport 顶栏相关 meta（不存在则创建）。避免使用弃用 API，直接操作 <meta>。 */
function syncStatusChrome(bg: string) {
  const root = document.documentElement
  const setMeta = (name: string, content: string) => {
    // 优先用带 id 的 meta（index.html 中 theme-color 已加 id="theme-color-meta"），
    // 更精准、避免命中其它同名标签；缺失时回退到 name 选择器，再缺失则创建。
    let el =
      (document.getElementById('theme-color-meta') as HTMLMetaElement | null) ??
      document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
    if (!el) {
      el = document.createElement('meta')
      el.name = name
      document.head.appendChild(el)
    }
    if (el.content !== content) el.content = content
  }
  // Android / 浏览器：theme-color 直接控制地址栏/状态栏底色，跟随页面底色 bg。
  setMeta('theme-color', bg)
  // iOS：统一用 black-translucent 半透明叠加——状态栏透明，App 背景色（html/body/#root 的 bg-bg）自然透出，
  // 因此「状态栏颜色 = html 背景 = 当前主题 bg」，切换深浅/自定义主题即跟随变化
  // （iOS Safari 不支持动态改 theme-color，故放弃该方案改用叠加）。
  setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
  // black-translucent 会让 env(safe-area-inset-top) 归零；非 PWA/桌面模式下 env 才是真实安全区。
  // 故仅在「已加到主屏幕的 PWA（standalone）」模式下用真实安全区高度兜底（避免内容被状态栏压住），
  // 普通浏览器里用 env 动态值（已正确反映刘海/灵动岛安全区），避免无谓的顶部留白。
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const standalone =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true)
  root.style.setProperty(
    '--safe-top',
    standalone ? captureSafeTopFloor() : 'env(safe-area-inset-top, 0px)',
  )
}

// ── 自定义主题：从一个主色自动派生整套语义配色 ──────────────────
// 设计取舍（详见需求「对比度风险」）：
//   primary / accent 一律压到「可读深度」——浅色模式下白字按钮清晰（对比度足够）；
//   用户选的鲜艳原色作为 highlight + 各处柔色 tint 呈现，主题气质明确是「你的颜色」，
//   又不会让任何按钮变盲。深色模式下主色用鲜艳原色（深色底上深色文字同样清晰）。

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const light = (max + min) / 2
  let hue = 0
  let sat = 0
  const d = max - min
  if (d !== 0) {
    sat = light > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        hue = (b - r) / d + 2
        break
      default:
        hue = (r - g) / d + 4
    }
    hue /= 6
  }
  return { h: hue * 360, s: sat, l: light }
}

function hslToHex(h: number, s: number, l: number): string {
  h = (((h % 360) + 360) % 360) / 360
  s = clamp(s, 0, 1)
  l = clamp(l, 0, 1)
  if (s === 0) {
    const v = Math.round(l * 255)
      .toString(16)
      .padStart(2, '0')
    return `#${v}${v}${v}`
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const pp = 2 * l - q
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return pp + (q - pp) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6
    return pp
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(hue2rgb(h + 1 / 3))}${toHex(hue2rgb(h))}${toHex(hue2rgb(h - 1 / 3))}`
}

/** 给一个色相/饱和度/亮度生成十六进制（便捷封装） */
const c = (h: number, s: number, l: number) => hslToHex(h, s, l)

/** 自定义主题输入：主色 / 背景 / 强调 三个锚点 + 可选卡片配色覆盖，均可独立指定。
 *  任一未指定时回退到主色，保证单色创建仍可用、且向后兼容旧调用。 */
export interface CustomThemeInput {
  primary?: string // 主色锚点（按钮 / 高亮点缀）
  bg?: string // 背景锚点（页面底色 / 文字色基调）
  accent?: string // 强调色锚点（accent）
  /** 卡片级配色覆盖（浅/深同套；迭代 1 暂不单独维护深色卡片配色） */
  card?: CardTokens
}

/** 规范化 hex（支持 3/6 位），非法返回回退色 */
function safeHex(v?: string, fb = '#d9613c'): string {
  const h = (v ?? '').trim()
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) {
    return h.length === 4 ? '#' + h.slice(1).split('').map((c) => c + c).join('') : h
  }
  return fb
}

/** 由主色 + 背景 + 强调 三个锚点生成一套完整皮肤（含浅色/深色两套语义 token）。
 *  三个锚点各自独立派生对应维度的语义色，互不影响；
 *  surface / 各 soft 底 / ink / line 等仍由算法围绕锚点派生，保证对比度与可读性安全。
 *  兼容旧调用：传入 string（单主色）视为 primary。 */
export function buildCustomSkin(
  name: string,
  input?: CustomThemeInput | string,
  id?: string,
): Skin {
  const raw: CustomThemeInput = typeof input === 'string' ? { primary: input } : input ?? {}
  const pHex = safeHex(raw.primary)
  const bHex = safeHex(raw.bg, pHex)
  const aHex = safeHex(raw.accent, pHex)

  const p = hexToHsl(pHex)
  const b = hexToHsl(bHex)
  const a = hexToHsl(aHex)

  // 所见即所得：主色/强调直接用用户原色（不再压暗/冲淡）；背景直接用用户背景锚点；
  // 文字色（ink / 按钮 on-*）随底色亮度自动黑白，由 applySkinTo 写入 --on-* 保证可读。
  const isLightBg = b.l > 0.55
  const light: Palette = {
    bg: bHex,
    surface: c(b.h, Math.max(b.s, 0.05), Math.min(b.l + 0.05, 0.985)),
    'surface-sunken': c(b.h, Math.max(b.s, 0.05), Math.max(b.l - 0.03, 0.04)),
    primary: pHex,
    'primary-soft': c(p.h, Math.max(p.s, 0.5), Math.min(Math.max(p.l + 0.3, 0.9), 0.97)),
    accent: aHex,
    'accent-soft': c(a.h, Math.max(a.s, 0.45), Math.min(Math.max(a.l + 0.3, 0.9), 0.97)),
    highlight: c(p.h, Math.max(p.s, 0.7), Math.min(Math.max(p.l + 0.12, 0.56), 0.74)),
    'highlight-soft': c(p.h, Math.max(p.s, 0.6), 0.9),
    ink: c(b.h, 0.1, isLightBg ? 0.14 : 0.92),
    'ink-2': c(b.h, 0.08, isLightBg ? 0.42 : 0.7),
    'ink-3': c(b.h, 0.06, isLightBg ? 0.62 : 0.5),
    line: c(b.h, 0.15, isLightBg ? 0.86 : 0.28),
  }
  // 深色：主色/强调直接用用户原色（on-* 自动保证按钮文字可读）；背景按用户色相压深成深色底
  const dark: Palette = {
    bg: c(b.h, 0.18, 0.09),
    surface: c(b.h, 0.15, 0.14),
    'surface-sunken': c(b.h, 0.2, 0.07),
    primary: pHex,
    'primary-soft': c(p.h, 0.45, 0.22),
    accent: aHex,
    'accent-soft': c(a.h, 0.4, 0.2),
    highlight: c(p.h, Math.max(p.s, 0.8), Math.max(p.l, 0.62)),
    'highlight-soft': c(p.h, Math.max(p.s, 0.6), 0.24),
    ink: c(b.h, 0.1, 0.95),
    'ink-2': c(b.h, 0.08, 0.7),
    'ink-3': c(b.h, 0.06, 0.5),
    line: c(b.h, 0.14, 0.26),
  }
  return {
    id: id ?? `custom-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    name: name.trim() || '我的主题',
    group: 'custom',
    light,
    dark,
    ...(raw.card ? { card: { light: raw.card, dark: raw.card } } : {}),
  }
}
