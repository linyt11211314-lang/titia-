// Titia 时序 · 构建后处理
// 问题：vite-plugin-pwa 在构建时会向 dist/index.html 注入一条无版本戳的
// `<link rel="manifest" href="/manifest.webmanifest">`，与源模板里那条带戳的
// `?v=...` 链接重复。浏览器以最后一条为准 → 无戳链接生效 → iOS 缓存破除失效。
// 本脚本删除这条无戳重复链接，只保留带戳的那条。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const target = resolve(__dirname, '..', 'dist', 'index.html')

const html = readFileSync(target, 'utf-8')
// 匹配：前面有空白、紧跟 </head> 的裸 manifest 链接（PWA 注入的无戳版）。
// 兼容子路径部署：注入的 href 可能是 /titia-/manifest.webmanifest 等形式，故前缀用 [^"]* 通配。
// 仅移除「无 ?v= 戳」的注入链接，保留源模板里那条带戳的相对链接（相对路径在任意 base 下都能正确解析）。
const cleaned = html.replace(/\s*<link rel="manifest" href="\/[^"]*manifest\.webmanifest">\s*<\/head>/, '</head>')

if (cleaned !== html) {
  writeFileSync(target, cleaned, 'utf-8')
  console.log('[postbuild] 已移除 PWA 注入的无戳 manifest 重复链接')
} else {
  console.log('[postbuild] 未发现重复 manifest 链接，跳过')
}
