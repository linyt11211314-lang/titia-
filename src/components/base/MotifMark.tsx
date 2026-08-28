import { useSettingsStore } from '../../stores/useSettingsStore'
import { getSkin } from '../../theme/skins'
import { Motif } from '../../theme/motifs'
import catImg from '../../components/cat/cat-mascot.png'

// Titia 时序 · 局部 motif 点缀
// 与 SkinBackdrop 同一原则：基础色皮肤下返回 null，不产出任何 DOM、不占位、不影响布局。

interface MotifMarkProps {
  size?: number
  className?: string
  /** 0~1，相对于所在容器的可见度 */
  opacity?: number
}

/** 空态用：大号淡色图形，填补纯文字空态的留白；猫皮肤下显示真实小猫淡影 */
export function MotifMark({ size = 96, className = '', opacity = 0.22 }: MotifMarkProps) {
  const skin = getSkin(useSettingsStore((s) => s.skin))
  if (skin.group !== 'character' || !skin.motif) return null
  if (skin.id === 'cat') {
    return (
      <img
        src={catImg}
        alt=""
        aria-hidden="true"
        className={`block ${className}`}
        style={{ width: size, opacity: opacity * 0.7, height: 'auto' }}
        draggable={false}
      />
    )
  }
  return (
    <span className={`block text-primary ${className}`} style={{ opacity }} aria-hidden="true">
      <Motif kind={skin.motif} size={size} />
    </span>
  )
}

/** 卡片角落用：绝对定位在右上角的小图案，需父级 relative + overflow-hidden。
 *  猫皮肤下显示真实小猫淡影（角落探头），其它角色皮肤显示通用 motif */
export function MotifCorner({ size = 56, opacity = 0.07 }: { size?: number; opacity?: number }) {
  const skin = getSkin(useSettingsStore((s) => s.skin))
  if (skin.group !== 'character' || !skin.motif) return null

  if (skin.id === 'cat') {
    return (
      <img
        src={catImg}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-2 -right-2 block"
        style={{ width: size * 1.25, opacity: 0.16, height: 'auto' }}
        draggable={false}
      />
    )
  }
  return (
    <span
      className="pointer-events-none absolute -right-3 -top-3 block text-primary"
      style={{ opacity }}
      aria-hidden="true"
    >
      <Motif kind={skin.motif} size={size} />
    </span>
  )
}
