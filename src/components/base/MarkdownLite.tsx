// Titia 时序 · 轻量 Markdown 渲染（零依赖）
// 仅覆盖小 D 老师 AI 输出实际用到的语法：#/##/### 标题、> 引用、-/* 列表、1. 有序列表、
// **加粗**、段落与换行。无需引入 markdown 库，避免打包体积膨胀。

import { type ReactNode } from 'react'

/** 行内：把 **加粗** 转成 <strong> */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // 标题
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const cls =
        level === 1
          ? 'mt-3 text-base font-bold text-ink'
          : level === 2
            ? 'mt-3 text-sm font-bold text-ink'
            : 'mt-2 text-[13px] font-semibold text-ink-2'
      blocks.push(
        <p key={key++} className={cls}>
          {renderInline(h[2])}
        </p>,
      )
      i++
      continue
    }

    // 引用块（连续 > 行）
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-2 border-l-2 border-primary/50 bg-surface-sunken/60 px-3 py-2 text-[13px] leading-relaxed text-ink-2"
        >
          {renderInline(buf.join('\n'))}
        </blockquote>,
      )
      continue
    }

    // 无序列表（连续 - / * 行）
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="my-1 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // 有序列表（连续 数字. 行）
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={key++} className="my-1 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-ink">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // 空行：跳过
    if (line.trim() === '') {
      i++
      continue
    }

    // 普通段落：聚合到下一个空行/特殊行
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key++} className="my-1 text-[13px] leading-relaxed text-ink">
        {renderInline(para.join('\n'))}
      </p>,
    )
  }

  return <div className="space-y-0.5">{blocks}</div>
}
