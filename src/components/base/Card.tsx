import type { ReactNode } from 'react'
import { MotifCorner } from './MotifMark'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useAppStore } from '../../stores/useAppStore'
import { getSkin } from '../../theme/skins'

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

// 角色皮肤：把爪印织进卡片背景（极淡肌理，不影响文字/点击）。
// 直接用内联 style 注入，避免被 Tailwind 的 bg-surface 工具类覆盖 background-image。
const PAW_BG_LIGHT =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 13.2c2.6 0 4.9 1.9 4.9 4.1 0 1.6-1.3 2.7-3 2.7-.8 0-1.4-.2-1.9-.2s-1.1.2-1.9.2c-1.7 0-3-1.1-3-2.7 0-2.2 2.3-4.1 4.9-4.1zM7.1 6.2c1.2 0 2.1 1.3 2.1 2.9s-.9 2.9-2.1 2.9S5 10.7 5 9.1s.9-2.9 2.1-2.9zM16.9 6.2c1.2 0 2.1 1.3 2.1 2.9s-.9 2.9-2.1 2.9-2.1-1.3-2.1-2.9.9-2.9 2.1-2.9zM12 3.2c1.2 0 2.1 1.3 2.1 2.9S13.2 9 12 9s-2.1-1.3-2.1-2.9S10.8 3.2 12 3.2z' fill='%23FF8FB3' fill-opacity='0.14'/%3E%3C/svg%3E\")"
const PAW_BG_DARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 13.2c2.6 0 4.9 1.9 4.9 4.1 0 1.6-1.3 2.7-3 2.7-.8 0-1.4-.2-1.9-.2s-1.1.2-1.9.2c-1.7 0-3-1.1-3-2.7 0-2.2 2.3-4.1 4.9-4.1zM7.1 6.2c1.2 0 2.1 1.3 2.1 2.9s-.9 2.9-2.1 2.9S5 10.7 5 9.1s.9-2.9 2.1-2.9zM16.9 6.2c1.2 0 2.1 1.3 2.1 2.9s-.9 2.9-2.1 2.9-2.1-1.3-2.1-2.9.9-2.9 2.1-2.9zM12 3.2c1.2 0 2.1 1.3 2.1 2.9S13.2 9 12 9s-2.1-1.3-2.1-2.9S10.8 3.2 12 3.2z' fill='%23FF8FB3' fill-opacity='0.20'/%3E%3C/svg%3E\")"

// 柠檬黄主题：抽象星芒 + 小光点肌理（柠檬黄，比爪印更克制精致）
const SPARK_BG_LIGHT =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2.6c.55 3.7 2.7 5.85 6.4 6.4-3.7.55-5.85 2.7-6.4 6.4-.55-3.7-2.7-5.85-6.4-6.4 3.7-.55 5.85-2.7 6.4-6.4z' fill='%23F2C200' fill-opacity='0.16'/%3E%3Ccircle cx='18.2' cy='18.9' r='1.5' fill='%23FFD400' fill-opacity='0.20'/%3E%3C/svg%3E\")"
const SPARK_BG_DARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2.6c.55 3.7 2.7 5.85 6.4 6.4-3.7.55-5.85 2.7-6.4 6.4-.55-3.7-2.7-5.85-6.4-6.4 3.7-.55 5.85-2.7 6.4-6.4z' fill='%23F2C200' fill-opacity='0.22'/%3E%3Ccircle cx='18.2' cy='18.9' r='1.5' fill='%23FFD400' fill-opacity='0.26'/%3E%3C/svg%3E\")"

// 角色皮肤：按 motif 选不同背景肌理（爪印 / 星芒），避免所有角色皮肤共用一种图案
const TEXTURE: Record<string, { light: string; dark: string }> = {
  paw: { light: PAW_BG_LIGHT, dark: PAW_BG_DARK },
  spark: { light: SPARK_BG_LIGHT, dark: SPARK_BG_DARK },
}

export function Card({
  children, onPress, accentColor, variant = 'plain', className = '', motif = false,
}: CardProps) {
  if (import.meta.env.DEV && !onPress) {
    console.warn('[Titia] Card 缺少 onPress：所有卡片必须可点击（空状态除外，用 EmptyState）。')
  }

  const skinId = useSettingsStore((s) => s.skin)
  const mode = useAppStore((s) => s.mode)
  const skin = getSkin(skinId)
  const isCharacter = skin.group === 'character'
  const tex = isCharacter ? (mode === 'dark' ? TEXTURE[skin.motif ?? '']?.dark : TEXTURE[skin.motif ?? '']?.light) : undefined

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
      className={`relative skin-card rounded-card ${tint || 'bg-surface'} shadow-card ${
        motif ? 'overflow-hidden' : ''
      } ${onPress ? 'pressable cursor-pointer' : ''} ${className}`}
    >
      {/* 角色皮肤：极淡主题肌理（按 motif），位于卡片背景之上、内容之下 */}
      {tex && (
        <div
          className="pointer-events-none absolute inset-0 rounded-card"
          style={{ backgroundImage: tex, backgroundRepeat: 'repeat', backgroundSize: '56px 56px', backgroundPosition: '14px 12px' }}
          aria-hidden="true"
        />
      )}
      {motif && <MotifCorner size={80} opacity={0.09} />}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
