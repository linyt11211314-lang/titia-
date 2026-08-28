import { useSettingsStore } from '../../stores/useSettingsStore'
import { useAppStore } from '../../stores/useAppStore'
import { getSkin } from '../../theme/skins'
import { Motif } from '../../theme/motifs'

// Titia 时序 · 角色皮肤装饰层（全局飘浮 motif）
// 只在 group === 'character' 的皮肤下渲染；基础色皮肤完全不产出 DOM。
// 绝对定位铺满 + pointer-events-none，永远不拦截点击；动画只走 transform，GPU 合成。

/** 散布点位：错开大小/时长/延迟，避免看出规律；刻意让顶部与底部更密、中部留白给内容 */
const SPOTS = [
  { top: '3%', left: '5%', size: 104, dur: 19, delay: 0, op: 1 },
  { top: '8%', left: '82%', size: 52, dur: 23, delay: 2.4, op: 0.8 },
  { top: '16%', left: '40%', size: 34, dur: 17, delay: 5.6, op: 0.6 },
  { top: '22%', left: '88%', size: 40, dur: 16, delay: 5.1, op: 0.6 },
  { top: '30%', left: '0%', size: 48, dur: 26, delay: 1.2, op: 0.55 },
  { top: '38%', left: '70%', size: 30, dur: 21, delay: 3.8, op: 0.5 },
  { top: '46%', left: '20%', size: 64, dur: 18, delay: 6.3, op: 0.62 },
  { top: '55%', left: '90%', size: 44, dur: 22, delay: 0.4, op: 0.55 },
  { top: '62%', left: '12%', size: 66, dur: 19, delay: 4.1, op: 0.6 },
  { top: '70%', left: '78%', size: 80, dur: 24, delay: 0.8, op: 0.7 },
  { top: '78%', left: '34%', size: 36, dur: 20, delay: 5.9, op: 0.5 },
  { top: '85%', left: '2%', size: 50, dur: 17, delay: 3.2, op: 0.55 },
  { top: '90%', left: '64%', size: 58, dur: 21, delay: 2.9, op: 0.6 },
  { top: '95%', left: '40%', size: 30, dur: 18, delay: 6.8, op: 0.45 },
]

export function SkinBackdrop() {
  const skinId = useSettingsStore((s) => s.skin)
  const mode = useAppStore((s) => s.mode)
  const skin = getSkin(skinId)

  if (skin.group !== 'character' || !skin.motif) return null

  // 深色模式下亮色图形在暗底上更抢眼，整体压一档
  const baseOpacity = mode === 'dark' ? 0.12 : 0.16

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden text-primary"
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
