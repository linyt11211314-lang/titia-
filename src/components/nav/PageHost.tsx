import type { ReactNode } from 'react'
import { PullToRefresh } from '../base/PullToRefresh'
import { reloadAll } from '../../services/reload'

// Titia 时序 · PageHost
// 业务页面的统一容器抽象（文档防返工设计）。
// 阶段五加保活/转场时只改此处内部实现，业务代码一行不动。
// 阶段八：内置下拉刷新（PullToRefresh）——所有走 PageHost 的页面自动获得。
// 当前：处理安全区、独立滚动容器、进入动画、下拉刷新。

interface PageHostProps {
  children: ReactNode
  className?: string
  /**
   * 覆盖内容区默认样式。
   * 默认「整页一个滚动容器 + 左右 20px 内边距」满足绝大多数页面；
   * 空间页是左右分栏、两栏各自独立滚动，需要自己接管布局。
   */
  contentClassName?: string
  /** 自定义刷新回调（默认：重载所有 store + 合并跨容器桥） */
  onRefresh?: () => Promise<void>
}

// 全局统一顶部：滚动容器自带不透明背景，但「顶部安全区」由上层 NavBar 负责（NavBar 已含 safe-top），
// 此处不再重复叠加 safe-top，否则 NavBar+PageHost 页面会出现双倍安全区的大块留白。
// 仅当页面没有 NavBar 时（如 RecordPage），由调用方通过 contentClassName 自行补回 safe-top。
const DEFAULT_CONTENT =
  'flex-1 overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y px-5 pb-28 pt-4'

export function PageHost({ children, className = '', contentClassName = DEFAULT_CONTENT, onRefresh }: PageHostProps) {
  // 默认走 DEFAULT_CONTENT 的页面：滚动容器由 PullToRefresh 内部接管（含下拉刷新）
  const scrollsItself = contentClassName !== DEFAULT_CONTENT
  if (scrollsItself) {
    // 空间页等自管布局：不包 PullToRefresh（避免双滚动容器），调用方自行处理刷新
    return (
      <div className={`flex h-full flex-col ${className}`}>
        <div className={contentClassName}>{children}</div>
      </div>
    )
  }
  return (
    <div className={`flex-1 min-h-0 flex flex-col ${className}`}>
      <PullToRefresh onRefresh={onRefresh ?? reloadAll} className={DEFAULT_CONTENT}>
        {children}
      </PullToRefresh>
    </div>
  )
}
