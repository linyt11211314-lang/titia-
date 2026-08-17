import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Titia 时序 · 构建配置（含阶段六 PWA）
// hash 路由、移动端优先、dev 环境挂 393×852 手机框、PWA 离线可用。
// BASE_PATH：部署到子路径时通过环境变量注入（如 GitHub Pages 项目页 /<repo>/）。
// 默认 '/'，保持 70c149 根路径部署行为不变。SW 预缓存清单为相对 URL，会按 SW 作用域解析，
// 因此子路径下也能正确命中，只需这里给出正确的资源 base 即可。
const BASE_PATH = process.env.BASE_PATH || '/'

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 覆盖式静态部署（每次覆盖 sandbox）与 SW cache-first 冲突会导致旧缓存白屏死锁；
      // 改用 injectManifest + 自写 no-op SW（src/sw.ts）：安装即 skipWaiting、activate 即 clients.claim，
      // 不注册 fetch / 不 precache / 不在 activate 里 navigate——彻底消除 cache-first 白屏与 navigate 加载错误，
      // 同时保留 manifest（可加到主屏幕）。注册/注销由 main.tsx 的 purgeServiceWorkers 处理。
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: null,
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Titia 时序',
        short_name: 'Titia',
        description: '个人生活时间轴 · 记录每一个痕迹',
        lang: 'zh-CN',
        orientation: 'portrait',
        // 与默认皮肤（warm 浅色）页面底色 #faf6ef 对齐，避免启动/开屏闪白或与首屏底色割裂。
        theme_color: '#faf6ef',
        background_color: '#faf6ef',
        display: 'standalone',
        // 版本戳 start_url：每次发版改戳 → iOS 把重装视为全新 web clip，
        // 不继承旧缓存（iOS 按 start_url 标识 web clip，同 URL 删装可能复用旧缓存）。
        // 应用用 hash 路由，query 被忽略，不影响路由。
        // start_url 含 base 前缀，确保子路径部署（GitHub Pages /<repo>/）下 PWA 安装入口正确。
        start_url: BASE_PATH + '?v=20260817c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
  },
})
