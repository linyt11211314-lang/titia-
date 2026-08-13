import type { ReactNode } from 'react'

// Titia 时序 · EmbeddedHeader
// 模块页以 embedded 模式嵌入（如空间页右栏）时，替代 NavBar 的轻量标题行。
// 作用：保留原 NavBar 上的操作入口（记录/锁定/添加等），否则内嵌后这些操作会丢失。
// 与 NavBar 的区别：无返回键、无阴影、不占固定高度，直接跟随内容流。

export function EmbeddedHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {right}
    </div>
  )
}
