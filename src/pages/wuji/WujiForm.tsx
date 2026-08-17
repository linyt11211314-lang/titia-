import { useRef, useState } from 'react'
import { Field, TextInput, TextArea, DateInput, ChipSelect } from '../../components/base/fields'
import { WUJI_CATEGORIES, WUJI_STATUS, todayStr } from './wujiUtils'
import type { WujiItemRow, WujiCategory, WujiStatus } from '../../db/types'
import type { WujiInput } from '../../stores/useWujiStore'

interface WujiFormProps {
  initial?: WujiItemRow
  onSubmit: (data: WujiInput) => void
  submitLabel?: string
}

export function WujiForm({ initial, onSubmit, submitLabel = '保存' }: WujiFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<WujiCategory>(initial?.category ?? 'digital')
  const [buyPrice, setBuyPrice] = useState(initial ? String(initial.buyPrice) : '')
  const [buyDate, setBuyDate] = useState(initial?.buyDate ?? todayStr())
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [expectedYears, setExpectedYears] = useState(
    initial ? String(initial.expectedYears) : '3',
  )
  const [status, setStatus] = useState<WujiStatus>(initial?.status ?? 'active')
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? [])
  const [sellPrice, setSellPrice] = useState(
    initial?.sellPrice != null ? String(initial.sellPrice) : '',
  )
  const [sellDate, setSellDate] = useState(initial?.sellDate ?? todayStr())

  const fileRef = useRef<HTMLInputElement>(null)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)

  const toNum = (s: string) => {
    const n = parseFloat(s)
    return Number.isNaN(n) ? 0 : n
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const room = 3 - photos.length
    files.slice(0, room).forEach((f) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPhotos((prev) => (prev.length < 3 ? [...prev, reader.result as string] : prev))
        }
      }
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  const canSave =
    name.trim() !== '' && buyPrice.trim() !== '' && toNum(buyPrice) > 0

  const handleSubmit = () => {
    if (!canSave) return
    const data: WujiInput = {
      name: name.trim(),
      category,
      buyPrice: toNum(buyPrice),
      buyDate,
      brand: brand.trim() || undefined,
      note: note.trim() || undefined,
      expectedYears: Math.max(0.1, toNum(expectedYears) || 3),
      status,
      photos: photos.length ? photos : undefined,
      sellPrice:
        status === 'sold' && sellPrice.trim() !== '' ? toNum(sellPrice) : undefined,
      sellDate: status === 'sold' ? sellDate : undefined,
    }
    onSubmit(data)
  }

  return (
    <div>
      <Field label="物品名称 *">
        <TextInput value={name} onChange={setName} placeholder="如：iPhone 15 Pro" />
      </Field>

      <Field label="物品分类 *">
        <ChipSelect options={WUJI_CATEGORIES} value={category} onChange={setCategory} />
      </Field>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Field label="买入价格（元）*">
          <TextInput value={buyPrice} onChange={setBuyPrice} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="买入日期 *">
          <DateInput value={buyDate} onChange={setBuyDate} />
        </Field>
      </div>

      <Field label="品牌 / 型号">
        <TextInput value={brand} onChange={setBrand} placeholder="如：Apple / A2590" />
      </Field>

      <Field label="预期使用年限（年）">
        <TextInput value={expectedYears} onChange={setExpectedYears} inputMode="decimal" placeholder="3" />
      </Field>

      <Field label="备注">
        <TextArea value={note} onChange={setNote} placeholder="购买渠道、使用感受…" />
      </Field>

      <Field label={`物品照片（最多 3 张）`}>
        <div className="flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <div
              key={i}
              className="relative h-20 w-20 overflow-hidden rounded-btn bg-surface-sunken"
            >
              <button
                type="button"
                onClick={() => setPreviewIdx(i)}
                className="block h-full w-full p-0"
                aria-label="预览照片"
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                className="pressable absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-xs text-white"
                aria-label="删除照片"
              >
                ×
              </button>
            </div>
          ))}
          {photos.length < 3 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="pressable flex h-20 w-20 flex-col items-center justify-center rounded-btn border border-dashed border-line text-ink-3"
            >
              <span className="text-2xl">＋</span>
              <span className="text-xs">添加</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
        </div>
      </Field>

      <Field label="状态">
        <ChipSelect options={WUJI_STATUS} value={status} onChange={setStatus} />
      </Field>

      {status === 'sold' && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="卖出价格（元）">
            <TextInput value={sellPrice} onChange={setSellPrice} inputMode="decimal" placeholder="0" />
          </Field>
          <Field label="卖出日期">
            <DateInput value={sellDate} onChange={setSellDate} />
          </Field>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSave}
        className="pressable mt-2 w-full rounded-pill bg-primary py-3 text-center font-semibold text-bg disabled:opacity-40"
      >
        {submitLabel}
      </button>
      {/* 照片全屏预览（photos 为 base64 dataURL，直接用 src 预览） */}
      {previewIdx !== null && photos[previewIdx] != null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95"
          onClick={() => setPreviewIdx(null)}
          role="dialog"
          aria-label="照片预览"
        >
          <img
            src={photos[previewIdx]}
            alt=""
            className="max-h-full w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              setPreviewIdx(null)
            }}
            aria-label="关闭预览"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/30"
            style={{ paddingTop: 'var(--safe-top)' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
