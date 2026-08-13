import type { ReactNode } from 'react'
import { MotifMark } from './MotifMark'

// Titia 时序 · EmptyState
// 铁律：action 为必填（添加入口），缺失则调用方编译不通过，禁止纯空白。
// 角色皮肤下额外顶一枚淡色 motif 填补留白；基础色皮肤不渲染，布局与从前完全一致。

interface EmptyStateProps {
  text: string
  action: ReactNode // 必须为添加入口（按钮）
  /** 可选插画：传了则替代 MotifMark 角色皮肤占位（玉桂狗/其他角色素材） */
  image?: string
}

export function EmptyState({ text, action, image }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      {image ? (
        <img src={image} alt="" className="h-32 w-32 object-contain" />
      ) : (
        <MotifMark size={64} />
      )}
      <p className="text-ink-2">{text}</p>
      {action}
    </div>
  )
}
