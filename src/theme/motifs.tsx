// Titia 时序 · 皮肤装饰图形（motif）
// 说明：这些都是通用几何图形（云/星/花/爪印/蝴蝶结），不是任何角色形象的复刻。
// 角色皮肤只借配色与「气质」，图形一律自绘的通用符号，规避版权问题。
// 统一 24×24 viewBox，用 currentColor 填充，方便随 token 变色。

export type MotifKind = 'cloud' | 'star' | 'flower' | 'paw' | 'bow'

/** 每种 motif 的路径（可能多段，构成完整图形） */
const PATHS: Record<MotifKind, string[]> = {
  // 云：三个圆弧堆出的胖云朵
  cloud: [
    'M6.5 18C4 18 2 16.1 2 13.8c0-2.1 1.7-3.9 3.9-4.1C6.5 6.4 9.2 4 12.5 4c3.5 0 6.4 2.7 6.7 6.1 1.6.4 2.8 1.8 2.8 3.5 0 2-1.7 3.7-3.8 3.7z',
  ],
  // 星：五角星（圆角感靠 stroke-linejoin）
  star: [
    'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5-4.7-4.6 6.5-.9z',
  ],
  // 花：五瓣小花 + 花心
  flower: [
    'M12 2.8a3.1 3.1 0 0 1 2.95 4.05 3.1 3.1 0 0 1 3.6 4.95 3.1 3.1 0 0 1-1.4 5.75 3.1 3.1 0 0 1-5.15 2.3 3.1 3.1 0 0 1-5.15-2.3 3.1 3.1 0 0 1-1.4-5.75 3.1 3.1 0 0 1 3.6-4.95A3.1 3.1 0 0 1 12 2.8z',
    'M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z',
  ],
  // 爪印：掌垫 + 四趾
  paw: [
    'M12 13.2c2.6 0 4.9 1.9 4.9 4.1 0 1.6-1.3 2.7-3 2.7-.8 0-1.4-.2-1.9-.2s-1.1.2-1.9.2c-1.7 0-3-1.1-3-2.7 0-2.2 2.3-4.1 4.9-4.1z',
    'M7.1 6.2c1.2 0 2.1 1.3 2.1 2.9s-.9 2.9-2.1 2.9S5 10.7 5 9.1s.9-2.9 2.1-2.9z',
    'M16.9 6.2c1.2 0 2.1 1.3 2.1 2.9s-.9 2.9-2.1 2.9-2.1-1.3-2.1-2.9.9-2.9 2.1-2.9z',
    'M12 3.2c1.2 0 2.1 1.3 2.1 2.9S13.2 9 12 9s-2.1-1.3-2.1-2.9S10.8 3.2 12 3.2z',
  ],
  // 蝴蝶结：两片翼 + 中心结
  bow: [
    'M10.4 12L3.6 7.4c-.7-.5-1.6 0-1.6.9v7.4c0 .9.9 1.4 1.6.9z',
    'M13.6 12l6.8 4.6c.7.5 1.6 0 1.6-.9V8.3c0-.9-.9-1.4-1.6-.9z',
    'M12 9.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z',
  ],
}

interface MotifProps {
  kind: MotifKind
  size?: number
  className?: string
  style?: React.CSSProperties
}

/** 单个 motif 图形，颜色继承 currentColor */
export function Motif({ kind, size = 24, className = '', style }: MotifProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[kind].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
