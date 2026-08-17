import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { NavBar } from '../../components/nav/NavBar'
import { PageHost } from '../../components/nav/PageHost'
import { EmbeddedHeader } from '../../components/nav/EmbeddedHeader'
import { Card } from '../../components/base/Card'
import { EmptyState } from '../../components/base/EmptyState'
import { PlusIcon } from '../../components/icons'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput, TextArea, ChipSelect, DateInput } from '../../components/base/fields'
import { ImagePicker } from '../../components/base/ImagePicker'
import { MediaImage } from '../../components/base/MediaImage'
import { MediaPreview } from '../../components/base/MediaPreview'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useAppStore } from '../../stores/useAppStore'
import { mediaRepo } from '../../db/repos'
import { compressImage } from '../../services/media'
import { usePetStore } from '../../stores/usePetStore'
import { useRecordStore } from '../../stores/useRecordStore'
import type { PetEntity, PetHealthEntity, RecordEntity } from '../../db/types'
import { SwipeRow } from '../../components/base/SwipeRow'

function ageFrom(birthday?: string): string {
  if (!birthday) return ''
  const years = dayjs().diff(dayjs(birthday), 'year', true)
  if (years < 1) return `${Math.round(years * 12)} 个月`
  return `${years.toFixed(1)} 岁`
}

const GENDERS = [
  { key: 'unknown', label: '未知' },
  { key: 'boy', label: '男孩' },
  { key: 'girl', label: '女孩' },
] as const

// 体重趋势迷你折线（纯 SVG，无需图表库）
function WeightSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 120
  const h = 36
  const pad = 4
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values
    .map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (values.length - 1)
      const y = h - pad - ((v - min) / range) * (h - 2 * pad)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// 宠物档案表单（自带 state）
function PetForm({
  initial,
  onSave,
}: {
  initial: { name: string; gender: 'unknown' | 'boy' | 'girl'; breed: string; birthday: string; avatarMediaId?: string }
  onSave: (d: { name: string; gender: 'unknown' | 'boy' | 'girl'; breed: string; birthday: string; avatarMediaId?: string }) => void
}) {
  const [d, setD] = useState(initial)
  return (
    <div>
      <Field label="头像（可空）">
        <ImagePicker
          mediaIds={d.avatarMediaId ? [d.avatarMediaId] : []}
          onChange={(ids) => setD({ ...d, avatarMediaId: ids[0] ?? '' })}
        />
      </Field>
      <Field label="名字">
        <TextInput value={d.name} onChange={(v) => setD({ ...d, name: v })} placeholder="昵称" />
      </Field>
      <Field label="性别">
        <ChipSelect options={[...GENDERS]} value={d.gender} onChange={(v) => setD({ ...d, gender: v })} />
      </Field>
      <Field label="品种（可空）">
        <TextInput value={d.breed} onChange={(v) => setD({ ...d, breed: v })} placeholder="如 英短" />
      </Field>
      <Field label="生日（可空）">
        <DateInput value={d.birthday} onChange={(v) => setD({ ...d, birthday: v })} />
      </Field>
      <button onClick={() => onSave(d)} className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg">
        保存
      </button>
    </div>
  )
}

// 成长记录表单（自带 state + 图片）
function MomentForm({
  initial,
  onSave,
}: {
  initial: { title: string; content: string; mediaIds: string[] }
  onSave: (d: { title: string; content: string; mediaIds: string[] }) => void
}) {
  const [d, setD] = useState(initial)
  return (
    <div>
      <Field label="标题（可空）">
        <TextInput value={d.title} onChange={(v) => setD({ ...d, title: v })} placeholder="这一刻的标题" />
      </Field>
      <Field label="写点什么">
        <TextArea value={d.content} onChange={(v) => setD({ ...d, content: v })} rows={3} />
      </Field>
      <Field label="图片（可空）">
        <ImagePicker mediaIds={d.mediaIds} onChange={(ids) => setD({ ...d, mediaIds: ids })} />
      </Field>
      <button onClick={() => onSave(d)} className="pressable mt-2 w-full rounded-pill bg-highlight px-4 py-2.5 text-sm text-bg">
        保存
      </button>
    </div>
  )
}

