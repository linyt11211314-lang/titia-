import { useEffect, useRef, useState } from 'react'
import { useHashRoute, navigate, consumeProgrammaticBack } from './useHashRoute'
import { SideNav } from '../components/nav/SideNav'
import { FeatherIcon } from '../components/icons'
import { Toast } from '../components/base/Toast'
import { SkinBackdrop } from '../components/base/SkinBackdrop'
import { HomePage } from '../pages/home/HomePage'
import { RecordPage } from '../pages/record/RecordPage'
import { SpacePage } from '../pages/space/SpacePage'
import { MinePage } from '../pages/mine/MinePage'
import { JournalPage } from '../pages/journal/JournalPage'
import { PetPage } from '../pages/pet/PetPage'
import { DiaryPage } from '../pages/diary/DiaryPage'
import { MomentsPage } from '../pages/moments/MomentsPage'
import { SparkPage } from '../pages/spark/SparkPage'
import { CyclePage } from '../pages/cycle/CyclePage'
import { ShoppingPage } from '../pages/shopping/ShoppingPage'
import { VaultPage } from '../pages/vault/VaultPage'
import { CountdownPage } from '../pages/countdown/CountdownPage'
import { BookPage } from '../pages/book/BookPage'
import { ThemePage } from '../pages/theme/ThemePage'
import { applySkin } from '../theme/skins'
import { TodoPage } from '../pages/todo/TodoPage'
import { AuraPage } from '../pages/aura/AuraPage'
import { AuraResultPage } from '../pages/aura/AuraResultPage'
import { WujiPage } from '../pages/wuji/WujiPage'
import { useOverlayStore } from '../stores/useOverlayStore'
import { usePetStore } from '../stores/usePetStore'
import { useRecordStore } from '../stores/useRecordStore'
import { useTodoStore, isTodoDue } from '../stores/useTodoStore'
import { useAppStore } from '../stores/useAppStore'
import { useSettingsStore } from '../stores/useSettingsStore'
import { importSleepFromQuery } from '../services/sleep'

const TAB_OF_PATH: Record<string, string> = {
  '/': 'home',
  '/journal': 'journal',
  '/space': 'space',
  '/mine': 'mine',
  '/book': 'book',
  '/aura': 'aura',
  '/wuji': 'wuji',
}
const MODULE_TAB: Record<string, string> = {
  '/pet': 'space',
  '/diary': 'journal',
  '/moments': 'journal',
  '/spark': 'space',
  '/cycle': 'space',
  '/shopping': 'space',
  '/vault': 'space',
  '/countdown': 'space',
  '/theme': 'mine',
  '/todo': 'home',
  '/record': 'mine',
  '/aura-result': 'aura', // Aura 生成结果页（从 Aura 主 Tab 进入）
}

const DEV = import.meta.env.DEV

