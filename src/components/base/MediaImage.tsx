import { useEffect, useState } from 'react'
import { mediaRepo } from '../../db/repos'
import type { MediaEntity } from '../../db/types'

// Titia 时序 · MediaImage
// 按 media id 从 IndexedDB 取 Blob → objectURL 显示。加载前显示占位块。

export function MediaImage({ id, className = '' }: { id: string; className?: string }) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let obj: string | undefined
    mediaRepo.get(id).then((m) => {
      const media = m as MediaEntity | undefined
      if (media && media.blob) {
        obj = URL.createObjectURL(media.blob)
        setUrl(obj)
      }
    })
    return () => {
      if (obj) URL.revokeObjectURL(obj)
    }
  }, [id])

  if (!url) return <div className={`bg-surface-sunken ${className}`} />
  return <img src={url} className={className} alt="" />
}