// 健康记录表单（自带 state + 支持编辑回填）
function HealthForm({
  initial,
  onSave,
}: {
  initial?: { kind: 'weight' | 'vaccine' | 'medicine'; name: string; value: string; date: string }
  onSave: (d: { kind: 'weight' | 'vaccine' | 'medicine'; name: string; value: string; date: string }) => void
}) {
  const [d, setD] = useState<{ kind: 'weight' | 'vaccine' | 'medicine'; name: string; value: string; date: string }>(
    initial ?? { kind: 'weight', name: '', value: '', date: dayjs().format('YYYY-MM-DD') },
  )
  return (
    <div>
      <Field label="类型">
        <ChipSelect
          options={[
            { key: 'weight', label: '体重' },
            { key: 'vaccine', label: '疫苗' },
            { key: 'medicine', label: '用药' },
          ]}
          value={d.kind}
          onChange={(v) => setD({ ...d, kind: v })}
        />
      </Field>
      <Field label="名称 / 药名（可空）">
        <TextInput value={d.name} onChange={(v) => setD({ ...d, name: v })} placeholder="如 体内驱虫" />
      </Field>
      <Field label="数值 kg（可空）">
        <TextInput value={d.value} onChange={(v) => setD({ ...d, value: v })} placeholder="如 4.2" />
      </Field>
      <Field label="日期">
        <DateInput value={d.date} onChange={(v) => setD({ ...d, date: v })} />
      </Field>
      <button onClick={() => onSave(d)} className="pressable mt-2 w-full rounded-pill bg-accent px-4 py-2.5 text-sm text-bg">
        保存
      </button>
    </div>
  )
}

