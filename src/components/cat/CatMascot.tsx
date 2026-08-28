import React from 'react'
// 原创软萌小猫吉祥物（AI 生图，纯原创卡通形象，非任何版权角色）。
// 仅作 Titia「奶喵喵」个人主题视觉使用。
import catImg from './cat-mascot.png'

type Props = {
  className?: string
  /** 宽度（高度自适应） */
  width?: number
  /** 是否加轻微漂浮动画 */
  animated?: boolean
}

export const CatMascot: React.FC<Props> = ({
  className = '',
  width = 200,
  animated = true,
}) => {
  return (
    <img
      src={catImg}
      width={width}
      alt="奶喵喵"
      aria-label="奶喵喵"
      role="img"
      className={`${animated ? 'animate-cat-float' : ''} ${className}`}
      style={{ height: 'auto', display: 'block' }}
      draggable={false}
    />
  )
}
