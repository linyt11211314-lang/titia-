import { useEffect, useRef, useState } from 'react'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { ChipSelect } from '../../components/base/fields'
import { SwipeRow } from '../../components/base/SwipeRow'
import { ChevronIcon } from '../../components/icons'
import { useAuraStore } from '../../stores/useAuraStore'
import { useAppStore } from '../../stores/useAppStore'
import { navigate } from '../../app/useHashRoute'
import { reloadAll } from '../../services/reload'
import { getLatestSleep } from '../../services/sleep'
import {
  AURA_SYMPTOMS,
  AURA_FACTOR_GROUPS,
  AURA_AGE_GROUPS,
  AURA_SKIN_TYPES,
  generateAura,
  summarizeInput,
  type AuraHistoryRow,
} from '../../services/auraEngine'

function toggleIn(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key]
}

export function AuraPage() {
  const showToast = useAppStore((s) => s.showToast)
  const items = useAuraStore((s) => s.items)
  const save = useAuraStore((s) => s.save)
  const remove = useAuraStore((s) => s.remove)
  const setCurrentResult = useAuraStore((s) => s.setCurrentResult)

  const [symptoms, setSymptoms] = useState<string[]>([])
  const [factors, setFactors] = useState<string[]>([])
  const [ageGroup, setAgeGroup] = useState<string>('')
  const [skinType, setSkinType] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState({
    symptoms: false,
    factors: true,
    basic: true,
  })
  // 自持滚动容器 ref：传给 PullToRefresh 让其用我们给的 block className，
  // 避免 flex 列里 overflow-hidden 子项被压缩导致整页无法滚动。
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!useAuraStore.getState().loaded) void useAuraStore.getState().load()
  }, [])

  const runGenerate = () => {
    if (symptoms.length === 0 && factors.length === 0) {
      showToast('先勾选一些症状或因素，Aura 才好给建议～')
      return
    }
    setBusy(true)
    setTimeout(() => {
      void (async () => {
        // 与快捷指令导入的睡眠数据联动：睡眠 < 6h 自动在关联因素中标记「熬夜」
        let effFactors = factors
        try {
          const sleep = await getLatestSleep()
          if (sleep && sleep.sleepHours < 6 && !factors.includes('stayup')) {
            effFactors = [...factors, 'stayup']
          }
        } catch {
          /* 读取失败不影响正常生成 */
        }
        const sections = generateAura({ symptoms, factors: effFactors, ageGroup, skinType })
        void save({ symptoms, factors: effFactors, ageGroup, skinType, sections }).then((rec) => {
          setCurrentResult({
            id: rec.id,
            createdAt: rec.createdAt,
            symptoms: rec.symptoms,
            factors: rec.factors,
            ageGroup: rec.ageGroup,
            skinType: rec.skinType,
            sections: rec.sections,
          })
          navigate('/aura-result')
        })
        setBusy(false)
      })()
    }, 280)
  }

  const viewHistory = (it: AuraHistoryRow) => {
    setCurrentResult({
      id: it.id,
      createdAt: it.createdAt,
      symptoms: it.symptoms,
      factors: it.factors,
      ageGroup: it.ageGroup,
      skinType: it.skinType,
      sections: it.sections,
    })
    navigate('/aura-result')
  }

  const symptomLabels = symptoms
    .map((k) => AURA_SYMPTOMS.find((o) => o.key === k)?.label)
    .filter(Boolean) as string[]
  const factorLabels = factors
    .map((k) => AURA_FACTOR_GROUPS.flatMap((g) => g.items).find((o) => o.key === k)?.label)
    .filter(Boolean) as string[]
  const ageLabel = AURA_AGE_GROUPS.find((o) => o.key === ageGroup)?.label ?? ''
  const skinLabel = AURA_SKIN_TYPES.find((o) => o.key === skinType)?.label ?? ''

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* 顶部标题：固定不滚动（与 HomePage 顶部 banner 模式一致） */}
      <div className="shrink-0 px-5 pb-3 pt-[calc(var(--safe-top)+12px)]">
        <h1 className="text-2xl font-semibold text-ink">
          <span className="mr-1">✨</span>Aura
        </h1>
        <p className="mt-0.5 text-sm text-ink-3">你的皮肤，自有光。</p>
      </div>

      {/* 下方可滚动内容区（用 block 容器而非 flex，确保子项不被压缩、整页可滚动） */}
      <div className="min-h-0 flex-1">
        <PullToRefresh
          scrollRef={scrollRef}
          onRefresh={reloadAll}
          className="h-full overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y bg-bg px-5 pb-28 pt-2"
        >

          {/* 区块 A · 当前皮肤症状 */}
          <CollapsibleSection
            title="当前皮肤症状"
            subtitle="可多选"
            summary={summaryText(symptomLabels, '未选症状')}
            collapsed={collapsed.symptoms}
            onToggle={() => setCollapsed((p) => ({ ...p, symptoms: !p.symptoms }))}
          >
            <div className="flex flex-wrap gap-2">
              {AURA_SYMPTOMS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setSymptoms((p) => toggleIn(p, o.key))}
                  className={`rounded-pill px-3 py-1.5 text-sm ${
                    symptoms.includes(o.key) ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </CollapsibleSection>

          {/* 区块 B · 关联因素 */}
          <CollapsibleSection
            title="关联因素"
            subtitle="可多选"
            summary={summaryText(factorLabels, '未选因素')}
            collapsed={collapsed.factors}
            onToggle={() => setCollapsed((p) => ({ ...p, factors: !p.factors }))}
          >
            <div className="flex flex-col gap-3">
              {AURA_FACTOR_GROUPS.map((g) => (
                <div key={g.category}>
                  <p className="mb-1.5 text-xs text-ink-3">{g.category}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.items.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setFactors((p) => toggleIn(p, o.key))}
                        className={`rounded-pill px-3 py-1.5 text-sm ${
                          factors.includes(o.key) ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* 区块 C · 基础信息 */}
          <CollapsibleSection
            title="基础信息"
            summary={
              ageLabel || skinLabel
                ? [ageLabel, skinLabel].filter(Boolean).join(' · ') || '未填写'
                : '未填写'
            }
            collapsed={collapsed.basic}
            onToggle={() => setCollapsed((p) => ({ ...p, basic: !p.basic }))}
          >
            <div className="mb-3">
              <p className="mb-1.5 text-sm text-ink-2">年龄</p>
              <ChipSelect options={AURA_AGE_GROUPS} value={ageGroup} onChange={setAgeGroup} />
            </div>
            <div>
              <p className="mb-1.5 text-sm text-ink-2">肤质</p>
              <ChipSelect options={AURA_SKIN_TYPES} value={skinType} onChange={setSkinType} />
            </div>
          </CollapsibleSection>

          {/* 生成按钮 */}
          <button
            type="button"
            onClick={runGenerate}
            disabled={busy}
            className="pressable mt-1 w-full rounded-pill bg-primary px-4 py-3 text-sm font-semibold text-bg disabled:opacity-50"
          >
            {busy ? '正在生成…' : '生成我的 Aura 方案'}
          </button>

          {/* 历史记录 */}
          {items.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-base font-semibold text-ink">历史记录</h2>
              <div className="flex flex-col gap-2">
                {items.map((it) => (
                  <SwipeRow
                    key={it.id}
                    onDelete={() => remove(it.id)}
                    onPress={() => viewHistory(it)}
                  >
                    <div className="rounded-card bg-surface p-4 shadow-card">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-3">
                          {new Date(it.createdAt).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="text-xs text-ink-3">点按查看 ›</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-ink">
                        {summarizeInput({
                          symptoms: it.symptoms,
                          factors: it.factors,
                          ageGroup: it.ageGroup,
                          skinType: it.skinType,
                        })}
                      </p>
                    </div>
                  </SwipeRow>
                ))}
              </div>
            </section>
          )}
        </PullToRefresh>
      </div>
    </div>
  )
}

function summaryText(labels: string[], empty: string) {
  if (labels.length === 0) return empty
  if (labels.length <= 2) return labels.join('、')
  return `${labels.slice(0, 2).join('、')} 等 ${labels.length} 项`
}

function CollapsibleSection({
  title,
  subtitle,
  summary,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  subtitle?: string
  summary: string
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="mb-3 flex-shrink-0 overflow-hidden rounded-card bg-surface shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={!collapsed}
      >
        <span>
          <span className="text-base font-semibold text-ink">
            {title}
            {subtitle && <span className="ml-1 text-sm font-normal text-ink-3">（{subtitle}）</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-3">{summary}</span>
        </span>
        <span className={`ml-2 text-ink-3 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}>
          <ChevronIcon width={20} height={20} />
        </span>
      </button>
      {/* 用 grid-rows 0fr/1fr 过渡实现高度展开，避免 max-h 固定值导致的裁剪/压缩 */}
      <div
        className={`grid transition-all duration-200 ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line px-4 py-4">{children}</div>
        </div>
      </div>
    </section>
  )
}
