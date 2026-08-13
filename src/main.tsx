import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { loadCustomSkins } from './services/customSkins'
import { loadPresetSkins } from './services/skinPresets'
import { ensureCheckinMigrated } from './services/checkin'
import { applySkin } from './theme/skins'
import { useSettingsStore } from './stores/useSettingsStore'
import { useAppStore } from './stores/useAppStore'
import './app/styles/index.css'

// 全局错误兜底：把【本应用自身代码】的运行时崩溃显示为可见文字，避免「白屏无信息」难以排查。
// 关键：本应用部署在 CloudStudio 沙箱，平台会向页面注入腾讯 Beacon 等【第三方跨域脚本】；
// 这类脚本抛错会被浏览器脱敏为 "Script error."（无堆栈）。它不属于本应用逻辑，
// 若当成「页面崩溃」渲染成红色错误卡，会出现「点分享就报 Script error.」之类的误报。
// 故：仅当错误确实来自本应用（非跨域脱敏、带真实信息）时才渲染崩溃卡；跨域脱敏错误只记录不阻断。
function isCrossOriginSanitized(e: any): boolean {
  const msg = e?.message || ''
  // 跨域脚本错误被脱敏为 "Script error." 且无 error 对象
  if ((msg === 'Script error.' || msg === 'Script error') && !e?.error) return true
  // 来自第三方域名（非当前页 origin、也非同源相对路径/blob）的脚本错误
  const f = e?.filename
  if (f && !f.startsWith(location.origin) && !f.startsWith('/') && !f.startsWith('blob:') && !f.startsWith('data:')) {
    return true
  }
  return false
}

function showFatal(detail: string) {
  console.error('[Titia fatal]', detail)
  const el = document.getElementById('root')
  if (el && !el.dataset.fatal) {
    el.dataset.fatal = '1'
    el.innerHTML =
      '<div style="padding:24px;font-family:system-ui;color:#b00;line-height:1.6">' +
      '<h2 style="margin:0 0 8px">页面加载出错</h2>' +
      '<pre style="white-space:pre-wrap;word-break:break-word;font-size:13px">' +
      detail.replace(/</g, '&lt;') +
      '</pre></div>'
  }
}

window.addEventListener('error', (e: any) => {
  if (isCrossOriginSanitized(e)) {
    // 第三方跨域脚本（如平台注入的 Beacon 统计）报错：与本应用无关，仅记录、不阻断 UI。
    console.warn('[Titia] 忽略第三方跨域脚本错误（非本应用逻辑）：', e?.message, e?.filename)
    return
  }
  const stack = e?.error?.stack
  const where = e?.filename ? `${e.filename}:${e?.lineno ?? '?'}:${e?.colno ?? '?'}` : ''
  const detail = (e?.message || String(e)) + (where ? `\n@ ${where}` : '') + (stack ? `\n\n${stack}` : '')
  showFatal(detail)
})

window.addEventListener('unhandledrejection', (e: any) => {
  const reason = e?.reason
  const stack = reason?.stack
  const detail = 'Promise rejected: ' + (reason?.message || reason) + (stack ? `\n\n${stack}` : '')
  showFatal(detail)
})

// PWA：注册并保留 Service Worker（支持 Web Push + 防白屏）。
// 背景：本项目现采用 no-op SW（src/sw.js）——不 precache、不注册 fetch、不在 activate 里 navigate，
// 所有请求走纯 network，从根本上杜绝「覆盖式部署 + SW cache-first」旧缓存白屏死锁。
// 配合 start_url 戳 + manifest 戳，每次发版用户重装即可脱离旧缓存（iOS 按 start_url 标识 web clip）。
// 因此不再注销 SW，而是注册并保留它，以便 Web Push 能在 App 关闭时由后台 SW 接收推送。
// 数据存 IndexedDB，独立于 SW 缓存，注册/更新 SW 不掉数据。
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  const onReady = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
  if (document.readyState === 'complete') onReady()
  else window.addEventListener('load', onReady, { once: true })
}

registerServiceWorker()

// 启动前先加载自定义主题（IndexedDB），保证 App 首次 applySkin 能解析自定义 skin id。
// 但首屏渲染绝不能硬卡在 IndexedDB 读取上：隐私模式 / IDB 损坏 / 并发锁等环境下，
// 该读取可能长时间 pending 或 reject，若串行 await 会导致永久白屏「打不开」。
// 故加 2.5s 超时兜底：超时先用预设皮肤渲染，自定义皮肤加载完成后再补 applySkin 一次。
function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

async function boot() {
  // 启动早期触发打卡迁移 / 一次性基线种子（不阻塞首屏）
  void ensureCheckinMigrated().catch(() => {})
  let rendered = false
  const finish = () => {
    if (rendered) {
      // 已超时先行渲染：此刻自定义皮肤已就绪，补应用一次（App 的 skin effect 不订阅注册表）
      try {
        applySkin(useSettingsStore.getState().skin, useAppStore.getState().mode)
      } catch {
        /* 忽略 */
      }
      return
    }
    rendered = true
    renderApp()
  }

  const timer = setTimeout(finish, 2500)
  try {
    await loadCustomSkins()
  } catch {
    /* 忽略：自定义主题加载失败时不影响 App 其余功能 */
  }
  try {
    await loadPresetSkins()
  } catch {
    /* 忽略：预设皮肤加载失败时回退 SKINS 代码常量 */
  }
  // 启动早期同步应用主题快照（若存在）：强制刷新前 forceAppUpdate 已把当前 skin+mode
  // 写入 localStorage('titia.theme')。此处赶在 React 首帧前 applySkin，做到「重载首帧即恢复主题」，
  // 杜绝默认主题闪白与「变回默认」观感。自定义/预设皮肤注册表已在上方加载完毕，可正确解析。
  try {
    const snap = JSON.parse(localStorage.getItem('titia.theme') || 'null')
    if (snap && snap.skin) applySkin(snap.skin, snap.mode === 'dark' ? 'dark' : 'light')
  } catch {
    /* 忽略：快照缺失/损坏时交给 App 的 skin effect 异步恢复 */
  }
  clearTimeout(timer)
  finish()
}
boot()
