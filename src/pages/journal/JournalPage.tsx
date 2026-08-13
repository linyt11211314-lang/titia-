import { useRef, useState } from 'react'
import { PageHost } from '../../components/nav/PageHost'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { reloadAll } from '../../services/reload'
import { haptic } from '../../services/haptic'
import { PlusIcon } from '../../components/icons'
import { DiaryPage } from '../diary/DiaryPage'
import { MomentsPage } from '../moments/MomentsPage'

// Titia 时序 · 日记·关系（底部导航合并 Tab · 时光）
// 顶部一行：左侧 日记/关系 切换（iOS 细横线），右侧 ➕ 新增（统一收纳子页入口）。
// 下方内嵌完整模块页（embedded 模式）；不再使用左侧标签栏。

type Sub = 'diary' | 'relation'

const NAV: { key: Sub; label: string; icon: string }[] = [
  { key: 'diary', label: '日记', icon: '📔' },
  { key: 'relation', label: '关系', icon: '🤝' },
]

export function JournalPage() {
  const [sub, setSub] = useState<Sub>('diary')
  const rightRef = useRef<HTMLDivElement>(null)
  // 子页（日记/关系）各自的上传入口函数，由内嵌页通过 registerAdd 注入，顶栏 ➕ 统一调用
  const addHandler = useRef<() => void>(() => {})
  const onAdd = () => addHandler.current()

  return (
    <PageHost contentClassName="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 顶部横向滑动标签（日记/关系，替代左侧垂直导航）+ 右侧 ➕ 新增：激活=主色下划线；顶部避让状态栏 */}
        <div className="flex shrink-0 items-stretch gap-5 overflow-x-auto border-b border-line bg-bg px-4 pt-[calc(var(--safe-top)+8px)]">
          {NAV.map((n) => {
            const on = n.key === sub
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => {
                  haptic()
                  setSub(n.key)
                }}
                aria-current={on ? 'page' : undefined}
                className={`relative flex shrink-0 items-center gap-1 pb-2.5 pt-1 text-[15px] transition-colors ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}
              >
                <span className="text-base leading-none">{n.icon}</span>
                <span className="whitespace-nowrap leading-none">{n.label}</span>
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                  style={{ background: on ? 'var(--color-primary)' : 'transparent' }}
                />
              </button>
            )
          })}
          <div className="ml-auto flex items-center pb-2.5 pl-2">
            <button
              onClick={onAdd}
              className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-primary text-bg"
              aria-label="新增"
            >
              <PlusIcon width={17} height={17} />
            </button>
          </div>
        </div>

        {/* 内容区（全宽，独立滚动，含下拉刷新；不透明背景避免滚动透出） */}
        <PullToRefresh
          scrollRef={rightRef}
          onRefresh={reloadAll}
          className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y bg-bg px-4 pb-[calc(7rem+env(safe-area-inset-bottom))]"
        >
          <div key={sub} className="fade-up">
            {sub === 'diary' ? (
              <DiaryPage embedded registerAdd={(fn) => (addHandler.current = fn)} />
            ) : (
              <MomentsPage embedded registerAdd={(fn) => (addHandler.current = fn)} />
            )}
          </div>
        </PullToRefresh>
      </div>
    </PageHost>
  )
}
