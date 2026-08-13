import { useRef } from 'react'
import { compressImage } from '../../services/media'
import { mediaRepo } from '../../db/repos'
import { MediaImage } from './MediaImage'
import { useAppStore } from '../../stores/useAppStore'

// Titia 时序 · ImagePicker
// 选图 → 压缩 → 存 media 表 → 回传 id 列表；可移除已选图片。
// 用于各记录类模块的图片上传（憨憨/日记/我们的时光/灵光等）。

export function ImagePicker({
  mediaIds,
  onChange,
}: {
  mediaIds: string[]
  onChange: (ids: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const showToast = useAppStore((s) => s.showToast)

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    let ids = [...mediaIds]
    for (const f of Array.from(files)) {
      const { blob, thumb, mime, width, height, size } = await compressImage(f)
      const m = await mediaRepo.create({
        blob,
        thumb,
        mime,
        width,
        height,
        size,
      } as Omit<import('../../db/types').MediaEntity, keyof import('../../db/types').MediaEntity>)
      ids = [...ids, m.id]
    }
    onChange(ids)
    showToast('图片已添加')
    e.target.value = ''
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {mediaIds.map((id) => (
          <div key={id} className="relative">
            <MediaImage id={id} className="h-20 w-20 rounded-img object-cover" />
            <button
              onClick={() => onChange(mediaIds.filter((x) => x !== id))}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-pill bg-ink text-xs text-bg"
              aria-label="移除图片"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-20 items-center justify-center rounded-img bg-surface-sunken text-2xl text-ink-3"
          aria-label="添加图片"
        >
          ＋
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={pick} />
    </div>
  )
}
