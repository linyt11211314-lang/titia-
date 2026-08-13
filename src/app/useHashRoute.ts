import { useEffect, useState } from 'react'

// Titia 时序 · 极简 hash 路由
// 文档要求 hash 模式：PWA 静态托管免 rewrite。
// 返回当前 path（不含 #），navigate 用于切换页面。
//
// 右滑返回策略（仅「灵光一闪」与「Aura 方案结果页」保留 iOS 原生左边缘右滑返回）：
//  - 灵光一闪('/spark')、Aura 结果页('/aura-result')：用 pushState 真正压栈
//    → 系统右滑能干净返回上一页。
//  - 其余模块页 / Tab：用 replaceState 替换当前历史条目，**不压栈** → 历史里没有
//    可返回的上一页，iOS 边缘右滑手势「无条目可 pop」→ 直接失效、不切页。
//  - 非白名单模块的「返回」由 NavBar 的 back() 走自定义返回栈（navStack）+ replaceState，
//    不依赖系统 history.back，从而既能返回又不会被右滑误触发。

// 六个主 Tab（不是模块页，无 NavBar 返回）
const TAB_PATHS = new Set(['/', '/home', '/space', '/book', '/journal', '/mine', '/aura', '/wuji'])

// 自定义返回栈：记录「从哪来」，供 NavBar 返回时 replaceState 回去。
let navStack: string[] = []

// 标记「本次 history.back 来自应用内返回按钮（NavBar），而非系统右滑手势」，
// 供 App 的 popstate 兜底区分：按钮返回放行，手势右滑在非灵光一闪页则钉回原页。
let programmaticBack = false

function currentHashPath(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function useHashRoute(): string {
  const [path, setPath] = useState(() => currentHashPath())
  useEffect(() => {
    const onChange = () => setPath(currentHashPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}

export function navigate(to: string) {
  const from = currentHashPath()
  if (to === from) return

  if (to === '/spark' || to === '/aura-result') {
    // 允许原生右滑返回的模块页：刻意 push，让 iOS 边缘右滑能返回到来源页
    //  - /spark：灵光一闪，从全局悬浮按钮进入
    //  - /aura-result：Aura 生成结果页，从 Aura 主 Tab 进入，右滑回主 Tab
    history.pushState(history.state, '', '#' + to)
    window.dispatchEvent(new Event('hashchange'))
    return
  }

  if (TAB_PATHS.has(to)) {
    // 切到主 Tab：清空返回栈（Tab 无 NavBar 返回）
    navStack = []
  } else {
    // 进入模块页：把来源压入返回栈，供 NavBar 返回；用 replace 不压栈
    navStack.push(from)
  }
  history.replaceState(history.state, '', '#' + to)
  window.dispatchEvent(new Event('hashchange'))
}

export function back() {
  const cur = currentHashPath()
  if (cur === '/spark' || cur === '/aura-result') {
    // 这两类页用真实 history.back 弹出 push 的条目（原生右滑同理）
    programmaticBack = true
    window.history.back()
    return
  }
  const prev = navStack.pop()
  if (prev && prev !== cur) {
    // 非灵光一闪模块：replaceState 回上一页（不依赖系统 history，右滑不会误触发）
    programmaticBack = true
    history.replaceState(history.state, '', '#' + prev)
    window.dispatchEvent(new Event('hashchange'))
  }
  // 栈空则无操作（首屏 / Tab，本就无返回）
}

// 读取并清除「程序化返回」标记
export function consumeProgrammaticBack(): boolean {
  const v = programmaticBack
  programmaticBack = false
  return v
}
