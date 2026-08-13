import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useRecordStore } from '../stores/useRecordStore'
import { usePetStore } from '../stores/usePetStore'
import { useTodoStore } from '../stores/useTodoStore'
import { useDiaryStore } from '../stores/useDiaryStore'
import { useMomentsStore } from '../stores/useMomentsStore'
import { useSparkStore } from '../stores/useSparkStore'
import { useFinanceStore } from '../stores/useFinanceStore'
import { useCycleStore } from '../stores/useCycleStore'
import { useShoppingStore } from '../stores/useShoppingStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { useCountdownStore } from '../stores/useCountdownStore'
import { useBookStore } from '../stores/useBookStore'
import { useAccountStore } from '../stores/useAccountStore'
import { useCategoryStore } from '../stores/useCategoryStore'
import { useBudgetStore } from '../stores/useBudgetStore'
import { mergePendingBills } from './dataService'

// Titia 时序 · 全局刷新服务（下拉刷新用）
// 重载全部 store + 合并跨容器待同步账单（经 DataService 统一数据层）。
// 幂等：任何页面下拉刷新都触发同一份数据重载。
//
// 跨容器桥（iOS PWA/Safari 存储可能分离）：
// 快捷方式经 Safari 保存账单时经 DataService 写入 localStorage('titia.pendingTx')；
// 若 iOS 两容器共享 localStorage，PWA 打开/下拉刷新时在此合并（按 id 去重）→ 数据互通。
// 云同步：当前阶段本地存储优先（不接 Supabase/后端/云端接口），未来需要时再单独接入。

/** 合并跨容器桥上的待同步账单（按 id 去重，静默失败；有合并则刷新小账内存，保证本次会话立即可见） */
export async function mergePendingTx(): Promise<void> {
  try {
    const n = await mergePendingBills()
    if (n > 0) await useBookStore.getState().load()
  } catch {
    /* 静默：解析/写入失败不阻塞 */
  }
}

// ── 跨容器自动刷新（UI 刷新机制，不改动同步架构） ──
// iOS 上 Safari 与 PWA 共享 localStorage（桥），但 IndexedDB 可能隔离：
//   - storage 事件：同源其他容器写入桥（如 Safari 保存新账单）→ 自动合并 + 重读；
//   - visibilitychange / focus：PWA 从后台回到前台 → 自动重新读取 IndexedDB。
// 桌面浏览器 IndexedDB 同源共享，storage/focus 触发时数据可能已直接可见——
// 因此统一走 reloadAll（合并桥 + 全量重读），保证两容器数据与 UI 一致。
const PENDING_TX_KEY = 'titia.pendingTx'

let watchTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 注册跨容器同步监听（App 启动时挂载，返回清理函数）。
 * 收到任一信号 → reloadAll() 自动重读 IndexedDB；轻量防抖避免连续触发重复刷新。
 */
export function watchCrossContainerSync(): () => void {
  if (typeof window === 'undefined') return () => {}

  const refresh = () => {
    if (watchTimer) return
    watchTimer = setTimeout(() => {
      watchTimer = null
      void reloadAll()
    }, 300)
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key === PENDING_TX_KEY) refresh()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') refresh()
  }
  const onFocus = () => {
    if (document.visibilityState === 'visible') refresh()
  }

  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onFocus)

  return () => {
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onFocus)
    if (watchTimer) clearTimeout(watchTimer)
  }
}

export async function reloadAll(): Promise<void> {
  useAppStore.getState().bumpDataEpoch()
  await Promise.allSettled([
    useRecordStore.getState().load(),
    usePetStore.getState().load(),
    useTodoStore.getState().load(),
    useDiaryStore.getState().load(),
    useMomentsStore.getState().load(),
    useSparkStore.getState().load(),
    useFinanceStore.getState().load(),
    useCycleStore.getState().load(),
    useShoppingStore.getState().load(),
    useSettingsStore.getState().load(),
    useCountdownStore.getState().load(),
    useBookStore.getState().load(),
    useAccountStore.getState().load(),
    useCategoryStore.getState().load(),
    useBudgetStore.getState().load(),
  ])
  await mergePendingTx()
}

// ── PWA 手动强制更新（保留本地数据） ──
// 目标：拉取最新应用代码（JS/CSS/HTML），同时【完整保留用户本地业务数据】。
//
// 数据安全边界（关键）：
//   - Cache Storage（caches.delete）只存 SW 运行期缓存的静态资源，与 IndexedDB 完全隔离 → 清它不会动账目/分类。
//   - Service Worker 注销（unregister）只停 SW 进程，不读写业务数据 → 安全。
//   - 严禁调用 localStorage.clear() / sessionStorage.clear() / indexedDB.deleteDatabase()，
//     三者才会真正销毁用户数据；本项目数据在 IndexedDB（Dexie），本函数一律不碰。
//
// iOS PWA 缓存坑：主屏独立运行的 PWA 里 window.location.reload(true) 仍可能喂回缓存版 index.html。
// 直接替换 URL 的查询串为唯一的 refresh 时间戳，使 iOS 视为不同文档地址 → 强制重新拉取最新 index.html；
// 应用用 hash 路由，query 被忽略、hash 保留 → 路由不变、数据从 IndexedDB 原样恢复。
export async function forceAppUpdate(): Promise<void> {
  try {
    // 1. 仅清除 Service Worker 的静态资源缓存（应用代码缓存）
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})))
    }
  } catch {
    /* 静默：缓存 API 不可用不影响更新 */
  }

  try {
    // 2. 注销 Service Worker（下次加载重新走纯 network 拉最新）
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})))
    }
  } catch {
    /* 静默 */
  }

  // 3. 不清除 localStorage / IndexedDB —— 用户数据完整保留（见上方注释）

  // 3.5 主题快照（同步写入 localStorage）：主题本体存于 IndexedDB(settings.theme)，
  // 强制刷新是整页重载，主题需等 React 挂载后异步读 IndexedDB 才 applySkin，
  // 期间会先闪一下默认主题、偶发「变回默认」观感。此处把当前 skin+mode 同步落盘，
  // 由 main.tsx 在启动最早期同步 applySkin，做到「重载首帧即恢复主题、零闪白」。
  try {
    const skin = useSettingsStore.getState().skin
    const mode = useAppStore.getState().mode
    if (skin) localStorage.setItem('titia.theme', JSON.stringify({ skin, mode }))
  } catch {
    /* 忽略：localStorage 不可用时不影响更新 */
  }

  // 4. 强制用新的 URL 参数绕过所有浏览器文件缓存（CSS、JS 等），保留原 hash 路由
  window.location.href = window.location.href.split('?')[0] + '?refresh=' + new Date().getTime()
}
