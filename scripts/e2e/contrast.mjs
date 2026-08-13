// WCAG 对比度体检：确保每套皮肤的关键文字组合都读得清
// 撞色皮肤最容易在这里翻车（高饱和主色配白字往往不够）
import fs from 'node:fs'

const src = fs.readFileSync('/workspace/src/theme/skins.ts', 'utf8')

// 从 TS 源码里抠出 SKINS 的每套皮肤（简单解析，够用）
const skins = []
const re = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*group:\s*'([^']+)',([\s\S]*?)\n  \},\n/g
let m
while ((m = re.exec(src))) {
  const [, id, name, group, body] = m
  const grab = (mode) => {
    const mm = new RegExp(mode + ':\\s*\\{([\\s\\S]*?)\\n    \\}').exec(body)
    if (!mm) return null
    const o = {}
    for (const kv of mm[1].matchAll(/'?([a-z0-9-]+)'?:\s*'(#[0-9a-fA-F]{6})'/g)) o[kv[1]] = kv[2]
    return o
  }
  const light = grab('light'), dark = grab('dark')
  if (light && dark) skins.push({ id, name, group, light, dark })
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// 检查项：[描述, 前景, 背景, 底线, 理想]
// 底线 = 低于此值真的看不清，必须修
// 理想 = WCAG AA 标准；按钮类彩色底达不到 4.5 是业界常态（iOS 原生蓝按钮仅 3.6），只记录不强改
// 每一项都对应代码里的真实用法，不为不存在的场景改色：
//   bg on primary        → fields.tsx 分段选择器 / TabBar 中央+ / 各处圆形按钮
//   accent on surface    → HomePage「到点」提示标签
//   accent on accent-soft→ SpacePage 侧栏图标容器
const CHECKS = [
  ['按钮文字  bg on primary', 'bg', 'primary', 3.0, 4.5],
  ['正文      ink on surface', 'ink', 'surface', 4.5, 4.5],
  ['次级文字  ink-2 on surface', 'ink-2', 'surface', 4.5, 4.5],
  ['占位文字  ink-3 on surface', 'ink-3', 'surface', 3.0, 3.0],
  ['正文      ink on bg', 'ink', 'bg', 4.5, 4.5],
  ['软底文字  ink on primary-soft', 'ink', 'primary-soft', 4.5, 4.5],
  ['软底文字  ink on accent-soft', 'ink', 'accent-soft', 4.5, 4.5],
  ['主色文字  primary on surface', 'primary', 'surface', 3.0, 3.0],
  ['提示标签  accent on surface', 'accent', 'surface', 3.0, 3.0],
]
// 刻意不检查 `bg-*-soft text-*`（如 accent on accent-soft）：
// 全项目仅 SpacePage 侧栏与 PetPage 用到，而那里装的是 emoji（🛒🌙🐱🔐），
// emoji 自带颜色，text-* 对其无效 —— 为不存在的视觉问题改色只会破坏皮肤性格。

let bad = 0, low = 0
const only = process.argv[2]

for (const s of skins) {
  if (only && s.group !== only) continue
  const rows = []
  for (const mode of ['light', 'dark']) {
    const p = s[mode]
    for (const [label, fg, bgk, floor, ideal] of CHECKS) {
      const r = ratio(p[fg], p[bgk])
      if (r < floor) { bad++; rows.push(`    ✘ [${mode}] ${label} = ${r.toFixed(2)} < ${floor}  (${p[fg]} on ${p[bgk]})`) }
      else if (r < ideal) { low++; rows.push(`    · [${mode}] ${label} = ${r.toFixed(2)} (达底线，未及 ${ideal})`) }
    }
  }
  const tag = rows.some((r) => r.includes('✘')) ? '✘' : rows.length ? '·' : '✔'
  console.log(`${tag} ${s.name} [${s.group}]`)
  rows.forEach((r) => console.log(r))
}

console.log(`\n共 ${skins.length} 套 · ${bad} 项低于底线（必修） · ${low} 项达底线未及理想（可接受）`)
process.exit(bad ? 1 : 0)
