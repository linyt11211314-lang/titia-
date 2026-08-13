// Titia 时序 · 自建 SVG 图标集（风格统一，避免线性图标工具感）
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
)

export const RecordIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const SpaceIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </svg>
)

export const MineIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
)

export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const PawIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6.5" cy="11" r="1.6" />
    <circle cx="10" cy="8" r="1.6" />
    <circle cx="14" cy="8" r="1.6" />
    <circle cx="17.5" cy="11" r="1.6" />
    <path d="M8 16c0-2.5 1.8-4 4-4s4 1.5 4 4c0 2-1.5 3.5-4 3.5S8 18 8 16Z" />
  </svg>
)

export const BackIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

// 日记·关系（首页底部导航的合并 Tab）：书本 + 心
export const JournalIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" />
    <path d="M5 4v14" />
    <path d="M12.2 9c-.5-.7-1.6-.5-1.6.4 0 .6.7 1 1.6 1.7.9-.7 1.6-1.1 1.6-1.7 0-.9-1.1-.1-1.6.6Z" />
  </svg>
)

// 小账（底部一级导航 · 个人财富管理）：钱包 + 记账本
export const BookIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
    <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    <path d="M8 7h7M8 10.5h5" />
  </svg>
)

// 关闭（可关闭提示条等）
export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

// 折叠展开箭头（Aura 等可收起区块）
export const ChevronIcon = (p: IconProps & { up?: boolean }) => {
  const { up, ...rest } = p
  return (
    <svg {...base(rest)} style={{ transform: up ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Aura（皮肤诊断）：四芒星/闪光，贴合「你的皮肤，自有光」
export const AuraIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

// 羽毛笔（全局悬浮 · 灵光一闪）
export const FeatherIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 4c-2.5-2.5-6.5-1-8.5 1L4 12.5V20h7.5L19 12.5c2-2 2.5-6-1-8.5Z" />
    <path d="M12.5 8.5l3 3" />
    <path d="M4 20l4.5-1.5" />
  </svg>
)

// 物集（个人资产管理）：包裹/方箱，贴合「收纳物品」语义
export const WujiIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
    <path d="M3.5 7.5 12 12l8.5-4.5" />
    <path d="M12 12v9" />
  </svg>
)