// 体重模块：迷你趋势 + 记录列表
function WeightSection({
  weights,
  onAdd,
  onEdit,
  onDelete,
}: {
  weights: PetHealthEntity[]
  onAdd: () => void
  onEdit: (h: PetHealthEntity) => void
  onDelete: (h: PetHealthEntity) => void
}) {
  const values = weights.map((w) => Number(w.value))
  const latest = weights[weights.length - 1]
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">体重</h2>
        <button
          onClick={onAdd}
          className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-accent text-bg"
          aria-label="记录体重"
        >
          <PlusIcon width={18} height={18} />
        </button>
      </div>
      {weights.length === 0 ? (
        <EmptyState
          text="还没有体重记录"
          action={
            <button onClick={onAdd} className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">
              记一笔
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="rounded-card bg-surface p-4 shadow-soft">
            <WeightSparkline values={values} />
            <p className="mt-1 text-xs text-ink-3">
              共 {weights.length} 条 · 最新 {latest.value}kg（{latest.date}）
            </p>
          </div>
          {[...weights].reverse().map((w) => (
            <SwipeRow key={w.id} onDelete={() => onDelete(w)} onPress={() => onEdit(w)}>
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-ink">{w.value} kg</p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {w.date}
                    {w.name ? ` · ${w.name}` : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(w)
                  }}
                  className="text-xs text-ink-3"
                >
                  删除
                </button>
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
    </section>
  )
}

// Titia 时序 · 我的憨憨（Sheet 表单闭环）
export function PetPage({ embedded = false }: { embedded?: boolean }) {
  const { pets, loaded, load, createPet, updatePet, removePet, loadHealth, health, addHealth, updateHealth, removeHealth } =
    usePetStore()
  const { records, createRecord, updateRecord, removeRecord } = useRecordStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)

  const [petId, setPetId] = useState<string | null>(null)
  // 憨憨页入口视图：home（资料+横向入口）/ moment / weight / health
  const [section, setSection] = useState<'home' | 'moment' | 'weight' | 'health'>('home')
  // 憨憨封面图（localStorage 独立键 titia.petCover.<petId>，不影响数据层）
  const [coverMediaId, setCoverMediaId] = useState('')
  const coverInputRef = useRef<HTMLInputElement>(null)
  // 成长时光图片预览（点图打开全屏预览，删除走缩略图右上角 ×）
  const [preview, setPreview] = useState<{ ids: string[]; initial: number } | null>(null)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  useEffect(() => {
    if (pets.length && !petId) setPetId(pets[0].id)
  }, [pets, petId])

  // 当前宠物的封面图（petId 变化时重读）
  useEffect(() => {
    if (!petId) return
    const key = `titia.petCover.${petId}`
    try {
      setCoverMediaId(localStorage.getItem(key) || '')
    } catch {
      setCoverMediaId('')
    }
  }, [petId])

  useEffect(() => {
    if (petId) loadHealth(petId)
  }, [petId, loadHealth])

  if (pets.length === 0) {
    const empty = (
      <>
        {embedded && <EmbeddedHeader title="我的憨憨" />}
        <EmptyState
          text="还没有毛孩子，添加第一只吧"
          action={
            <button onClick={() => openPetForm(null)} className="rounded-pill bg-highlight px-4 py-2 text-sm text-bg">
              添加宠物
            </button>
          }
        />
      </>
    )
    if (embedded) return empty
    return (
      <>
        <NavBar title="我的憨憨" />
        <PageHost>{empty}</PageHost>
      </>
    )
  }

  const pet = pets.find((p) => p.id === petId) ?? pets[0]
  const moments = records.filter((r) => r.type === 'pet_moment' && r.refId === pet.id)
  const petHealth = health.filter((h) => h.petId === pet.id)

  // 憨憨封面图：coverKey 由当前宠物 id 决定（hooks 已上移到顶部，此处仅 handler）
  const coverKey = `titia.petCover.${pet.id}`
  const onUploadCover = async (file: File) => {
    try {
      const img = await compressImage(file)
      const id = crypto.randomUUID()
      await mediaRepo.create({
        id,
        blob: img.blob,
        thumb: img.thumb,
        mime: img.mime,
        width: img.width,
        height: img.height,
        size: img.size,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        _dirty: 1,
        _syncedAt: null,
      } as Parameters<typeof mediaRepo.create>[0])
      if (coverMediaId) {
        try {
          await mediaRepo.remove(coverMediaId)
        } catch {
          /* 忽略 */
        }
      }
      try {
        localStorage.setItem(coverKey, id)
      } catch {
        /* 忽略 */
      }
      setCoverMediaId(id)
      showToast('封面已更新')
    } catch {
      showToast('图片处理失败')
    }
  }
  const onRemoveCover = async () => {
    if (!coverMediaId) return
    try {
      await mediaRepo.remove(coverMediaId)
    } catch {
      /* 忽略 */
    }
    try {
      localStorage.removeItem(coverKey)
    } catch {
      /* 忽略 */
    }
    setCoverMediaId('')
    showToast('封面已移除')
  }

  function openPetForm(editing: PetEntity | null) {
    open(
      <Sheet title={editing ? '编辑宠物' : '添加宠物'} onClose={close}>
        <PetForm
          initial={{
            name: editing?.name ?? '',
            gender: editing?.gender ?? 'unknown',
            breed: editing?.breed ?? '',
            birthday: editing?.birthday ?? '',
            avatarMediaId: editing?.avatarMediaId,
          }}
          onSave={async (d) => {
            if (!d.name.trim()) return
            if (editing) {
              await updatePet(editing.id, {
                name: d.name.trim(),
                gender: d.gender,
                breed: d.breed.trim() || undefined,
                birthday: d.birthday.trim() || undefined,
                avatarMediaId: d.avatarMediaId || undefined,
              })
              showToast('已更新')
            } else {
              await createPet({
                name: d.name.trim(),
                gender: d.gender,
                breed: d.breed.trim() || undefined,
                birthday: d.birthday.trim() || undefined,
                avatarMediaId: d.avatarMediaId || undefined,
                order: 0,
              })
              showToast('已添加')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }

  function openMomentForm(editing: RecordEntity | null) {
    open(
      <Sheet title={editing ? '编辑成长记录' : '成长时光'} onClose={close}>
        <MomentForm
          initial={{
            title: editing?.title ?? '',
            content: editing?.content ?? '',
            mediaIds: editing?.mediaIds ?? [],
          }}
          onSave={async (d) => {
            if (!d.content.trim() && !d.title.trim()) return
            if (editing) {
              await updateRecord(editing.id, {
                title: d.title.trim() || undefined,
                content: d.content.trim() || undefined,
                mediaIds: d.mediaIds,
              })
              showToast('已更新')
            } else {
              await createRecord('pet_moment', {
                title: d.title.trim() || undefined,
                content: d.content.trim() || undefined,
                refType: 'pet',
                refId: pet.id,
                mediaIds: d.mediaIds,
                payload: { isMilestone: false },
              })
              showToast('已记录')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }

  function openHealthForm(editing: PetHealthEntity | null) {
    open(
      <Sheet title={editing ? '编辑健康记录' : '健康记录'} onClose={close}>
        <HealthForm
          initial={
            editing
              ? { kind: editing.kind, name: editing.name ?? '', value: editing.value != null ? String(editing.value) : '', date: editing.date }
              : undefined
          }
          onSave={async (d) => {
            const value = d.value ? Number(d.value) : undefined
            if (editing) {
              await updateHealth(editing.id, {
                kind: d.kind,
                name: d.name.trim() || undefined,
                value,
                date: d.date,
              })
              showToast('已更新')
            } else {
              await addHealth({
                petId: pet.id,
                kind: d.kind,
                name: d.name.trim() || undefined,
                value,
                date: d.date,
              })
              showToast('已添加')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }

  const onDeleteMoment = async (m: RecordEntity) => {
    if (await confirmSheet('删除记录', '这条成长记录将被删除，且不可恢复。')) {
      await removeRecord(m.id)
      showToast('已删除')
    }
  }
  const onDeleteHealth = async (h: PetHealthEntity) => {
    if (await confirmSheet('删除健康记录', '这条健康记录将被删除，且不可恢复。')) {
      await removeHealth(h.id)
      showToast('已删除')
    }
  }
  const onDeletePet = async (p: PetEntity) => {
    if (await confirmSheet('删除宠物', `删除宠物「${p.name}」？相关记录也会一并删除。`)) {
      await removePet(p.id)
      setPetId(null)
      showToast('已删除')
    }
  }

  const content = (
    <>
      {embedded && (
        <EmbeddedHeader
          title="我的憨憨"
          right={
            <button
              onClick={() => openPetForm(pet)}
              className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg"
            >
              编辑
            </button>
          }
        />
      )}

      {section === 'home' ? (
        <>
<Card variant="stat" motif onPress={() => openPetForm(pet)} className="fade-up">
          <div className="p-5">
            <div className="flex items-center gap-4">
              {pet.avatarMediaId ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPreview({ ids: [pet.avatarMediaId], initial: 0 })
                  }}
                  className="block h-16 w-16 flex-shrink-0 rounded-[20px] p-0"
                  aria-label="预览头像"
                >
                  <MediaImage id={pet.avatarMediaId} className="h-16 w-16 flex-shrink-0 rounded-[20px] object-cover" />
                </button>
              ) : (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[20px] bg-highlight-soft text-3xl">🐱</div>
              )}
              <div className="flex-1">
                <p className="text-xl font-semibold text-ink">{pet.name}</p>
                <p className="mt-0.5 text-sm text-ink-2">
                  {[pet.breed, pet.gender === 'boy' ? '男孩' : pet.gender === 'girl' ? '女孩' : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {pet.birthday
                    ? `生日 ${pet.birthday}`
                    : ageFrom(pet.birthday)
                      ? `年龄 ${ageFrom(pet.birthday)}`
                      : '点击编辑资料'}
                </p>
              </div>
            </div>
          </div>
        </Card>

          {pets.length > 1 && (
            <div className="my-3 flex gap-2 overflow-x-auto touch-manipulation">
              {pets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPetId(p.id)}
                  className={`rounded-pill px-3 py-1.5 text-sm ${p.id === pet.id ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* 横向等宽入口：成长时光 / 体重 / 健康记录 */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { key: 'moment', label: '成长时光', icon: '📸' },
              { key: 'weight', label: '体重', icon: '⚖️' },
              { key: 'health', label: '健康记录', icon: '💊' },
            ].map((e) => (
              <button
                key={e.key}
                onClick={() => setSection(e.key as 'moment' | 'weight' | 'health')}
                className="pressable flex flex-col items-center gap-1.5 rounded-card bg-surface p-4 shadow-soft"
              >
                <span className="text-2xl leading-none">{e.icon}</span>
                <span className="text-sm text-ink">{e.label}</span>
              </button>
            ))}
          </div>

          <button onClick={() => onDeletePet(pet)} className="mt-3 w-full py-2 text-xs text-ink-3">
            删除宠物
          </button>

          {/* 憨憨封面图（大窗格预览，放页面底部） */}
          <section className="mt-4 rounded-card bg-surface p-3 shadow-soft">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-ink">相册封面</p>
              <div className="flex items-center gap-2">
                {coverMediaId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="rounded-pill bg-surface-sunken px-3 py-1 text-xs text-ink-2"
                    >
                      替换
                    </button>
                    <button
                      type="button"
                      onClick={onRemoveCover}
                      className="rounded-pill bg-surface-sunken px-3 py-1 text-xs text-ink-3"
                    >
                      移除
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="rounded-pill bg-primary px-3 py-1 text-xs text-bg"
                  >
                    上传图片
                  </button>
                )}
              </div>
            </div>
            {coverMediaId ? (
              <button
                type="button"
                onClick={() => setPreview({ ids: [coverMediaId], initial: 0 })}
                className="block h-56 w-full rounded-btn p-0"
                aria-label="预览封面"
              >
                <MediaImage id={coverMediaId} className="h-56 w-full rounded-btn object-cover" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="flex h-56 w-full flex-col items-center justify-center gap-1.5 rounded-btn bg-surface-sunken/60 text-ink-3"
              >
                <span className="text-3xl leading-none">📷</span>
                <span className="text-xs">点击上传憨憨封面图</span>
                <span className="text-[10px] text-ink-3/80">支持 JPG / PNG，自动压缩</span>
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUploadCover(f)
                e.target.value = ''
              }}
            />
          </section>
        </>
      ) : (
        <>
          <button
            onClick={() => setSection('home')}
            className="mb-3 flex items-center gap-1 rounded-card bg-surface-sunken px-4 py-2 text-sm text-primary"
          >
            ‹ 返回资料
          </button>

          {section === 'moment' && (
            <section className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">成长时光</h2>
                <button
                  onClick={() => openMomentForm(null)}
                  className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-highlight text-bg"
                  aria-label="新增成长记录"
                >
                  <PlusIcon width={18} height={18} />
                </button>
              </div>
              {moments.length === 0 ? (
                <EmptyState
                  text="还没有成长记录"
                  action={
                    <button onClick={() => openMomentForm(null)} className="rounded-pill bg-highlight-soft px-4 py-2 text-sm text-ink-2">
                      添加第一条
                    </button>
                  }
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {moments.map((m) => (
                    <SwipeRow key={m.id} onDelete={() => onDeleteMoment(m)} onPress={() => openMomentForm(m)}>
                      <div className="p-4">
                        {m.title && <p className="font-medium text-ink">{m.title}</p>}
                        {m.content && <p className="mt-1 text-sm text-ink-2">{m.content}</p>}
                        {m.mediaIds?.length ? (
                          <div className="mt-2 flex gap-2 overflow-x-auto touch-manipulation">
                            {m.mediaIds.map((id, idx) => (
                              <div key={id} className="relative h-20 w-20 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setPreview({ ids: m.mediaIds!, initial: idx })
                                  }}
                                  className="pressable h-20 w-20 overflow-hidden rounded-img"
                                  aria-label="预览图片"
                                >
                                  <MediaImage id={id} className="h-20 w-20 rounded-img object-cover" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    if (await confirmSheet('删除图片', '确定删除这张图片吗？此操作不可恢复。')) {
                                      await mediaRepo.remove(id)
                                      await updateRecord(m.id, { mediaIds: m.mediaIds!.filter((x) => x !== id) })
                                    }
                                  }}
                                  className="pressable absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-xs leading-none text-white"
                                  aria-label="删除图片"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-ink-3">{dayjs(m.occurredAt).format('YYYY-MM-DD')}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteMoment(m)
                            }}
                            className="text-xs text-ink-3"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </SwipeRow>
                  ))}
                </div>
              )}
            </section>
          )}

          {section === 'weight' && (
            <WeightSection
              weights={petHealth
                .filter((h) => h.kind === 'weight' && h.value != null)
                .sort((a, b) => a.date.localeCompare(b.date))}
              onAdd={() => openHealthForm(null)}
              onEdit={(h) => openHealthForm(h)}
              onDelete={onDeleteHealth}
            />
          )}

          {section === 'health' && (
            <section className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">健康记录</h2>
                <button
                  onClick={() => openHealthForm(null)}
                  className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-accent text-bg"
                  aria-label="新增健康记录"
                >
                  <PlusIcon width={18} height={18} />
                </button>
              </div>
              {petHealth.filter((h) => h.kind !== 'weight').length === 0 ? (
                <EmptyState text="还没有健康记录" action={<span className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">添加第一条</span>} />
              ) : (
                <div className="flex flex-col gap-2">
                  {petHealth
                    .filter((h) => h.kind !== 'weight')
                    .map((h) => (
                      <SwipeRow key={h.id} onDelete={() => onDeleteHealth(h)} onPress={() => openHealthForm(h)}>
                        <div className="flex items-center justify-between p-4">
                          <div>
                            <p className="text-ink">
                              {h.kind === 'vaccine' ? '疫苗' : '用药'}
                              {h.value ? ` ${h.value}kg` : ''}
                              {h.name ? ` · ${h.name}` : ''}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-3">{h.date}</p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteHealth(h)
                            }}
                            className="text-xs text-ink-3"
                          >
                            删除
                          </button>
                        </div>
                      </SwipeRow>
                    ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  )

  if (embedded) return content
  return (
    <>
      <NavBar title="我的憨憨" right={<button onClick={() => openPetForm(pet)} className="text-sm text-primary">编辑</button>} />
      <PageHost>{content}</PageHost>
      {preview && (
        <MediaPreview ids={preview.ids} initial={preview.initial} onClose={() => setPreview(null)} />
      )}
    </>
  )
}
