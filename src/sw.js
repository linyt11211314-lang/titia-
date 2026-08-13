/// <reference lib="webworker" />
// Titia SW（抗 CloudStudio 网关 400 白屏版）
// 设计要点：
//  · 预缓存 index.html 与所有带内容哈希的 JS/CSS/图标（来自 VitePWA injectManifest 注入的 __WB_MANIFEST）。
//  · 页面导航（mode==='navigate'）采用 network-first：
//      - 在线时永远向网关请求最新 HTML → 新版本即时生效，从根本避免「覆盖式部署 + cache-first」旧缓存白屏死锁；
//      - 仅当网络失败 / 网关返回 400 / 离线时，回退到已预缓存的 index.html，使已访问过的老用户仍能打开 App。
//  · 静态资源（带哈希文件名）cache-first：文件名随内容变化，不会命中旧版本，安全。
//  · 不缓存跨域请求（统计/字体等），不碰 IndexedDB 业务数据。
//  · 保留 skipWaiting + clients.claim，新版本尽快生效。
// 说明：self.__WB_MANIFEST 是 VitePWA injectManifest 的注入锚点，构建时被替换为预缓存清单；
// 下方 self.__TITIA_SW_ANCHOR__ 赋值确保该锚点不被 tree-shake 删除。
self.__TITIA_SW_ANCHOR__ = self.__WB_MANIFEST

const PRECACHE = 'titia-precache-v1'
const PAGE_CACHE = 'titia-pages-v1'

function manifestUrls() {
  // 使用顶部注入锚点变量（保证源文件中 self.__WB_MANIFEST 仅出现一次，满足 injectManifest 要求）。
  const m = self.__TITIA_SW_ANCHOR__ || []
  return m.map((e) => (typeof e === 'string' ? e : e.url)).filter(Boolean)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE)
      const urls = manifestUrls()
      // 逐个缓存：单个资源 404 不阻断整体安装（容错），避免某资源缺失导致 SW 装不上而失去离线能力。
      await Promise.all(
        urls.map((u) =>
          cache.add(u).catch((err) => {
            console.warn('[Titia SW] precache 跳过:', u, err)
          }),
        ),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清理旧版本缓存（仅保留当前 PRECACHE / PAGE_CACHE），避免磁盘无限增长与旧资源残留。
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k !== PRECACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 只处理同源请求；跨域（第三方统计/字体等）走浏览器默认策略，不缓存、不拦截。
  if (url.origin !== self.location.origin) return

  // —— 页面导航：network-first + 缓存回退 ——
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          // 仅成功（2xx）才缓存并直接返回；网关 400 / 5xx 等错误响应不缓存、不返回，
          // 直接落到下方 catch 回退到预缓存的 index.html（抗网关 400 白屏的关键）。
          if (res && res.status === 200) {
            const c = await caches.open(PAGE_CACHE)
            c.put(req, res.clone()).catch(() => {})
            return res
          }
          // 非成功响应（含网关 400）/ 网络错误 → 抛出，由 catch 回退缓存。
          throw new Error('bad status ' + (res ? res.status : 'network'))
        } catch (err) {
          // 离线 / 网关 400 / 网络错误 → 回退到预缓存的 index.html（与当前 JS/CSS 同源同版本，不会错配）。
          const cached = (await caches.match('index.html')) || (await caches.match(req))
          return cached || Response.error()
        }
      })(),
    )
    return
  }

  // —— 静态资源：cache-first，缺失再走网络并补缓存 ——
  event.respondWith(
    (async () => {
      const cached = await caches.match(req)
      if (cached) return cached
      try {
        const res = await fetch(req)
        if (res && res.status === 200) {
          const c = await caches.open(PRECACHE)
          c.put(req, res.clone()).catch(() => {})
        }
        return res || Response.error()
      } catch {
        return Response.error()
      }
    })(),
  )
})
