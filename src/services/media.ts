// Titia 时序 · media 服务
// 选图 → Canvas 压缩（长边≤1600 q=.8 原图 + 长边320 缩略图）→ 返回 Blob。
// 手写压缩，不引第三方库（文档刻意不引入图片压缩库）。
import { db } from '../db/schema'

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve(img)
      URL.revokeObjectURL(url)
    }
    img.onerror = reject
    img.src = url
  })
}

function scaledSize(img: HTMLImageElement, maxLong: number) {
  let { width, height } = img
  const long = Math.max(width, height)
  if (long > maxLong) {
    const r = maxLong / long
    width = Math.round(width * r)
    height = Math.round(height * r)
  }
  return { width, height }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, q)
  })
}

export interface CompressedImage {
  blob: Blob
  thumb: Blob
  mime: string
  width: number
  height: number
  size: number
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const img = await loadImage(file)

  const main = scaledSize(img, 1600)
  const c = document.createElement('canvas')
  c.width = main.width
  c.height = main.height
  c.getContext('2d')!.drawImage(img, 0, 0, main.width, main.height)
  const blob = await toBlob(c, 'image/jpeg', 0.8)

  const t = scaledSize(img, 320)
  const tc = document.createElement('canvas')
  tc.width = t.width
  tc.height = t.height
  tc.getContext('2d')!.drawImage(img, 0, 0, t.width, t.height)
  const thumb = await toBlob(tc, 'image/jpeg', 0.8)

  return { blob, thumb, mime: 'image/jpeg', width: main.width, height: main.height, size: blob.size }
}

// 回收孤儿图片：未被任何记录/宠物/人物/账单/设置引用的 media 行删除。
// 典型场景：Sheet 取消后、记录删除后留下的已上传但未关联（或已失联）的 Blob。
export async function purgeOrphanMedia(): Promise<number> {
  const dbAny = db as unknown as {
    records: { toArray: () => Promise<Record<string, unknown>[]> }
    pets: { toArray: () => Promise<Record<string, unknown>[]> }
    people: { toArray: () => Promise<Record<string, unknown>[]> }
    transactions: { toArray: () => Promise<Record<string, unknown>[]> }
    settings: { toArray: () => Promise<Record<string, unknown>[]> }
    media: { toArray: () => Promise<Record<string, unknown>[]>; delete: (id: string) => Promise<void> }
  }
  const [records, pets, people, transactions, settings, media] = await Promise.all([
    dbAny.records.toArray(),
    dbAny.pets.toArray(),
    dbAny.people.toArray(),
    dbAny.transactions.toArray(),
    dbAny.settings.toArray(),
    dbAny.media.toArray(),
  ])

  const referenced = new Set<string>()
  const collect = (v: unknown) => {
    if (typeof v === 'string' && v) referenced.add(v)
  }
  for (const r of records) {
    if (Array.isArray(r.mediaIds)) (r.mediaIds as unknown[]).forEach(collect)
    collect(r.avatarMediaId)
  }
  for (const p of pets) collect(p.avatarMediaId)
  for (const p of people) collect(p.avatarMediaId)
  for (const t of transactions) {
    if (Array.isArray(t.mediaIds)) (t.mediaIds as unknown[]).forEach(collect)
  }
  for (const s of settings) {
    const profile = (s.profile as { avatarMediaId?: string } | undefined) || {}
    collect(profile.avatarMediaId)
  }

  let removed = 0
  for (const m of media) {
    if (!referenced.has(m.id as string)) {
      await dbAny.media.delete(m.id as string)
      removed++
    }
  }
  return removed
}
