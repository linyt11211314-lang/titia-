import { HomeIcon, JournalIcon, SpaceIcon, MineIcon, BookIcon, AuraIcon, WujiIcon } from '../icons'

// Titia 时序 · SideNav（固定窄版左侧主导航栏）
// 取代抽屉导航：固定常驻屏幕左侧，不再依赖手势/遮罩/收起展开动画；
// 宽度 68px（仅图标 + 2 字短文案），与空间页/时光页内部的 68px 子导航视觉统一。
// 顶部避让状态栏（--safe-top），底部避让 Home Indicator。
// 结构上无吸底元素、无手势监听层，从根上避免抽屉/底部导航的系列适配问题。
// 注意：用 absolute（相对 App 壳）而非 fixed —— 生产下壳 fixed inset-0 即视口，
// dev 手机框（393×852）下 absolute 能贴合框内，避免 fixed 脱框。

const TABS = [
  { key: 'home', label: '今日', icon: HomeIcon },
  { key: 'book', label: '小账', icon: BookIcon },
  { key: 'space', label: '小窝', icon: SpaceIcon },
  { key: 'aura', label: 'Aura', icon: AuraIcon },
  { key: 'journal', label: '时光', icon: JournalIcon },
  { key: 'wuji', label: '物集', icon: WujiIcon },
  { key: 'mine', label: '我呀', icon: MineIcon },
] as const

interface SideNavProps {
  active: string
  onSwitch: (key: string) => void
  /** 首页待办有到期提醒时，在「今日」项显示红点 */
  badge?: boolean
}

export function SideNav({ active, onSwitch, badge }: SideNavProps) {
  return (
    <nav
      className="absolute bottom-0 left-0 top-0 z-30 flex w-[68px] flex-col overflow-hidden border-r border-line bg-bg"
      style={{
        paddingTop: 'var(--safe-top, 44px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)',
      }}
    >
      {/* 主导航项：图标 + 2 字短文案（激活态：左侧竖条 + 主色软底） */}
      <div className="flex flex-col gap-0.5 pt-2">
        {TABS.map((t) => {
          const Icon = t.icon
          const on = active === t.key
          return (
            <button
              key={t.key}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => onSwitch(t.key)}
              className="pressable relative flex flex-col items-center gap-1 py-2.5"
            >
              {/* 激活左侧竖条 */}
              <span
                className={`absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity ${
                  on ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-[15px] transition-colors ${
                  on ? 'bg-primary-soft text-primary' : 'bg-surface-sunken text-ink-2 opacity-55'
                }`}
              >
                <Icon
                  width={22}
                  height={22}
                  fill={on ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={on ? 0 : 1.6}
                />
              </span>
              <span className={`text-[11px] leading-none ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}>
                {t.label}
              </span>
              {t.key === 'home' && badge && (
                <span className="absolute right-1.5 top-3 h-2 w-2 rounded-full bg-accent" />
              )}
            </button>
          )
        })}
      </div>

      {/* 底部版本号（与「我呀」页同步：V3.1） */}
      <div className="mt-auto pb-4 text-center text-[10px] text-ink-3">V3.1</div>
    </nav>
  )
}
