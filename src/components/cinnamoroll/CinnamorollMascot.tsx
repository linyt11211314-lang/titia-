import React from 'react'

type Props = {
  className?: string
  /** 宽度（高度自适应） */
  width?: number
  /** 是否加轻微漂浮动画 */
  animated?: boolean
}

/**
 * 原创玉桂狗气质 SVG 插画
 * 造型要点（参考用户提供的玉桂狗图片）：
 * - 全身雪白、棕色描边轮廓
 * - 标志性超大下垂长耳朵，像翅膀一样展开
 * - 蓝色椭圆大眼睛、粉色圆腮红、小嘴巴
 * - 肉桂卷一样的螺旋尾巴
 * - 趴坐姿势，前爪收起，圆润可爱
 *
 * 仅作为 Titia 个人主题使用，不对外分发或商业使用。
 */
export const CinnamorollMascot: React.FC<Props> = ({
  className = '',
  width = 200,
  animated = true,
}) => {
  return (
    <svg
      className={`${animated ? 'animate-cinnamoroll-float' : ''} ${className}`}
      width={width}
      viewBox="0 0 240 180"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="玉桂狗"
      role="img"
    >
      <defs>
        <linearGradient id="cinnEar" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FFF8F0" />
        </linearGradient>
        <linearGradient id="cinnBody" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FFF4EA" />
        </linearGradient>
        <filter id="cinnSoft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
          <feOffset dx="0" dy="2" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.15" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 左大耳朵：从脑后向左展开，边缘圆润 */}
      <path
        d="M88 82
           C60 55, 22 62, 12 90
           C6 108, 16 130, 44 132
           C64 134, 82 120, 90 104"
        fill="url(#cinnEar)"
        stroke="#C8A58D"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 右大耳朵：对称向右展开 */}
      <path
        d="M152 82
           C180 55, 218 62, 228 90
           C234 108, 224 130, 196 132
           C176 134, 158 120, 150 104"
        fill="url(#cinnEar)"
        stroke="#C8A58D"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 身体：圆润趴坐 */}
      <ellipse
        cx="120"
        cy="132"
        rx="52"
        ry="36"
        fill="url(#cinnBody)"
        stroke="#C8A58D"
        strokeWidth="3"
      />

      {/* 尾巴：肉桂卷螺旋 */}
      <path
        d="M168 132
           C184 122, 198 132, 192 148
           C188 158, 176 158, 172 150
           C168 144, 176 138, 182 142"
        fill="none"
        stroke="#C8A58D"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M168 132
           C184 122, 198 132, 192 148
           C188 158, 176 158, 172 150
           C168 144, 176 138, 182 142"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* 后脚 */}
      <ellipse cx="82" cy="160" rx="14" ry="10" fill="#FFFFFF" stroke="#C8A58D" strokeWidth="3" />
      <ellipse cx="158" cy="160" rx="14" ry="10" fill="#FFFFFF" stroke="#C8A58D" strokeWidth="3" />

      {/* 前爪 */}
      <ellipse cx="104" cy="150" rx="10" ry="14" fill="#FFFFFF" stroke="#C8A58D" strokeWidth="3" />
      <ellipse cx="136" cy="150" rx="10" ry="14" fill="#FFFFFF" stroke="#C8A58D" strokeWidth="3" />

      {/* 头部：略扁椭圆，大白脸 */}
      <ellipse
        cx="120"
        cy="88"
        rx="62"
        ry="46"
        fill="url(#cinnBody)"
        stroke="#C8A58D"
        strokeWidth="3"
      />

      {/* 腮红：粉色椭圆 */}
      <ellipse cx="76" cy="96" rx="10" ry="6" fill="#FFD6E0" opacity="0.9" />
      <ellipse cx="164" cy="96" rx="10" ry="6" fill="#FFD6E0" opacity="0.9" />

      {/* 眼睛：蓝色椭圆，带高光 */}
      <ellipse cx="96" cy="86" rx="7" ry="11" fill="#5BC7F0" />
      <ellipse cx="96" cy="82" rx="3" ry="4" fill="#FFFFFF" opacity="0.9" />
      <ellipse cx="144" cy="86" rx="7" ry="11" fill="#5BC7F0" />
      <ellipse cx="144" cy="82" rx="3" ry="4" fill="#FFFFFF" opacity="0.9" />

      {/* 嘴巴：小小 W 形 */}
      <path
        d="M114 98 Q120 104 126 98"
        fill="none"
        stroke="#C8A58D"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M116 96 L116 100 M124 96 L124 100"
        fill="none"
        stroke="#C8A58D"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <style>{`
        @keyframes cinnamoroll-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-cinnamoroll-float {
          animation: cinnamoroll-float 3.2s ease-in-out infinite;
        }
      `}</style>
    </svg>
  )
}
