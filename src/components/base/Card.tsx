import type { ReactNode } from 'react'
import { MotifCorner } from './MotifMark'

// Titia 时序 · Card
// 铁律：必须接受 onPress（无点击行为的卡片开发态告警）。
// 变体：plain(内容卡) / entry(空间入口卡) / stat(数据卡)
// 活泼化：默认更强阴影(shadow-card)；传 accentColor 时整块着色软色底，入口卡更具活力。
// motif：角色皮肤下在右上角压一枚淡图案。**默认关闭**——列表里每张卡都带图案会非常吵，
//        只给单独出现的大卡（如宠物 stat 卡）显式开启。

interface CardProps {
  children: ReactNode
  onPress?: () => void
  accentColor?: 'primary' | 'accent' | 'highlight'
  variant?: 'plain' | 'entry' | 'stat'
  className?: string
  /** 角色皮肤下显示角落点缀（会给卡片加 overflow-hidden） */
  motif?: boolean
}

export function Card({
  children, onPress, accentColor, variant = 'plain', className = '', motif = false,
}: CardProps) {
  if (import.meta.env.DEV && !onPress) {
    console.warn('[Titia] Card 缺少 onPress：所有卡片必须可点击（空状态除外，用 EmptyState）。')
  }

  const tint =
    accentColor === 'primary'
      ? 'bg-primary-soft'
      : accentColor === 'accent'
        ? 'bg-accent-soft'
        : accentColor === 'highlight'
          ? 'bg-highlight-soft'
          : ''

  return (
    <div
      onClick={onPress}
      role={onPress ? 'button' : undefined}
      className={`rounded-card ${tint || 'bg-surface'} shadow-card ${
        motif ? 'relative overflow-hidden' : ''
      } ${onPress ? 'pressable cursor-pointer' : ''} ${className}`}
    >
      {motif && <MotifCorner size={80} opacity={0.09} />}
      {children}
    </div>
  )
}
