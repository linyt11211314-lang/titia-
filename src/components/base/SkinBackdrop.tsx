import { useSettingsStore } from '../../stores/useSettingsStore'
import { useAppStore } from '../../stores/useAppStore'
import { getSkin } from '../../theme/skins'
import { Motif } from '../../theme/motifs'

// Titia 时序 · 角色皮肤装饰层（全局飘浮 motif）
// 只在 group === 'character' 的皮肤下渲染；基础色皮肤完全不产出 DOM。
// 绝对定位铺满 + pointer-events-none，永远不拦截点击；动画只走 transform，GPU 合成。

/** 散布点位：错开大小/时长/延迟，避免看出规律；刻意让顶部与底部更密、中部留白给内容 */
const SPOTS = [
  { top: '4%', left: '6%', size: 96, dur: 19, delay: 0, op: 1 },
  { top: '11%', left: '74%', size: 58, dur: 23, delay: 2.4, op: 0.75 },
  { top: '26%', left: '86%', size: 38, dur: 16, delay: 5.1, op: 0.6 },
  { top: '34%', left: '2%', size: 46, dur: 26, delay: 1.2, op: 0.55 },
  { top: '48%', left: '62%', size: 30, dur: 21, delay: 3.8, op: 0.45 },
  { top: '58%', left: '14%', size: 62, dur: 18, delay: 6.3, op: 0.6 },
  { top: '71%', left: '80%', size: 74, dur: 24, delay: 0.8, op: 0.7 },
  { top: '84%', left: '30%', size: 42, dur: 20, delay: 4.5, op: 0.5 },
  { top: '92%', left: '68%', size: 54, dur: 17, delay: 2.9, op: 0.55 },
]

export function SkinBackdrop() {
  const skinId = useSettingsStore((s) => s.skin)
  const mode = useAppStore((s) => s.mode)
  const skin = getSkin(skinId)

  if (skin.group !== 'character' || !skin.motif) return null

  // 深色模式下亮色图形在暗底上更抢眼，整体压一档
  const baseOpacity = mode === 'dark' ? 0.055 : 0.085

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden text-primary"
      aria-hidden="true"
      data-skin-backdrop={skin.motif}
    >
      {SPOTS.map((s, i) => (
        <span
          key={i}
          className="motif-drift absolute block"
          style={{
            top: s.top,
            left: s.left,
            opacity: baseOpacity * s.op,
            ['--motif-dur' as string]: `${s.dur}s`,
            ['--motif-delay' as string]: `-${s.delay}s`,
          }}
        >
          <Motif kind={skin.motif!} size={s.size} />
        </span>
      ))}
    </div>
  )
}
