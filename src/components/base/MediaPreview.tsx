import { useEffect, useRef, useState } from 'react'
import { mediaRepo } from '../../db/repos'
import type { MediaEntity } from '../../db/types'
import { CloseIcon } from '../icons'

// Titia 时序 · MediaPreview（全屏图片预览）
// 支持：
//   · 同一记录多张图片左右滑动切换（swipe 翻页）；
//   · 下滑收起（跟手位移，松手超过阈值关闭）；
//   · 右上角淡色关闭按钮（低透明度，不抢画面）。
// 与待办/购物清单的「点击即完成」逻辑无关。

function useMediaUrl(id: string): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let obj: string | undefined
    let alive = true
    mediaRepo.get(id).then((m) => {
      const media = m as MediaEntity | undefined
      if (!alive) return
      if (media && media.blob) {
        obj = URL.createObjectURL(media.blob)
        setUrl(obj)
      }
    })
    return () => {
      alive = false
      if (obj) URL.revokeObjectURL(obj)
    }
  }, [id])
  return url
}

export function MediaPreview({
  ids,
  initial = 0,
  onClose,
}: {
  ids: string[]
  initial?: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(initial, 0), Math.max(ids.length - 1, 0)))
  const id = ids[index]
  const url = useMediaUrl(id)
  const [translate, setTranslate] = useState(0) // 下滑跟手位移
  const drag = useRef<{ sx: number; sy: number; mode: 'h' | 'v' | null; lastX: number } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    drag.current = { sx: t.clientX, sy: t.clientY, mode: null, lastX: t.clientX }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current
    if (!d) return
    const t = e.touches[0]
    const dx = t.clientX - d.sx
    const dy = t.clientY - d.sy
    if (!d.mode) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) d.mode = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
    }
    if (d.mode === 'v') {
      setTranslate(dy > 0 ? dy : 0) // 仅向下跟手
    } else if (d.mode === 'h') {
      d.lastX = t.clientX
    }
  }
  const onTouchEnd = () => {
    const d = drag.current
    drag.current = null
    if (d?.mode === 'v') {
      const dy = translate
      setTranslate(0)
      if (dy > 90) {
        onClose()
        return
      }
      return
    }
    if (d?.mode === 'h') {
      const dx = d.lastX - d.sx
      if (dx > 60 && index > 0) setIndex((i) => i - 1)
      else if (dx < -60 && index < ids.length - 1) setIndex((i) => i + 1)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/95"
      style={{
        transform: translate > 0 ? `translateY(${translate}px)` : undefined,
        transition: translate > 0 ? 'none' : 'transform 240ms cubic-bezier(.32,.72,0,1)',
        opacity: translate > 0 ? 1 - translate / 600 : 1,
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClick={onClose}
      role="dialog"
      aria-label="图片预览"
    >
      {/* 图片（纵向 contain；多图左右留白便于横滑） */}
      <div className="flex w-full flex-1 items-center justify-center">
        {url ? (
          <img
            src={url}
            alt=""
            className="max-h-full w-full object-contain"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p className="text-sm text-bg/60">加载中…</p>
        )}
      </div>
      {/* 底部：多图页码提示（轻量） */}
      {ids.length > 1 && (
        <p className="pb-10 pt-4 text-center text-xs text-bg/45">
          {index + 1} / {ids.length} · 左右滑动切换
        </p>
      )}
      {/* 右上角关闭按钮：实心半透深色圆底 + 白色叉，高对比度确保可发现
          安全区通过 top 定位偏移，而不是按钮内 padding（padding 会把图标挤出圆框中心） */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="关闭预览"
        className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-[2px] ring-1 ring-white/30"
        style={{ top: 'calc(var(--safe-top) + 16px)' }}
      >
        <CloseIcon width={22} height={22} />
      </button>
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-bg/25">下滑收起</p>
    </div>
  )
}