export default function App() {
  const raw = useHashRoute()
  const path = raw.split('?')[0]
  const isModule = path in MODULE_TAB
  const activeTab = isModule ? MODULE_TAB[path] : TAB_OF_PATH[path] ?? 'home'
  const overlay = useOverlayStore((s) => s.sheet)
  const todos = useTodoStore((s) => s.todos)
  const showToast = useAppStore((s) => s.showToast)
  const hasDue = todos.some(isTodoDue)

  // 启动入口：解析快捷指令 Shortcuts 通过 URL 传入的睡眠数据并写入 IndexedDB。
  // 纯前端无后端，依赖「打开 URL」触发本页 JS；无参数时本调用直接返回，不影响正常启动。
  useEffect(() => {
    void importSleepFromQuery()
      .then((r) => {
        if (r) showToast(r.message)
      })
      .catch(() => {})
  }, [showToast])
  const skin = useSettingsStore((s) => s.skin)
  const mode = useAppStore((s) => s.mode)

  // 启动水合：先合并跨容器桥（Safari 侧写入的待同步账单），再加载各 store ——
  // 保证「Safari 新增 → PWA 打开」本次会话即可见（避免与 store 加载竞态）
  useEffect(() => {
    void (async () => {
      await import('../services/reload').then(({ mergePendingTx }) => mergePendingTx())
      usePetStore.getState().load()
      useRecordStore.getState().load()
      useTodoStore.getState().load()
      if (!useSettingsStore.getState().loaded) useSettingsStore.getState().load()
    })()
    // 跨容器自动刷新：storage（另一容器写入桥）/ 前台切换（visibilitychange/focus）
    // → 自动重读 IndexedDB，Safari 与 PWA 两入口数据实时一致（无需手动刷新）
    void import('../services/reload').then(({ watchCrossContainerSync }) => watchCrossContainerSync())
    // 全局输入框可见性：唤起输入法后自动把输入框滚到键盘上方（不遮挡，任意行皆可）
    void import('../services/inputVisibility').then(({ watchInputVisibility }) => watchInputVisibility())
    // 全局双击灵动岛（顶部状态栏区域）→ 当前页面所有可滚动容器滚到顶
    const lastTap = { v: 0 }
    const scrollToTop = () => {
      document.querySelectorAll<HTMLElement>('div').forEach((el) => {
        const cs = getComputedStyle(el)
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          el.scrollTo({ top: 0, behavior: 'auto' })
        }
      })
    }
    const onTap = (clientY: number) => {
      if (clientY > 70) { lastTap.v = 0; return } // 仅顶部 0~70px（状态栏/灵动岛区域）
      const now = Date.now()
      if (now - lastTap.v < 300) {
        scrollToTop()
        lastTap.v = 0
      } else {
        lastTap.v = now
      }
    }
    // 同时监听 touchend（移动端/iOS 灵动岛）和 pointerup（CDP 模拟/鼠标）
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches?.[0]
      if (t) onTap(t.clientY)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen') {
        onTap(e.clientY)
      }
    }
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    return () => {
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('pointerup', onPointerUp)
    }
    // 注意：剪贴板读取「唯一入口」是小账首页右上角 📥 按钮（约束框架）。
    // 不在此做任何全局/自动读取——避免 iOS 任意点击都弹粘贴提示、干扰正常操作。
    // 云同步：当前阶段本地存储优先（不接 Supabase/后端/云端接口），未来需要多设备同步时再单独接入。
  }, [])

  // 全局换肤：皮肤或深浅变化时，把 token 写到 :root 内联样式，全局即时生效
  useEffect(() => {
    applySkin(skin, mode)
  }, [skin, mode])

  // 跟随系统深色模式：让 App 自身的深浅与手机系统保持一致。
  // 关键修复：之前 App 不监听系统深浅，系统切深色时页面被「系统强制反色」压暗，
  // 但 App 的 JS 不知道（mode 仍是 light），于是状态栏样式没同步 → 出现白条割裂。
  // 现在由 JS 主动跟随，applySkin 会同时刷新页面配色与状态栏，二者永远一致。
  // 用户若在主题中心手动选了 浅色/深色，themeAuto=false，此处不再覆盖其选择。
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      if (useAppStore.getState().themeAuto) {
        useAppStore.getState().setSystemMode(mq.matches ? 'dark' : 'light')
      }
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // 仅「灵光一闪」与「Aura 方案结果页」保留 iOS 原生左边缘右滑返回；其余模块页一律屏蔽，
  // 避免右滑在 hash 历史里来回切页（切来切去很乱）。灵光一闪从全局悬浮按钮进入，
  // Aura 结果页从 Aura 主 Tab 进入，二者右滑均能干净回到来源页，故保留；其他模块页
  // 右滑返回会跳到历史里的上一页，故禁掉。
  // 实现：拦截「从左边缘起、向右、且横向为主」的 touchmove 并 preventDefault，
  // 阻断系统级返回手势。竖向滚动、以及 SwipeRow 左滑删除（向左）均不受影响。
  useEffect(() => {
    if (!(isModule && path !== '/spark' && path !== '/aura-result')) return
    const EDGE = 24
    let startX = 0
    let startY = 0
    let dir: 'h' | 'v' | null = null
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      dir = null
    }
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (dir === null) {
        if (startX <= EDGE && dx > 0 && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) dir = 'h'
        else if (Math.abs(dy) > Math.abs(dx)) dir = 'v'
      }
      if (dir === 'h') e.preventDefault() // 阻断原生右滑返回
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
    }
  }, [isModule, path])

  // 右滑返回的「手势」拦截（popstate 兜底）：
  // iOS 原生左边缘右滑返回是系统级手势，网页 touchmove 拦截常被忽略，
  // 故在 popstate 层兜底——若右滑是从「非灵光一闪模块页」离开，立即把页面钉回原页
  // （replaceState + 派发 hashchange，不增长历史），用户看到的现象就是「右滑没反应」。
  // 灵光一闪（从悬浮按钮进入）允许右滑返回；NavBar 的「返回」按钮是程序化 history.back，
  // 由 back() 置位的 programmaticBack 标记识别，放行，不拦截。
  const intendedRef = useRef(path)
  useEffect(() => {
    const resolve = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0]
    const onHash = () => {
      intendedRef.current = resolve()
    }
    const onPop = () => {
      const newPath = resolve()
      // 应用内返回按钮（NavBar）触发的 history.back：直接放行
      if (consumeProgrammaticBack()) {
        intendedRef.current = newPath
        return
      }
      // 系统右滑手势：从非「灵光一闪/Aura 结果页」的模块页离开 → 钉回原页（无感知、不增长历史）
      const prev = intendedRef.current
      if (prev && prev !== '/spark' && prev !== '/aura-result' && prev in MODULE_TAB && newPath !== prev) {
        history.replaceState(history.state, '', '#' + prev)
        window.dispatchEvent(new Event('hashchange'))
      } else {
        intendedRef.current = newPath
      }
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  // 轻量提醒：每分钟检查一次已到点的待办，弹 Toast 并标记已提醒
  useEffect(() => {
    const tick = () => {
      if (!useSettingsStore.getState().reminderOn) return
      const { todos, loaded } = useTodoStore.getState()
      if (!loaded) return
      for (const t of todos) {
        if (isTodoDue(t) && !t.notified) {
          useTodoStore.getState().markNotified(t.id)
          showToast(`提醒：${t.title}`)
        }
      }
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [showToast])

  const shell = (
    // App 壳铺满视口。生产用 fixed（相对视口，从根上消除 iOS PWA 下
    // absolute 相对 #root 的亚像素下移缝隙，避免顶部透出底层内容）；
    // dev 用 absolute 以贴合预览手机框。
    <div
      className={`${DEV ? 'absolute' : 'fixed'} inset-0 overflow-hidden bg-bg`}
    >
      {/* 角色皮肤装饰层：置于所有内容之下，基础色皮肤下不渲染 */}
      <SkinBackdrop />

      {/* 状态栏遮罩：铺满安全区顶部，用当前皮肤底色（--color-bg）。
          双保险确保 iOS 状态栏区域始终是页面底色——深色模式即深色，
          不依赖 black-translucent 透出根容器 DOM 的边界情况；pointer-events-none 不挡交互。 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 bg-bg"
        style={{ height: 'var(--safe-top, 44px)' }}
      />

      {/* Level 0 · 五 Tab 根页（常驻保活，显隐切换，不卸载）。
          主 Tab 层左侧让出 68px 给固定侧边栏（SideNav）；模块页(Level1)全屏且本层隐藏。 */}
      <div
        className={`absolute bottom-0 right-0 top-0 ${
          isModule ? 'left-0 opacity-0' : 'left-[68px] opacity-100'
        }`}
      >
        <TabContent active={activeTab} path={path} />
      </div>

      {/* Level 1 · 模块页（push 右滑入，返回销毁） */}
      {isModule && (
        <div
          className="absolute inset-0 z-20 flex flex-col bg-bg"
          style={{ animation: 'pagePush 320ms cubic-bezier(.32,.72,0,1)' }}
        >
          {/* 模块页有自己的 bg-bg 会遮住底层装饰，这里补一份 */}
          <SkinBackdrop />
          {path === '/pet' && <PetPage />}
          {path === '/diary' && <DiaryPage />}
          {path === '/moments' && <MomentsPage />}
          {path === '/spark' && <SparkPage />}
          {path === '/cycle' && <CyclePage />}
          {path === '/shopping' && <ShoppingPage />}
          {path === '/vault' && <VaultPage />}
          {path === '/countdown' && <CountdownPage />}
          {path === '/todo' && <TodoPage />}
          {path === '/record' && <RecordPage />}
          {path === '/theme' && <ThemePage />}
          {path === '/aura' && <AuraPage />}
          {path === '/aura-result' && <AuraResultPage />}
        </div>
      )}

      {/* 固定窄版左侧主导航栏（取代抽屉导航）：
          常驻屏幕左侧，点选即切换主 Tab；模块页(Level1)全屏时不渲染，避免盖住模块内容。 */}
      {!isModule && (
        <SideNav
          active={activeTab}
          onSwitch={(k) => navigate(`/${k === 'home' ? '' : k}`)}
          badge={hasDue}
        />
      )}

      {/* 全局悬浮羽毛笔（可拖动）：原「+」的灵光一闪（保留原页面/数据/保存逻辑）
          弹窗（记一笔/分类面板/设置等 Sheet/overlay）打开时隐藏，避免遮挡弹窗内容；关闭后恢复 */}
      {!isModule && !overlay && <FloatingFeather />}
      <Toast />
      {overlay}
      <style>{`@keyframes pagePush { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </div>
  )

  if (DEV) {
    // dev 环境挂 393×852 手机框，保证按真机尺寸开发
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-200 p-6">
        <div
          className="relative overflow-hidden rounded-[44px] border-[10px] border-black bg-bg shadow-2xl"
          style={{ width: 393, height: 852 }}
        >
          {shell}
        </div>
      </div>
    )
  }
  return shell
}

// ── 五 Tab 根页（常驻保活，按 active 显示对应页面） ──
function TabContent({ active, path }: { active: string; path: string }) {
  const tabs = ['home', 'aura', 'space', 'book', 'journal', 'wuji', 'mine']
  return (
    <>
      {tabs.map((key) => (
        <div
          key={key}
          data-page-active={active === key}
          className="absolute inset-0"
          style={{ display: active === key ? 'block' : 'none' }}
          aria-hidden={active !== key}
        >
          {key === 'home' && <HomePage />}
          {key === 'journal' && <JournalPage />}
          {key === 'space' && <SpacePage />}
          {key === 'mine' && <MinePage />}
          {key === 'book' && <BookPage />}
          {key === 'aura' && <AuraPage />}
          {key === 'wuji' && <WujiPage />}
        </div>
      ))}
    </>
  )
}

// ── 可拖动悬浮羽毛笔（灵光一闪入口） ──
// 初始在右下角且避开底部导航栏；可按住拖动到任意位置（localStorage 记忆）；
// 长按（500ms 不移动）进入「透明度调节」：按钮周边出现半环绕进度条，
// 在弧上点按/拖动调整按钮透明度（0.25~1，持久化）；弧的缺口朝向屏幕中心，避免出屏。
const FAB_KEY = 'titia.fabPos'
const FAB_OPACITY_KEY = 'titia.fabOpacity'
const SIZE = 48
const ARC_R = 42 // 半环绕进度条半径

function readFabOpacity(): number {
  try {
    const v = Number(localStorage.getItem(FAB_OPACITY_KEY))
    return v >= 0.25 && v <= 1 ? v : 1
  } catch {
    return 1
  }
}

function FloatingFeather() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)
  const movedRef = useRef(false)
  const longPressedRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)
  const fabNodeRef = useRef<HTMLElement | null>(null)
  const [opacity, setOpacity] = useState(readFabOpacity)
  // 长按调节模式：false=普通（拖动/点击）；true=显示半环绕进度条
  const [adjust, setAdjust] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初始位置：右下角，但高于底部导航栏（导航 ~76px + 安全区），默认 y = 屏高 - 190
  useEffect(() => {
    let x = window.innerWidth - SIZE - 16
    let y = window.innerHeight - SIZE - 210
    try {
      const saved = JSON.parse(localStorage.getItem(FAB_KEY) || 'null')
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        x = Math.min(Math.max(8, saved.x), window.innerWidth - SIZE - 8)
        y = Math.min(Math.max(8, saved.y), window.innerHeight - SIZE - 8)
      }
    } catch {
      /* ignore */
    }
    setPos({ x, y })
  }, [])

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  // 卸载时清理
  useEffect(() => clearPressTimer, [])

  if (!pos) return null

  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), window.innerWidth - SIZE - 8),
    y: Math.min(Math.max(8, y), window.innerHeight - SIZE - 8),
  })

  // ── 半环绕进度条：以按钮中心为圆心，开口朝向屏幕中心方向 ──
  const arc = (() => {
    const cx = pos.x + SIZE / 2
    const cy = pos.y + SIZE / 2
    const openAngle = Math.atan2(window.innerHeight / 2 - cy, window.innerWidth / 2 - cx)
    const a0 = openAngle + Math.PI * 0.75 // 弧起点（缺口前 135°）
    const total = Math.PI * 1.5 // 270° 半环绕
    const pt = (ang: number) => `${(ARC_R * Math.cos(ang)).toFixed(2)},${(ARC_R * Math.sin(ang)).toFixed(2)}`
    const seg = (from: number, to: number) => {
      const large = Math.abs(to - from) > Math.PI ? 1 : 0
      return `M ${pt(from)} A ${ARC_R} ${ARC_R} 0 ${large} 1 ${pt(to)}`
    }
    return { cx, cy, a0, total, pt, seg }
  })()

  // 进度 0~1 → 透明度 0.25~1（映射到弧长）
  const progress = Math.min(Math.max((opacity - 0.25) / 0.75, 0), 1)
  const applyArcPoint = (clientX: number, clientY: number) => {
    const dx = clientX - arc.cx
    const dy = clientY - arc.cy
    let rel = Math.atan2(dy, dx) - arc.a0
    while (rel < 0) rel += Math.PI * 2
    rel = Math.min(rel, arc.total)
    const next = Math.round((0.25 + (rel / arc.total) * 0.75) * 100) / 100
    setOpacity(next)
    try {
      localStorage.setItem(FAB_OPACITY_KEY, String(next))
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        aria-label="灵光一闪"
        className="pressable fixed z-[60] flex items-center justify-center rounded-pill bg-primary text-bg shadow-card"
        style={{
          left: pos.x,
          top: pos.y,
          width: SIZE,
          height: SIZE,
          opacity,
          touchAction: 'none',
          cursor: 'grab',
        }}
        onPointerDown={(e) => {
          drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false }
          movedRef.current = false
          longPressedRef.current = false // 新手势开始，重置长按标记
          pointerIdRef.current = e.pointerId
          fabNodeRef.current = e.currentTarget
          setAdjust(false)
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* 程序化事件可能无有效 pointerId */
          }
          // 长按 500ms 未移动 → 进入透明度调节（释放捕获，让事件流向进度条弧层）
          clearPressTimer()
          pressTimer.current = setTimeout(() => {
            longPressedRef.current = true
            setAdjust(true)
            try {
              // 注意：不能用合成事件 e.currentTarget（异步回调中已被 React 置空），用 DOM 引用
              if (fabNodeRef.current && pointerIdRef.current != null) {
                fabNodeRef.current.releasePointerCapture(pointerIdRef.current)
              }
            } catch {
              /* ignore */
            }
          }, 500)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || adjust) return
          const dx = e.clientX - d.sx
          const dy = e.clientY - d.sy
          if (Math.abs(dx) + Math.abs(dy) > 6) {
            d.moved = true
            movedRef.current = true
            clearPressTimer()
          }
          if (d.moved) setPos(clamp(d.ox + dx, d.oy + dy))
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          pointerIdRef.current = null
          clearPressTimer()
          // 注意：长按标记保留给后续合成 click 抑制，不在 pointerup 里重置
          const lp = longPressedRef.current
          if (adjust) setAdjust(false)
          if (!d) return
          if (!d.moved && !lp) {
            navigate('/spark')
            return
          }
          try {
            localStorage.setItem(FAB_KEY, JSON.stringify({ x: pos.x, y: pos.y }))
          } catch {
            /* ignore */
          }
        }}
        onClick={() => {
          // 程序化/键盘点击兜底（真实点按走 onPointerUp）；拖动或长按结束后抑制本次 click
          if (movedRef.current) {
            movedRef.current = false
            return
          }
          const lp = longPressedRef.current
          longPressedRef.current = false
          if (lp) return
          navigate('/spark')
        }}
      >
        <FeatherIcon width={22} height={22} />
      </button>

      {/* 半环绕透明度进度条（长按出现；点按/拖动弧上任意位置调整） */}
      {adjust && (
        <div
          className="fixed inset-0 z-[61]"
          onPointerDown={(e) => applyArcPoint(e.clientX, e.clientY)}
          onPointerMove={(e) => {
            if (e.buttons === 1) applyArcPoint(e.clientX, e.clientY)
          }}
          onPointerUp={() => setAdjust(false)}
          onPointerCancel={() => setAdjust(false)}
        >
          <svg
            className="pointer-events-none absolute"
            style={{ left: arc.cx, top: arc.cy, transform: 'translate(-50%,-50%)' }}
            width={ARC_R * 2 + 24}
            height={ARC_R * 2 + 24}
            viewBox={`${-ARC_R - 12} ${-ARC_R - 12} ${ARC_R * 2 + 24} ${ARC_R * 2 + 24}`}
          >
            {/* 底弧 */}
            <path d={arc.seg(arc.a0, arc.a0 + arc.total)} stroke="rgba(255,255,255,0.3)" strokeWidth={7} fill="none" strokeLinecap="round" />
            {/* 进度弧 */}
            <path
              d={arc.seg(arc.a0, arc.a0 + arc.total * progress)}
              stroke="var(--color-bg)"
              strokeWidth={7}
              fill="none"
              strokeLinecap="round"
              opacity={0.9}
            />
            {/* 手柄 */}
            <circle cx={arc.pt(arc.a0 + arc.total * progress).split(',')[0]} cy={arc.pt(arc.a0 + arc.total * progress).split(',')[1]} r={6} fill="var(--color-bg)" />
            <circle cx={arc.pt(arc.a0 + arc.total * progress).split(',')[0]} cy={arc.pt(arc.a0 + arc.total * progress).split(',')[1]} r={3} fill="var(--color-ink)" />
          </svg>
          <p className="absolute left-1/2 top-2 -translate-x-1/2 rounded-pill bg-black/50 px-3 py-1 text-xs text-white">
            透明度 {Math.round(opacity * 100)}%
          </p>
        </div>
      )}
    </>
  )
}
