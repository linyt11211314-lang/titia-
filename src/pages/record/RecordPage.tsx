import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { PageHost } from '../../components/nav/PageHost'
import { EmptyState } from '../../components/base/EmptyState'
import { MediaImage } from '../../components/base/MediaImage'
import { MediaPreview } from '../../components/base/MediaPreview'
import { SwipeRow } from '../../components/base/SwipeRow'
import { confirmSheet } from '../../components/base/Confirm'
import { useRecordStore } from '../../stores/useRecordStore'
import { useAppStore } from '../../stores/useAppStore'
import type { RecordEntity } from '../../db/types'

// 类型 → 图标 / 标签 / 强调色（设计文档 §二）
const TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  diary: { icon: '📔', label: '日记', color: 'var(--color-primary)' },
  pet_moment: { icon: '🐱', label: '我的憨憨', color: 'var(--color-accent)' },
  relation_touched: { icon: '❤️', label: '我们的时光', color: 'var(--color-primary)' },
  relation_conflict: { icon: '🌧', label: '矛盾复盘', color: 'var(--color-accent)' },
  life_event: { icon: '⭐', label: '人生事件', color: 'var(--color-highlight)' },
  spark: { icon: '💡', label: '灵光一闪', color: 'var(--color-highlight)' },
}

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'diary', label: '日记' },
  { key: 'pet_moment', label: '憨憨' },
  { key: 'relation_touched', label: '我们的时光' },
  { key: 'spark', label: '灵光一闪' },
] as const

// 按内容预估卡片高度，用于瀑布分栏
function estimateHeight(r: RecordEntity): number {
  let h = 76 // 图标行 + 内边距基线
  if (r.title) h += 22
  if (r.content) h += Math.min(r.content.length, 140) * 0.42
  if (r.mediaIds?.length) h += 92 // 图片行
  return h
}

function RecordCard({ r }: { r: RecordEntity }) {
  const meta = TYPE_META[r.type] ?? { icon: '📝', label: '记录', color: 'var(--color-ink-2)' }
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  return (
    <div className="rounded-card bg-surface shadow-card p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-base">{meta.icon}</span>
        <span className="text-xs font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="ml-auto text-xs text-ink-3">{dayjs(r.occurredAt).format('M月D日')}</span>
      </div>
      {r.title && <p className="font-semibold text-ink">{r.title}</p>}
      {r.content && <p className="mt-1 text-sm text-ink-2">{r.content}</p>}
      {r.mediaIds?.length ? (
        <div className="mt-2 flex gap-2 overflow-x-auto touch-manipulation">
          {r.mediaIds.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPreviewIdx(i)
              }}
              aria-label="查看图片"
              className="flex-shrink-0 p-0"
            >
              <MediaImage id={id} className="h-20 w-20 flex-shrink-0 rounded-img object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      {previewIdx !== null && (
        <MediaPreview ids={r.mediaIds!} initial={previewIdx} onClose={() => setPreviewIdx(null)} />
      )}
    </div>
  )
}

export function RecordPage() {
  const { records, loaded, load, removeRecord } = useRecordStore()
  const showToast = useAppStore((s) => s.showToast)
  const [filter, setFilter] = useState<string>('all')
  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  // 真·双列瀑布：贪心把每张卡放进当前较矮的一列，保持时间先后顺序的错落感
  const { left, right } = useMemo(() => {
    const list = filter === 'all' ? records : records.filter((r) => r.type === filter)
    const L: RecordEntity[] = []
    const R: RecordEntity[] = []
    const h = [0, 0]
    for (const r of list) {
      const eh = estimateHeight(r)
      if (h[0] <= h[1]) {
        L.push(r)
        h[0] += eh + 12
      } else {
        R.push(r)
        h[1] += eh + 12
      }
    }
    return { left: L, right: R }
  }, [records, filter])

  const onDelete = async (r: RecordEntity) => {
    if (await confirmSheet('删除记录', '这条记录将被删除，且不可恢复。')) {
      await removeRecord(r.id)
      showToast('已删除')
    }
  }

  return (
    <PageHost contentClassName="flex-1 overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y bg-bg px-5 pb-28 pt-[calc(var(--safe-top)+12px)]">
      <h1 className="mb-3 text-2xl font-semibold text-ink">记录</h1>

      {/* 筛选 Chips */}
      <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto touch-manipulation px-5">
        {FILTERS.map((f) => {
          const on = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 rounded-pill px-4 py-1.5 text-sm ${
                on ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {records.length === 0 ? (
        <EmptyState
          text="时间轴还是空的"
          action={
            <button onClick={() => (window.location.hash = '/space')} className="rounded-pill bg-primary px-4 py-2 text-sm text-bg">
              去添加
            </button>
          }
        />
      ) : left.length + right.length === 0 ? (
        <p className="px-1 text-sm text-ink-3">这个分类下还没有记录</p>
      ) : (
        <div className="grid grid-cols-2 items-start gap-3 fade-up">
          <div className="flex flex-col gap-3">
            {left.map((r) => (
              <SwipeRow key={r.id} onDelete={() => onDelete(r)}>
                <RecordCard r={r} />
              </SwipeRow>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {right.map((r) => (
              <SwipeRow key={r.id} onDelete={() => onDelete(r)}>
                <RecordCard r={r} />
              </SwipeRow>
            ))}
          </div>
        </div>
      )}
    </PageHost>
  )
}
