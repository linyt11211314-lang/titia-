import { useEffect, useRef, useState } from 'react'
import { NavBar } from '../../components/nav/NavBar'
import { PageHost } from '../../components/nav/PageHost'
import { applySkin, applySkinTo, buildCustomSkin, type Skin } from '../../theme/skins'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useAppStore } from '../../stores/useAppStore'
import {
  SWATCH_GROUPS,
  getCustomSkins,
  saveCustomSkin,
  deleteCustomSkin,
} from '../../services/customSkins'
import {
  getPresetSkins,
  savePresetSkin,
  deletePresetSkin,
  resetPresetSkins,
} from '../../services/skinPresets'
import { confirmSheet } from '../../components/base/Confirm'
import { CatMascot } from '../../components/cat/CatMascot'

// Titia 时序 · 主题中心（全局换肤入口）
// 选择皮肤 / 深浅模式后即时全局生效，并保存在本机。
// 分两组数据：预设皮肤（出厂内置，来自后端 presetSkins 表 / SKINS 种子，可点选 / 编辑 / 删除 / 重置）
// + 用户自定义主题（可创建 / 删除）。自定义主题：选一个主色 → 算法自动派生整套配色，实时预览全局。

export function ThemePage() {
  const skin = useSettingsStore((s) => s.skin)
  const setSkin = useSettingsStore((s) => s.setSkin)
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)

  // 自定义主题列表（本地存储），新增/删除后刷新
  const [customList, setCustomList] = useState<Skin[]>(getCustomSkins())
  const refresh = () => setCustomList([...getCustomSkins()])

  // 创建浮层状态
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<{
    name: string
    primary: string
    bg: string
    accent: string
  }>({
    name: '',
    primary: SWATCH_GROUPS[0].colors[0].hex,
    bg: SWATCH_GROUPS[0].colors[0].hex,
    accent: SWATCH_GROUPS[0].colors[0].hex,
  })
  const savedSkinRef = useRef(skin)

  useEffect(() => {
    refresh()
  }, [])

  // 实时预览：创建浮层打开且主色变化（或深浅切换）时，直接把派生皮肤套用到全局 CSS 变量，
  // 整个 App（TabBar / 首页 / 设置页）即时变化。名称不影响配色，无需重套。
  useEffect(() => {
    if (!creating) return
    applySkinTo(
      buildCustomSkin(draft.name.trim() || '自定义主题', {
        primary: draft.primary,
        bg: draft.bg,
        accent: draft.accent,
      }),
      mode,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating, draft.primary, draft.bg, draft.accent, mode])

  const enterCreate = () => {
    savedSkinRef.current = skin
    setDraft({
      name: '',
      primary: SWATCH_GROUPS[0].colors[0].hex,
      bg: SWATCH_GROUPS[0].colors[0].hex,
      accent: SWATCH_GROUPS[0].colors[0].hex,
    })
    setCreating(true)
  }
  const setColor = (which: 'primary' | 'bg' | 'accent', hex: string) =>
    setDraft((d) => ({ ...d, [which]: hex }))
  const onHexText = (which: 'primary' | 'bg' | 'accent', v: string) => {
    const norm = v.trim()
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(norm)) {
      const hex = norm.length === 4 ? '#' + norm.slice(1).split('').map((c) => c + c).join('') : norm
      setColor(which, hex)
    }
  }
  const cancelCreate = () => {
    setCreating(false)
    editingPresetRef.current = null
    editingCustomRef.current = null
    // 还原到进入创建前的皮肤（未保存的改动丢弃）
    applySkin(savedSkinRef.current, mode)
  }
  const saveCreate = async () => {
    const s = buildCustomSkin(draft.name.trim() || '我的主题', {
      primary: draft.primary,
      bg: draft.bg,
      accent: draft.accent,
    })
    await saveCustomSkin(s)
    setCreating(false)
    await setSkin(s.id)
    refresh()
  }
  // 保存自定义主题编辑：用原 id 套用 buildCustomSkin → saveCustomSkin 按 id upsert（原地更新，不新建）。
  // 若编辑的是当前使用中主题则重新套用；否则还原到编辑前使用的主题（不擅自切换）。
  const saveEditCustom = async () => {
    const id = editingCustomRef.current
    if (!id) return
    const derived = buildCustomSkin(
      draft.name.trim() || '我的主题',
      { primary: draft.primary, bg: draft.bg, accent: draft.accent },
      id,
    )
    await saveCustomSkin(derived)
    editingCustomRef.current = null
    setCreating(false)
    if (skin === id) await setSkin(derived.id)
    else applySkin(savedSkinRef.current, mode)
    refresh()
  }
  const onDelete = async (id: string) => {
    const wasActive = skin === id
    await deleteCustomSkin(id)
    if (wasActive) await setSkin('sweetcool') // 删掉正在用的主题 → 回退预设
    refresh()
  }

  // ── 预设皮肤（来自后端 presetSkins 表 / SKINS 种子），可点选 / 编辑 / 删除 / 重置 ──
  const showToast = useAppStore((s) => s.showToast)
  const [presetList, setPresetList] = useState<Skin[]>(getPresetSkins())
  const refreshPreset = () => setPresetList([...getPresetSkins()])

  const editingPresetRef = useRef<string | null>(null)
  const editingCustomRef = useRef<string | null>(null)
  const enterEditPreset = (s: Skin) => {
    savedSkinRef.current = skin
    editingCustomRef.current = null
    setDraft({ name: s.name, primary: s.light.primary, bg: s.light.bg, accent: s.light.accent })
    editingPresetRef.current = s.id
    setCreating(true) // 复用创建浮层 UI
  }
  // 编辑自定义主题：复用创建浮层，预填原主题三色与名称，保存时按原 id 原地更新（不新建）。
  const enterEditCustom = (s: Skin) => {
    savedSkinRef.current = skin
    editingPresetRef.current = null
    const p = mode === 'dark' ? s.dark : s.light
    setDraft({ name: s.name, primary: p.primary, bg: p.bg, accent: p.accent })
    editingCustomRef.current = s.id
    setCreating(true)
  }
  const saveEditPreset = async () => {
    const id = editingPresetRef.current
    if (!id) return
    const orig = presetList.find((s) => s.id === id)
    const derived = buildCustomSkin(draft.name.trim() || orig?.name || '预设皮肤', {
      primary: draft.primary,
      bg: draft.bg,
      accent: draft.accent,
    })
    // 保留原皮肤的分组与装饰（角色皮肤的 motif），仅重派配色
    if (orig) {
      derived.group = orig.group
      derived.motif = orig.motif
    }
    await savePresetSkin(derived)
    editingPresetRef.current = null
    setCreating(false)
    await setSkin(derived.id)
    refreshPreset()
  }
  const onDeletePreset = async (id: string) => {
    const ok = await confirmSheet(
      '删除预设皮肤',
      '删除该预设皮肤？它将被移出列表，需要时可「重置为内置预设」恢复。',
    )
    if (!ok) return
    const wasActive = skin === id
    await deletePresetSkin(id)
    if (wasActive) await setSkin('sweetcool')
    refreshPreset()
  }
  const onResetPreset = async () => {
    const ok = await confirmSheet(
      '重置为内置预设',
      '将清空你对预设皮肤的编辑 / 删除，恢复出厂 20 套内置皮肤。历史账单与自定义主题不受影响，此操作不可撤销。',
    )
    if (!ok) return
    await resetPresetSkins()
    refreshPreset()
    showToast('已恢复内置预设皮肤')
  }

  const renderCustom = (s: Skin) => {
    const on = skin === s.id
    const p = mode === 'dark' ? s.dark : s.light
    return (
      <div
        key={s.id}
        className={`relative flex items-center gap-3 overflow-hidden rounded-card bg-surface p-4 shadow-soft ${
          on ? 'ring-2 ring-primary' : ''
        }`}
      >
        <button
          onClick={() => setSkin(s.id)}
          aria-pressed={on}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex flex-shrink-0 gap-1.5">
            <span className="h-7 w-7 rounded-pill" style={{ background: p.primary }} />
            <span className="h-7 w-7 rounded-pill" style={{ background: p.accent }} />
            <span className="h-7 w-7 rounded-pill" style={{ background: p.highlight }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{s.name}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-3">自定义主题</span>
          </span>
          {on && <span className="flex-shrink-0 text-sm text-primary">使用中</span>}
        </button>
        <button
          onClick={() => enterEditCustom(s)}
          aria-label="编辑主题"
          className="pressable flex-shrink-0 rounded-pill bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-2 active:opacity-70"
        >
          编辑
        </button>
        <button
          onClick={() => onDelete(s.id)}
          aria-label="删除主题"
          className="pressable flex-shrink-0 rounded-pill bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-2 active:opacity-70"
        >
          删除
        </button>
      </div>
    )
  }

  const renderPreset = (s: Skin) => {
    const on = skin === s.id
    const p = mode === 'dark' ? s.dark : s.light
    // 角色皮肤（原创小猫）：放大展示吉祥物作为主视觉（区别于纯色皮肤）
    if (s.id === 'cat') {
      return (
        <div
          key={s.id}
          className={`relative flex items-center gap-3 overflow-hidden rounded-card bg-surface p-4 shadow-soft ${
            on ? 'ring-2 ring-primary' : ''
          }`}
        >
          {/* 背景大水印，强化角色识别 */}
          <div className="pointer-events-none absolute -right-5 -bottom-6 opacity-[0.08]">
            <CatMascot width={140} animated={false} />
          </div>
          <button
            onClick={() => setSkin(s.id)}
            aria-pressed={on}
            className="relative flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <CatMascot width={56} animated={false} className="flex-shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{s.name}</span>
              <span className="mt-0.5 block truncate text-xs text-ink-3">角色皮肤 · 暖橘主调 · 粉色点缀</span>
              <span className="mt-1.5 flex gap-1.5">
                <span className="h-5 w-5 rounded-pill" style={{ background: p.primary }} />
                <span className="h-5 w-5 rounded-pill" style={{ background: p.accent }} />
                <span className="h-5 w-5 rounded-pill" style={{ background: p.highlight }} />
              </span>
            </span>
            {on && <span className="flex-shrink-0 text-sm text-primary">使用中</span>}
          </button>
          <button
            onClick={() => enterEditPreset(s)}
            aria-label="编辑皮肤"
            className="pressable relative flex-shrink-0 rounded-pill bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-2 active:opacity-70"
          >
            编辑
          </button>
          <button
            onClick={() => onDeletePreset(s.id)}
            aria-label="删除皮肤"
            className="pressable relative flex-shrink-0 rounded-pill bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-2 active:opacity-70"
          >
            删除
          </button>
        </div>
      )
    }
    return (
      <div
        key={s.id}
        className={`relative flex items-center gap-3 overflow-hidden rounded-card bg-surface p-4 shadow-soft ${
          on ? 'ring-2 ring-primary' : ''
        }`}
      >
        <button
          onClick={() => setSkin(s.id)}
          aria-pressed={on}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex flex-shrink-0 gap-1.5">
            <span className="h-7 w-7 rounded-pill" style={{ background: p.primary }} />
            <span className="h-7 w-7 rounded-pill" style={{ background: p.accent }} />
            <span className="h-7 w-7 rounded-pill" style={{ background: p.highlight }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{s.name}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-3">预设皮肤</span>
          </span>
          {on && <span className="flex-shrink-0 text-sm text-primary">使用中</span>}
        </button>
        <button
          onClick={() => enterEditPreset(s)}
          aria-label="编辑皮肤"
          className="pressable flex-shrink-0 rounded-pill bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-2 active:opacity-70"
        >
          编辑
        </button>
        <button
          onClick={() => onDeletePreset(s.id)}
          aria-label="删除皮肤"
          className="pressable flex-shrink-0 rounded-pill bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-2 active:opacity-70"
        >
          删除
        </button>
      </div>
    )
  }

  const renderColorSection = (label: string, which: 'primary' | 'bg' | 'accent') => {
    const all = SWATCH_GROUPS.flatMap((g) => g.colors)
    return (
      <section className="mb-5">
        <h3 className="mb-2 text-sm font-medium text-ink-2">{label}</h3>
        <div className="grid grid-cols-6 gap-2.5">
          {all.map((col) => {
            const on = draft[which].toLowerCase() === col.hex.toLowerCase()
            return (
              <button
                key={which + col.hex}
                onClick={() => setColor(which, col.hex)}
                title={col.name}
                aria-label={col.name}
                className={`h-11 rounded-[12px] shadow-soft transition-transform active:scale-95 ${
                  on ? 'ring-2 ring-offset-2 ring-ink ring-offset-bg' : ''
                }`}
                style={{ background: col.hex }}
              />
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="color"
            value={draft[which]}
            onChange={(e) => setColor(which, e.target.value)}
            className="h-11 w-12 cursor-pointer rounded-[12px] border border-line bg-surface-sunken"
            aria-label={label + ' 取色器'}
          />
          <input
            value={draft[which]}
            onChange={(e) => onHexText(which, e.target.value)}
            placeholder="#RRGGBB"
            className="flex-1 rounded-card bg-surface-sunken px-3 py-2.5 text-sm uppercase text-ink outline-none placeholder:text-ink-3"
          />
        </div>
      </section>
    )
  }

  return (
    <>
      <NavBar title="主题中心" />
      <PageHost>
        <section className="mb-5">
          <h2 className="mb-2 text-base font-semibold text-ink">深浅模式</h2>
          <div className="flex gap-2">
            {(['light', 'dark'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-pill py-2.5 text-sm ${
                  mode === m ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'
                }`}
              >
                {m === 'light' ? '浅色' : '深色'}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-1 flex items-end justify-between">
            <h2 className="text-base font-semibold text-ink">预设皮肤</h2>
            <button
              onClick={onResetPreset}
              className="pressable rounded-pill bg-surface-sunken px-3 py-1 text-xs text-ink-2 active:opacity-70"
            >
              重置为内置预设
            </button>
          </div>
          <p className="mb-2 text-xs text-ink-3">内置 20 套皮肤，可点选、编辑或删除；删除后可重置恢复</p>
          <div className="flex flex-col gap-2">
            {presetList.length === 0 ? (
              <p className="rounded-card bg-surface px-4 py-3 text-center text-xs text-ink-3">
                预设皮肤为空，点右上角「重置为内置预设」恢复出厂 20 套
              </p>
            ) : (
              presetList.map(renderPreset)
            )}
          </div>
        </section>

        <section className="mb-5">
          <h2 className="mb-1 text-base font-semibold text-ink">我的主题</h2>
          <p className="mb-2 text-xs text-ink-3">选一个颜色，自动生成专属皮肤，实时预览全应用</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={enterCreate}
              className="pressable flex items-center justify-center gap-2 rounded-card bg-surface-sunken py-4 text-sm font-medium text-primary shadow-soft active:opacity-80"
            >
              ＋ 创建自定义主题
            </button>
            {customList.length === 0 ? (
              <p className="rounded-card bg-surface px-4 py-3 text-center text-xs text-ink-3">
                还没有自定义主题，点上方按钮用喜欢的颜色生成一个吧
              </p>
            ) : (
              customList.map(renderCustom)
            )}
          </div>
        </section>

        <p className="rounded-card bg-surface px-4 py-3 text-center text-xs text-ink-3">
          仅支持自定义主题：分别挑选主色、背景、强调三种颜色，即可生成专属皮肤并实时预览到首页、设置页与底部导航。
        </p>
      </PageHost>

      {/* ── 创建自定义主题浮层（实时预览） ───────────────────── */}
      {creating && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-bg"
          style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}
        >
          <div className="flex items-center justify-between px-4 pb-3">
            <button onClick={cancelCreate} className="text-sm text-ink-2">
              ‹ 取消
            </button>
            <h2 className="text-base font-semibold text-ink">
              {editingPresetRef.current ? '编辑预设' : editingCustomRef.current ? '编辑主题' : '创建主题'}
            </h2>
            <button
              onClick={editingCustomRef.current ? saveEditCustom : editingPresetRef.current ? saveEditPreset : saveCreate}
              className="text-sm font-semibold text-primary"
            >
              {editingPresetRef.current || editingCustomRef.current ? '保存' : '保存并使用'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-10">
            {/* 实时预览条：用当前三色套出的皮肤 + 名称 */}
            <div className="mb-4 flex items-center gap-3 rounded-card bg-surface p-4 shadow-soft">
              <span className="flex flex-shrink-0 gap-1.5">
                <span
                  className="h-8 w-8 rounded-pill"
                  style={{ background: buildCustomSkin(draft.name, { primary: draft.primary, bg: draft.bg, accent: draft.accent }).light.primary }}
                />
                <span
                  className="h-8 w-8 rounded-pill"
                  style={{ background: buildCustomSkin(draft.name, { primary: draft.primary, bg: draft.bg, accent: draft.accent }).light.accent }}
                />
                <span
                  className="h-8 w-8 rounded-pill"
                  style={{ background: buildCustomSkin(draft.name, { primary: draft.primary, bg: draft.bg, accent: draft.accent }).light.highlight }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {draft.name.trim() || '自定义主题'}
                </span>
                <span className="mt-0.5 block text-xs text-ink-3">实时预览已应用到全应用</span>
              </span>
            </div>

            {/* 名称 */}
            <label className="mb-1 block text-sm font-medium text-ink">主题名称</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="给主题起个名字（如「我的荧光黄」）"
              maxLength={20}
              className="mb-5 w-full rounded-card bg-surface-sunken px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3"
            />

            {renderColorSection('主色（按钮 / 高亮点缀）', 'primary')}
            {renderColorSection('背景色（页面底色 / 文字基调）', 'bg')}
            {renderColorSection('强调色（accent）', 'accent')}

            <p className="text-xs leading-relaxed text-ink-3">
              主题由主色、背景、强调三种颜色分别生成（含浅色 / 深色），实时预览到首页、设置页与底部导航。主色自动调整为清晰可读的深度，你选的鲜艳原色作为主要点缀色呈现；背景与强调可独立微调，打造专属配色。
            </p>
          </div>
        </div>
      )}
    </>
  )
}
