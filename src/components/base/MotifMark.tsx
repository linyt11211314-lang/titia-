import { useSettingsStore } from '../../stores/useSettingsStore'
import { getSkin } from '../../theme/skins'
import { Motif } from '../../theme/motifs'

// Titia 时序 · 局部 motif 点缀
// 与 SkinBackdrop 同一原则：基础色皮肤下返回 null，不产出任何 DOM、不占位、不影响布局。

interface MotifMarkProps {
  size?: number
  className?: string
  /** 0~1，相对于所在容器的可见度 */
  opacity?: number
}

/** 空态用：大号淡色图形，填补纯文字空态的留白 */
export function MotifMark({ size = 64, className = '', opacity = 0.22 }: MotifMarkProps) {
  const skin = getSkin(useSettingsStore((s) => s.skin))
  if (skin.group !== 'character' || !skin.motif) return null
  return (
    <span className={`block text-primary ${className}`} style={{ opacity }} aria-hidden="true">
      <Motif kind={skin.motif} size={size} />
    </span>
  )
}

/** 卡片角落用：绝对定位在右上角的小图案，需父级 relative + overflow-hidden */
export function MotifCorner({ size = 56, opacity = 0.07 }: { size?: number; opacity?: number }) {
  const skin = getSkin(useSettingsStore((s) => s.skin))
  if (skin.group !== 'character' || !skin.motif) return null
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
