import { NavBar } from '../components/nav/NavBar'
import { PageHost } from '../components/nav/PageHost'
import { EmptyState } from '../components/base/EmptyState'

// Titia 时序 · 模块页占位（本期仅完整实现「我的憨憨」，其余按模板后续补齐）
export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <>
      <NavBar title={title} />
      <PageHost>
        <EmptyState
          text={`「${title}」模块将按文档模板补齐`}
          action={<span className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">敬请期待</span>}
        />
      </PageHost>
    </>
  )
}
