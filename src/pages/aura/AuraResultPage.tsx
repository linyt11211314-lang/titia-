import { useEffect, useState, type ReactNode } from 'react'
import { ChevronIcon, BackIcon } from '../../components/icons'
import { useAuraStore } from '../../stores/useAuraStore'
import { useAppStore } from '../../stores/useAppStore'
import { getLatestSleep } from '../../services/sleep'
import type { SleepRow } from '../../db/types'
import { back } from '../../app/useHashRoute'
import {
  summarizeInput,
  AURA_SKIN_TYPES,
  AURA_AGE_GROUPS,
  extractIngredients,
} from '../../services/auraEngine'
import { IngredientSearch } from './IngredientSearch'

// 报告主体按顺序带序号呈现；安抚区单独作为情感收尾卡。
const REPORT_SECTIONS: { key: string; no: string; title: string }[] = [
  { key: 'overview', no: '01', title: '诊断分析' },
  { key: 'care', no: '02', title: '护理方案' },
  { key: 'ingredients', no: '03', title: '产品参考' },
  { key: 'life', no: '04', title: '生活方式调整' },
  { key: 'doctor', no: '05', title: '就医指引' },
]

export function AuraResultPage() {
  const showToast = useAppStore((s) => s.showToast)
  const result = useAuraStore((s) => s.currentResult)
  // 读取快捷指令导入的最新睡眠数据，用于报告顶部展示「昨晚睡眠」
  const [sleep, setSleep] = useState<SleepRow | null>(null)
  // 五段报告主体默认全部展开；点击卡片顶部 header 可折叠/展开（与 Aura 主页一致）。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    overview: false,
    care: false,
    ingredients: false,
    life: false,
    doctor: false,
  })

  useEffect(() => {
    if (!useAuraStore.getState().loaded) void useAuraStore.getState().load()
  }, [])

  // 加载最新睡眠数据（仅供报告展示，不影响诊断文本）
  useEffect(() => {
    if (!result) return
    void getLatestSleep()
      .then(setSleep)
      .catch(() => setSleep(null))
  }, [result])

  if (!result) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <div className="flex shrink-0 items-center px-5 pb-2 pt-[calc(var(--safe-top)+12px)]">
          <button
            type="button"
            onClick={back}
            className="pressable -ml-2 mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink"
            aria-label="返回"
          >
            <BackIcon width={20} height={20} />
          </button>
          <h1 className="text-xl font-semibold text-ink">Aura 方案</h1>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col items-center justify-center overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y px-6 pb-28 text-center">
            <p className="text-4xl">✨</p>
            <p className="mt-3 text-base font-semibold text-ink">还没有生成方案</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-3">
              返回 Aura 勾选症状与因素，生成你的专属护理建议。
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { sections, symptoms, factors, ageGroup, skinType, createdAt } = result
  // 从诊断输入抽取推荐成分（用于插入「产品参考」搜索跳转板块）；无成分时 IngredientSearch 自动不显示。
  const ingredients = extractIngredients({ symptoms, factors, ageGroup, skinType })
  const savedAt = createdAt
    ? new Date(createdAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '刚刚'
  const skinLabel = AURA_SKIN_TYPES.find((o) => o.key === skinType)?.label ?? skinType ?? '未填'
  const ageLabel = AURA_AGE_GROUPS.find((o) => o.key === ageGroup)?.label ?? ageGroup ?? '未填'

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* 固定标题栏：与 Aura 主页同模式，紧贴状态栏、无 NavBar 额外高度 */}
      <div className="flex shrink-0 items-center px-5 pb-2 pt-[calc(var(--safe-top)+12px)]">
        <button
          type="button"
          onClick={back}
          className="pressable -ml-2 mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink"
          aria-label="返回"
        >
          <BackIcon width={20} height={20} />
        </button>
        <h1 className="text-xl font-semibold text-ink">Aura 方案</h1>
      </div>

      {/* 独立滚动内容区：与 Aura 主页同模式，紧凑起始、顶部无双重空白 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto overflow-x-hidden overscroll-none touch-pan-y bg-bg px-5 pb-28">
          {/* 顶部：皮肤画像 hero 卡 */}
          <section className="mb-4 rounded-card bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">✨</span>
                <h1 className="text-lg font-semibold text-ink">你的皮肤画像</h1>
              </div>
              <span className="text-xs text-ink-3">{savedAt}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              {summarizeInput({ symptoms, factors, ageGroup, skinType })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-pill bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                肤质 · {skinLabel}
              </span>
              <span className="rounded-pill bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                年龄段 · {ageLabel}
              </span>
            </div>
            {sleep && (
              <p className="mt-3 flex items-start gap-1 text-sm leading-relaxed text-ink-2">
                <span className="shrink-0">📊</span>
                <span>
                  昨晚睡眠约 {sleep.sleepHours} 小时
                  {sleep.source === 'Shortcuts' ? '（来自健康 App 自动同步）' : ''}
                </span>
              </p>
            )}
          </section>

          {/* 报告主体：五段带序号的板块，点击 header 可折叠/展开 */}
          <div className="flex flex-col gap-3">
            {REPORT_SECTIONS.map((s) => {
              const isIngredients = s.key === 'ingredients'
              return (
                <ReportSection
                  key={s.key}
                  no={s.no}
                  title={
                    isIngredients
                      ? `💡 含「${ingredients.map((i) => i.label).join(' · ')}」的产品参考`
                      : s.title
                  }
                  collapsed={!!collapsed[s.key]}
                  onToggle={() =>
                    setCollapsed((prev) => ({ ...prev, [s.key]: !prev[s.key] }))
                  }
                >
                  {isIngredients ? (
                    <IngredientSearch ingredients={ingredients} inline />
                  ) : (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">
                      {sections[s.key as 'overview' | 'care' | 'life' | 'doctor']}
                    </p>
                  )}
                </ReportSection>
              )
            })}
          </div>

          {/* Aura 安抚区：轻量提示文本（无卡片、无标题），直接展示内容 */}
          <p className="mt-4 flex items-start gap-1 px-1 text-sm leading-relaxed text-ink-2">
            <span className="shrink-0">✨</span>
            <span>{sections.comfort}</span>
          </p>

          {/* 反馈 */}
          <div className="mt-4 flex items-center justify-between rounded-card bg-surface p-4 shadow-card">
            <span className="text-sm text-ink-2">这份建议对你有帮助吗？</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => showToast('谢谢～Aura 会一直陪着你 🌿')}
                className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-xl"
                aria-label="有帮助"
              >
                👍
              </button>
              <button
                type="button"
                onClick={() => showToast('抱歉没帮到你，具体皮肤问题建议咨询皮肤科医生')}
                className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-xl"
                aria-label="没帮助"
              >
                👎
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportSection({
  no,
  title,
  collapsed,
  onToggle,
  children,
}: {
  no: string
  title: string
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        aria-expanded={!collapsed}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold tabular-nums text-primary">
          {no}
        </span>
        <p className="flex-1 text-base font-semibold text-ink">{title}</p>
        <span
          className={`shrink-0 text-ink-3 transition-transform duration-200 ${
            collapsed ? '' : 'rotate-180'
          }`}
        >
          <ChevronIcon width={20} height={20} />
        </span>
      </button>
      {/* grid-rows 0fr/1fr 过渡，高度自然展开，永不被裁切；折叠时完全收起 */}
      <div
        className={`grid transition-all duration-200 ${
          collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  )
}
