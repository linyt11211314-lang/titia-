import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { PageHost } from '../../components/nav/PageHost'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { reloadAll } from '../../services/reload'
import { Card } from '../../components/base/Card'
import { EmptyState } from '../../components/base/EmptyState'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextInput, TextArea, ChipSelect } from '../../components/base/fields'
import { confirmSheet } from '../../components/base/Confirm'
import { navigate } from '../../app/useHashRoute'
import { MediaImage } from '../../components/base/MediaImage'
import { MediaPreview } from '../../components/base/MediaPreview'
import { compressImage } from '../../services/media'
import { mediaRepo } from '../../db/repos'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useAppStore } from '../../stores/useAppStore'
import { useBookStore, type BookDraft } from '../../stores/useBookStore'
import { useCategoryStore } from '../../stores/useCategoryStore'
import { useAccountStore } from '../../stores/useAccountStore'
import { useBudgetStore } from '../../stores/useBudgetStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { takeEditBillId, queuePendingBill } from '../../services/dataService'
import { aiRecognize, getAiSystemPrompt, setAiSystemPrompt, SYSTEM_PROMPT } from '../../services/ai'
import { haptic } from '../../services/haptic'
import { RulesManager } from './RulesManager'
import type { AccountEntity, CategoryEntity, TransactionEntity } from '../../db/types'
import { SwipeRow } from '../../components/base/SwipeRow'

// Titia 时序 · 小账（个人财富管理中心 · 底部一级导航）
// 左侧一级导航：账单 / 资产 / 分析 / 分类 / 导入导出
// 账单二级横向分栏：全部 / 支出 / 收入 / 转账（非胶囊，细横线）
// 数据全部走 Dexie 四表（transactions/rules/accounts/categories），刷新不丢。

type View = 'home' | 'bills' | 'assets' | 'analysis' | 'cats' | 'io' | 'budgets'
type BillFilter = 'all' | 'expense' | 'income' | 'transfer'

const VIEWS: { key: View; icon: string; label: string }[] = [
  { key: 'home', icon: '🏠', label: '首页' },
  { key: 'bills', icon: '🧾', label: '账单' },
  { key: 'assets', icon: '💰', label: '资产' },
  { key: 'analysis', icon: '📊', label: '分析' },
  { key: 'cats', icon: '🗂', label: '分类' },
  { key: 'io', icon: '📥', label: '导入导出' },
]

const BILL_FILTERS: { key: BillFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'transfer', label: '转账' },
]

// 账单类型推导（旧数据无 txType 时按金额符号）
function txTypeOf(t: TransactionEntity): 'expense' | 'income' | 'transfer' {
  return t.txType ?? (t.amount < 0 ? 'income' : 'expense')
}

const fmtYuan = (fen: number) => `${fen < 0 ? '+' : '-'}¥${(Math.abs(fen) / 100).toFixed(2)}`

// 分类显示名：二级显示「🍜 餐饮 / 午餐」，一级直接显示（CapturePage 复用）
export function catDisplay(name: string, categories: CategoryEntity[]): string {
  const c = categories.find((x) => x.name === name)
  if (!c) return name
  if (!c.parent) return `${c.icon === '·' ? '' : c.icon} ${c.name}`
  const top = categories.find((x) => x.name === c.parent)
  return `${top && top.icon !== '·' ? top.icon : ''} ${c.parent} / ${c.name}`
}

// 分类选择器（独立底部弹层内容；自管 expandTop 手风琴状态）。
// 通过 Portal 渲染到 body，脱离「记一笔」Sheet 的滚动上下文，iOS 上按钮可靠可点。
function CategoryPicker({
  categories,
  selected,
  onPick,
}: {
  categories: CategoryEntity[]
  selected: string
  onPick: (name: string) => void
}) {
  // 内联两级展开：expandTop 为当前展开二级的一级分类名（手风琴：点开/收起），null 表示全部收起
  const [expandTop, setExpandTop] = useState<string | null>(null)
  const tops = categories.filter((c) => !c.parent)
  const rows: CategoryEntity[][] = []
  for (let i = 0; i < tops.length; i += 3) rows.push(tops.slice(i, i + 3))
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, ri) => {
        const rowHasOpen = row.some((t) => t.name === expandTop)
        return (
          <div key={ri} className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              {row.map((t) => {
                const open = expandTop === t.name
                const hasSub = categories.some((c) => c.parent === t.name)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      // 无二级的一级分类（叶子）：点击即选中并关闭弹层
                      if (!hasSub) {
                        onPick(t.name)
                        return
                      }
                      setExpandTop(open ? null : t.name)
                    }}
                    aria-expanded={open}
                    className={`flex flex-col items-center gap-1 rounded-card bg-surface px-2 py-3 ${
                      open ? 'ring-1 ring-primary/50' : ''
                    }`}
                  >
                    <span className="text-xl">{t.icon}</span>
                    <span className="text-xs text-ink">{t.name}</span>
                  </button>
                )
              })}
            </div>
            {rowHasOpen && (
              <div className="rounded-card bg-surface-sunken/40 p-2">
                <div className="flex flex-wrap gap-2">
                  {categories
                    .filter((c) => c.parent === expandTop)
                    .map((s) => {
                      const sel = selected === s.name
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onPick(s.name)}
                          className={`flex min-w-[80px] items-center justify-center whitespace-nowrap rounded-btn px-4 py-2 text-[15px] leading-snug transition-colors ${
                            sel ? 'bg-blue-500 font-medium text-white' : 'bg-blue-500/15 text-ink'
                          }`}
                        >
                          {s.name}
                        </button>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 记一笔表单（支出/收入/转账 + 规则/AI 识别；CapturePage 复用编辑模式） ──
export function BookForm({
  initial,
  onSave,
}: {
  initial?: {
    amount?: number
    txType?: 'expense' | 'income' | 'transfer'
    transferTo?: string
    merchant?: string
    category?: string
    account?: string
    time?: string
    note?: string
    mediaIds?: string[]
    autoSource?: 'rule' | 'ai'
  }
  onSave: (d: BookDraft) => void
}) {
  const showToast = useAppStore((s) => s.showToast)
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  // 默认扣款账户（应用设置项优先；未设置则回退招商银行信用卡——历史默认；找不到则不预填）
  const defaultAccountSetting = useSettingsStore((s) => s.defaultAccount)
  const defaultExpenseAccount = useMemo(() => {
    if (defaultAccountSetting && accounts.some((a) => a.name === defaultAccountSetting)) return defaultAccountSetting
    const exact = accounts.find((a) => a.name === '招商银行信用卡')
    if (exact) return exact.name
    const cmb = accounts.find((a) => a.type === '信用卡' && (a.bankName || '').includes('招商银行'))
    return cmb?.name ?? ''
  }, [accounts, defaultAccountSetting])
  // 收入默认入账账户：取第一个非负债账户（避免收入误入信用卡），保证收入记账默认关联资产账户 → 余额联动
  const defaultIncomeAccount = useMemo(() => {
    const firstAsset = accounts.find((a) => a.kind !== 'liability')
    return firstAsset?.name ?? ''
  }, [accounts])
  const [d, setD] = useState(() => {
    const type = initial?.txType ?? (initial?.amount != null && initial.amount < 0 ? 'income' : 'expense')
    return {
      type,
      amount: initial?.amount != null ? String(Math.abs(initial.amount) / 100) : '',
      merchant: initial?.merchant ?? '',
      category: initial?.category ?? '',
      account: initial?.account !== undefined ? initial.account : type === 'expense' ? defaultExpenseAccount : type === 'income' ? defaultIncomeAccount : '',
      transferTo: initial?.transferTo ?? '',
      time: initial?.time ?? dayjs().format('YYYY-MM-DDTHH:mm'),
      note: initial?.note ?? '',
    }
  })
  // 账户异步加载完成后：支出/收入且未选账户时自动补默认账户（编辑模式保留原账户；收入同支出联动余额）
  useEffect(() => {
    if (initial?.account !== undefined) return
    if (d.account) return
    if (d.type === 'expense' && defaultExpenseAccount) setD((p) => ({ ...p, account: defaultExpenseAccount }))
    else if (d.type === 'income' && defaultIncomeAccount) setD((p) => ({ ...p, account: defaultIncomeAccount }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, defaultAccountSetting, defaultIncomeAccount, d.type, d.account])
  // 分类选择：独立底部弹层（Portal 到 body，脱离表单 Sheet 滚动上下文，iOS 可靠可点）
  const [catOpen, setCatOpen] = useState(false)
  // 自动归类引擎来源（规则命中 / AI 识别；编辑时继承，手动改分类后清除）
  const [autoSource, setAutoSource] = useState<'rule' | 'ai' | undefined>(initial?.autoSource)
  // 图片附件：media 表 id 列表（支付截图，不进备注文字）
  const [mediaIds, setMediaIds] = useState<string[]>(initial?.mediaIds ?? [])
  const [mediaPreviewIdx, setMediaPreviewIdx] = useState<number | null>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const pickMedia = async (file: File) => {
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
      })
      setMediaIds((p) => [...p, id])
    } catch {
      showToast('图片处理失败')
    }
  }
  const removeMedia = async (id: string) => {
    setMediaIds((p) => p.filter((x) => x !== id))
    try {
      await mediaRepo.remove(id)
    } catch {
      /* 忽略 */
    }
  }
  const set = (k: string, v: string) => setD((p) => ({ ...p, [k]: v }))

  // ── 双引擎自动归类：规则优先（ruleFirst）→ AI 兜底（aiAutoCategory）──
  const aiAutoCategory = useSettingsStore((s) => s.aiAutoCategory)
  const ruleFirst = useSettingsStore((s) => s.ruleFirst)
  const [aiBusy, setAiBusy] = useState(false)
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (aiTimer.current) clearTimeout(aiTimer.current) }, [])
  const scheduleAi = (merchant: string) => {
    if (aiTimer.current) clearTimeout(aiTimer.current)
    aiTimer.current = setTimeout(() => void runAiWith(merchant), 500)
  }

  // 规则识别（交易对象变化自动预填；仅支出/收入）
  const onMerchant = (v: string) => {
    setD((p) => ({ ...p, merchant: v }))
    const tryRule = () => {
      const rule = useBookStore.getState().matchRule(v, v)
      if (rule) {
        setD((p) => ({ ...p, merchant: v, category: rule.category ?? p.category, account: rule.account ?? p.account }))
        setAutoSource('rule')
        showToast(`已识别：${rule.category || '默认分类'} · ${rule.account || '默认账户'}`)
        return true
      }
      return false
    }
    if (ruleFirst) {
      // 规则优先：命中即用；未命中 → AI 兜底（开关开时）
      if (!tryRule() && aiAutoCategory) scheduleAi(v)
    } else {
      // AI 优先：先 AI（异步），AI 失败再回退规则
      if (aiAutoCategory) scheduleAi(v)
      else tryRule()
    }
  }

  // AI 识别（异步，不阻塞录入；规则未命中自动兜底 / 手动按钮触发）
  const runAiWith = async (merchant?: string) => {
    const m = (merchant ?? d.merchant).trim()
    if (!m || aiBusy) return
    setAiBusy(true)
    try {
      const r = await aiRecognize(m)
      if (!r) {
        // AI 兜底失败 → AI 优先模式回退规则
        if (merchant && !ruleFirst) {
          const rule = useBookStore.getState().matchRule(m, m)
          if (rule) {
            setD((p) => ({ ...p, category: rule.category ?? p.category, account: rule.account ?? p.account }))
            setAutoSource('rule')
            showToast(`已识别：${rule.category || '默认分类'} · ${rule.account || '默认账户'}`)
          }
        } else if (!merchant) {
          showToast('AI 识别不可用（未配置或识别失败）')
        }
        return
      }
      setD((p) => ({
        ...p,
        amount: String((r.amount ?? 0) / 100),
        merchant: m,
        category: r.category ?? p.category,
        account: r.account ?? p.account,
        note: r.note ?? p.note,
        time: r.time ?? p.time,
      }))
      setAutoSource('ai')
      if (!merchant) showToast(`AI 识别：${r.merchant || m} · ${r.category || '未分类'} · ¥${((r.amount ?? 0) / 100).toFixed(2)}`)
    } finally {
      setAiBusy(false)
    }
  }
  const runAi = () => void runAiWith()

  const submit = () => {
    const yuan = Number(d.amount)
    if (!yuan || Number.isNaN(yuan)) return showToast('请输入金额')
    const fen = Math.round(yuan * 100)
    const att = mediaIds.length > 0 ? mediaIds : undefined
    if (d.type === 'transfer') {
      if (!d.account || !d.transferTo) return showToast('请选择转出与转入账户')
      if (d.account === d.transferTo) return showToast('转出与转入不能相同')
      onSave({
        amount: fen,
        txType: 'transfer',
        account: d.account,
        transferTo: d.transferTo,
        merchant: d.merchant.trim() || '转账',
        time: d.time,
        note: d.note.trim() || undefined,
        mediaIds: att,
      })
      return
    }
    onSave({
      amount: d.type === 'expense' ? fen : -fen,
      txType: d.type,
      merchant: d.merchant.trim() || undefined,
      category: d.category || undefined,
      account: d.account || undefined,
      time: d.time,
      note: d.note.trim() || undefined,
      mediaIds: att,
      autoSource,
    })
  }

  return (
    <div>
      <Field label="类型">
        <ChipSelect
          options={[
            { key: 'expense', label: '支出' },
            { key: 'income', label: '收入' },
            { key: 'transfer', label: '转账' },
          ]}
          value={d.type}
          onChange={(v) => setD((p) => ({ ...p, type: v as 'expense' | 'income' | 'transfer' }))}
        />
      </Field>
      <Field label="金额（元）">
        <TextInput value={d.amount} onChange={(v) => set('amount', v)} placeholder="如 26.8" inputMode="decimal" />
      </Field>
      {d.type === 'transfer' ? (
        <>
          <Field label="转出账户">
            <select
              value={d.account}
              onChange={(e) => set('account', e.target.value)}
              className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
            >
              <option value="">选择账户</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="转入账户">
            <select
              value={d.transferTo}
              onChange={(e) => set('transferTo', e.target.value)}
              className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
            >
              <option value="">选择账户</option>
              {accounts
                .filter((a) => a.name !== d.account)
                .map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label="交易对象（自动识别）">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <TextInput value={d.merchant} onChange={onMerchant} placeholder="如 海底捞 / 打车 / 房租" />
              </div>
              <button
                type="button"
                onClick={() => void runAi()}
                disabled={aiBusy || !d.merchant.trim()}
                className="flex-shrink-0 rounded-pill bg-surface-sunken px-3 py-2.5 text-xs text-primary disabled:opacity-40"
              >
                {aiBusy ? '识别中…' : '🤖 AI 识别'}
              </button>
            </div>
          </Field>
          <Field label="分类">
            <button
              type="button"
              onClick={() => setCatOpen(true)}
              className="titia-input flex w-full items-center justify-between rounded-btn bg-surface-sunken px-3 py-2.5 text-left text-ink outline-none"
            >
              <span>{d.category ? catDisplay(d.category, categories) : '未分类'}</span>
              <span className="text-ink-3">▾</span>
            </button>
          </Field>
          {catOpen &&
            createPortal(
              <Sheet title="选择分类" onClose={() => setCatOpen(false)}>
                <CategoryPicker
                  categories={categories}
                  selected={d.category}
                  onPick={(name) => {
                    setD((p) => ({ ...p, category: name }))
                    setAutoSource(undefined) // 手动覆盖分类 → 清除引擎来源标记
                    setCatOpen(false)
                  }}
                />
              </Sheet>,
              document.body,
            )}
          <Field label="账户">
            <select
              value={d.account}
              onChange={(e) => set('account', e.target.value)}
              className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
            >
              <option value="">未指定</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field label="时间">
        <input
          type="datetime-local"
          value={d.time}
          onChange={(e) => set('time', e.target.value)}
          className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
        />
      </Field>
      <Field label="备注（可空）">
        <TextInput value={d.note} onChange={(v) => set('note', v)} placeholder="如 和朋友聚餐" />
      </Field>
      {/* 图片附件（支付截图等）：不进备注文字；支持查看/删除/替换 */}
      <Field label="图片附件（支付截图）">
        <div className="flex flex-wrap items-center gap-2">
          {mediaIds.map((id, idx) => (
            <div key={id} className="relative">
              <button
                type="button"
                onClick={() => setMediaPreviewIdx(idx)}
                className="block p-0"
                aria-label="预览附件"
              >
                <MediaImage id={id} className="h-16 w-16 rounded-img object-cover" />
              </button>
              <button
                type="button"
                onClick={() => removeMedia(id)}
                aria-label={`删除附件 ${id.slice(0, 6)}`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-pill bg-accent text-[10px] font-bold text-bg"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-img bg-surface-sunken text-ink-3"
          >
            <span className="text-lg leading-none">＋</span>
            <span className="text-[10px]">{mediaIds.length ? '替换' : '添加截图'}</span>
          </button>
        </div>
        {mediaPreviewIdx !== null && (
          <MediaPreview ids={mediaIds} initial={mediaPreviewIdx} onClose={() => setMediaPreviewIdx(null)} />
        )}
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pickMedia(f)
            e.target.value = ''
          }}
        />
        <p className="mt-1 text-xs text-ink-3">截图自动压缩存储，可在详情查看或删除。</p>
      </Field>
      <button onClick={submit} className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg">
        保存
      </button>
    </div>
  )
}

// ── 分类表单（两级：名称/图标/父级） ──
function CategoryForm({
  initial,
  parents,
  onSave,
}: {
  initial: { name: string; icon: string; parent: string }
  parents: { name: string; icon: string }[]
  onSave: (d: { name: string; icon: string; parent: string }) => void
}) {
  const [d, setD] = useState(initial)
  return (
    <div>
      <Field label="分类名称">
        <TextInput value={d.name} onChange={(v) => setD({ ...d, name: v })} placeholder="如 宠物 / 猫粮" />
      </Field>
      <Field label="图标（emoji）">
        <TextInput value={d.icon} onChange={(v) => setD({ ...d, icon: v })} placeholder="🐱 / 🏠" />
      </Field>
      <Field label="上级分类（空 = 一级分类）">
        <select
          value={d.parent}
          onChange={(e) => setD({ ...d, parent: e.target.value })}
          className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
        >
          <option value="">（一级分类）</option>
          {parents.map((p) => (
            <option key={p.name} value={p.name}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      </Field>
      <button
        onClick={() => d.name.trim() && onSave({ name: d.name.trim(), icon: d.icon.trim() || '✨', parent: d.parent })}
        className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg"
      >
        保存
      </button>
    </div>
  )
}

// ── 账户表单 ──
// ── 账户表单（资产/负债 + 类型 + 银行卡/信用卡扩展字段） ──
const ACC_TYPES = [
  { key: '现金账户', label: '现金' },
  { key: '银行卡', label: '银行卡' },
  { key: '电子钱包', label: '电子钱包' },
  { key: '储蓄', label: '储蓄' },
  { key: '信用卡', label: '信用卡' },
] as const

function AccountForm({
  initial,
  onSave,
}: {
  initial: { kind: 'asset' | 'liability'; name: string; type: string; balance: string; bankName: string; cardTail: string; creditLimit: string }
  onSave: (d: {
    kind: 'asset' | 'liability'
    name: string
    type: string
    balance: string
    bankName: string
    cardTail: string
    creditLimit: string
  }) => void
}) {
  const [d, setD] = useState(initial)
  const set = (k: string, v: string) => setD((p) => ({ ...p, [k]: v }))
  const isCard = d.type === '银行卡' || d.type === '信用卡'
  return (
    <div>
      <Field label="账户性质">
        <ChipSelect
          options={[
            { key: 'asset', label: '资产账户' },
            { key: 'liability', label: '负债账户' },
          ]}
          value={d.kind}
          onChange={(v) => setD((p) => ({ ...p, kind: v as 'asset' | 'liability' }))}
        />
      </Field>
      <Field label="账户名称">
        <TextInput value={d.name} onChange={(v) => set('name', v)} placeholder="如 招行储蓄卡 / 花呗" />
      </Field>
      <Field label="账户类型">
        <ChipSelect
          options={ACC_TYPES.map((t) => ({ key: t.key, label: t.label }))}
          value={d.type}
          onChange={(v) => set('type', v)}
        />
      </Field>
      <Field label={d.kind === 'liability' ? '当前欠款（元）' : '余额（元，可空）'}>
        <TextInput value={d.balance} onChange={(v) => set('balance', v)} placeholder="如 3000" inputMode="decimal" />
      </Field>
      {isCard && (
        <Field label="银行名称（可空）">
          <TextInput value={d.bankName} onChange={(v) => set('bankName', v)} placeholder="如 招商银行" />
        </Field>
      )}
      {isCard && (
        <Field label="卡号尾号（可空）">
          <TextInput value={d.cardTail} onChange={(v) => set('cardTail', v)} placeholder="如 1234" />
        </Field>
      )}
      {d.type === '信用卡' && (
        <Field label="信用额度（元，可空）">
          <TextInput value={d.creditLimit} onChange={(v) => set('creditLimit', v)} placeholder="如 20000" inputMode="decimal" />
        </Field>
      )}
      <button
        onClick={() => {
          if (!d.name.trim()) return
          const bal = d.balance.trim() ? Math.round(Number(d.balance) * 100) : undefined
          if (d.balance.trim() && (Number.isNaN(bal) || bal === undefined)) return
          onSave({ ...d, name: d.name.trim(), balance: d.balance.trim() ? String(bal) : '' })
        }}
        className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg"
      >
        保存
      </button>
    </div>
  )
}

// ── 迷你柱状图（近 6 月支出趋势；点击柱子联动月份筛选） ──
function Bars({
  values,
  labels,
  keys,
  activeKey,
  onPick,
}: {
  values: number[]
  labels: string[]
  keys?: string[]
  activeKey?: string | null
  onPick?: (key: string) => void
}) {
  const w = 260
  const h = 90
  const max = Math.max(...values, 1)
  const bw = (w - 12) / values.length
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {values.map((v, i) => {
        const bh = Math.max(3, (v / max) * (h - 26))
        const x = 6 + i * bw + bw * 0.2
        const key = keys?.[i]
        const active = key !== undefined && key === activeKey
        return (
          <g key={i} onClick={() => key !== undefined && onPick?.(key)} style={onPick ? { cursor: 'pointer' } : undefined}>
            <rect
              x={x}
              y={h - 22 - bh}
              width={bw * 0.6}
              height={bh}
              rx="4"
              fill={active ? 'var(--color-accent)' : 'var(--color-primary)'}
              opacity={active ? 1 : 0.85}
            />
            <text x={x + bw * 0.3} y={h - 8} textAnchor="middle" fontSize="9" fill="var(--color-ink-3)">
              {labels[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 迷你折线（资产趋势） ──
function Line({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 260
  const h = 80
  const pad = 6
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
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── 环形占比（分类支出；点击分类行联动筛选明细） ──
function Donut({
  slices,
  active,
  onPick,
}: {
  slices: { label: string; value: number }[]
  active?: string | null
  onPick?: (label: string) => void
}) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total <= 0) return null
  const R = 34
  const C = 2 * Math.PI * R
  let acc = 0
  const PALETTE = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-highlight)', '#f59e0b', '#8b5cf6', '#14b8a6', '#ef4444', '#64748b']
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 96 96" className="h-24 w-24 flex-shrink-0 -rotate-90">
        <circle cx="48" cy="48" r={R} fill="none" stroke="var(--color-surface-sunken)" strokeWidth="14" />
        {slices.map((s, i) => {
          const frac = s.value / total
          const dash = frac * C
          const off = acc * C
          acc += frac
          return (
            <circle
              key={i}
              cx="48"
              cy="48"
              r={R}
              fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="14"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-off}
              strokeLinecap="butt"
            />
          )
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {slices.map((s, i) => {
          const sel = active === s.label
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick?.(s.label)}
              className={`flex w-full items-center gap-2 rounded-btn px-1.5 py-1 text-xs text-left ${
                sel ? 'bg-primary-soft ring-1 ring-primary/40' : ''
              }`}
            >
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-pill" style={{ background: PALETTE[i % PALETTE.length] }} />
              <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
              <span className="text-ink-3">{Math.round((s.value / total) * 100)}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── CSV 工具 ──
function toCsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => (c.includes(',') || c.includes('"') || c.includes('\n') ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\n')
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// ── 主页面（小账） ──
export function BookPage() {
  const { transactions, loaded, load, add, update, remove, matchRule, learn } = useBookStore()
  const { categories, loaded: catLoaded, load: loadCats, resetToPreset, create: createCat, update: updateCat, remove: removeCat } = useCategoryStore()
  const { accounts, loaded: accLoaded, load: loadAccs, create: createAcc, update: updateAcc, remove: removeAcc } = useAccountStore()
  const { budgets, loaded: bLoaded, load: loadBudgets, create: createBudget, update: updateBudget, remove: removeBudget } = useBudgetStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [view, setView] = useState<View>('home')
  const [billFilter, setBillFilter] = useState<BillFilter>('all')
  // 「快速记账提示」可关闭：关闭后持久化到 localStorage，不再自动出现（所有提示都需可关闭）
  const [bookTipOpen, setBookTipOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('titia.bookTipClosed') !== '1'
    } catch {
      return true
    }
  })
  const closeBookTip = () => {
    setBookTipOpen(false)
    try {
      localStorage.setItem('titia.bookTipClosed', '1')
    } catch {
      /* 隐私模式下 localStorage 不可用，仅本次会话隐藏即可 */
    }
  }
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  // 批量管理（需求六）：编辑/管理模式 + 多选删除
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  // 双指下拉多选（需求：账单列表双指下拉滑选多个，类似 iOS 文本双指选择）
  const billListRef = useRef<HTMLDivElement>(null)
  const manageRef = useRef(false)
  const billsRef = useRef<TransactionEntity[]>([])
  useEffect(() => {
    const container = billListRef.current
    if (!container) return
    let startId: string | null = null
    const hitId = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y)
      const row = el?.closest?.('[data-bill-id]') as HTMLElement | null
      return row?.dataset.billId ?? null
    }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return
      const id = hitId(e.touches[0].clientX, e.touches[0].clientY)
      if (!id) return
      startId = id
      if (!manageRef.current) enterManage()
    }
    const onMove = (e: TouchEvent) => {
      if (!startId || e.touches.length < 2) return
      e.preventDefault()
      const id = hitId(e.touches[0].clientX, e.touches[0].clientY)
      if (!id) return
      const ids = billsRef.current.map((b) => b.id)
      const a = ids.indexOf(startId)
      const b = ids.indexOf(id)
      if (a < 0 || b < 0) return
      const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1)
      setSelectedIds((prev) => [...new Set([...prev, ...range])])
    }
    const onEnd = () => {
      startId = null
    }
    container.addEventListener('touchstart', onStart, { passive: true })
    container.addEventListener('touchmove', onMove, { passive: false })
    container.addEventListener('touchend', onEnd)
    container.addEventListener('touchcancel', onEnd)
    return () => {
      container.removeEventListener('touchstart', onStart)
      container.removeEventListener('touchmove', onMove)
      container.removeEventListener('touchend', onEnd)
      container.removeEventListener('touchcancel', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])
  // 资产账户详情页（需求三）：点账户卡片进入独立详情页；null = 资产列表视图
  const [detailAcc, setDetailAcc] = useState<AccountEntity | null>(null)
  // 分析页（需求四）：选中月份（YYYY-MM）+ 分类筛选（null = 当月全部支出）
  const [anaMonth, setAnaMonth] = useState(() => dayjs().format('YYYY-MM'))
  const [anaCat, setAnaCat] = useState<string | null>(null)
  // 切换一级视图：离开资产时收起账户详情，避免下次进入还停留在详情
  const switchView = (v: View) => {
    setDetailAcc(null)
    setView(v)
    if (rightRef.current) rightRef.current.scrollTop = 0
  }

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])
  useEffect(() => {
    if (!catLoaded) loadCats()
  }, [catLoaded, loadCats])
  useEffect(() => {
    if (!accLoaded) loadAccs()
  }, [accLoaded, loadAccs])
  useEffect(() => {
    if (!bLoaded) loadBudgets()
  }, [bLoaded, loadBudgets])

  // ── 账单过滤与统计 ──
  const bills = useMemo(() => {
    const arr = [...transactions].sort((a, b) => b.time.localeCompare(a.time))
    if (billFilter === 'all') return arr
    return arr.filter((t) => txTypeOf(t) === billFilter)
  }, [transactions, billFilter])
  // 双指滑选所需的最新状态（渲染期同步到 ref，供原生触摸监听使用）
  manageRef.current = manageMode
  billsRef.current = bills

  const monthKey = dayjs().format('YYYY-MM')
  const monthExpense = transactions.filter((t) => txTypeOf(t) === 'expense' && t.time.startsWith(monthKey)).reduce((s, t) => s + Math.abs(t.amount), 0)
  const monthIncome = transactions.filter((t) => txTypeOf(t) === 'income' && t.time.startsWith(monthKey)).reduce((s, t) => s + Math.abs(t.amount), 0)

  // ── 账单按日分组（需求：同一天归纳一个卡片不收起；日期栏右侧显示当天支出/收入汇总） ──
  const billGroups = useMemo(() => {
    const groups: { date: string; items: TransactionEntity[]; expense: number; income: number }[] = []
    for (const t of bills) {
      const date = (t.time || '').slice(0, 10)
      if (!date) continue
      let g = groups.find((x) => x.date === date)
      if (!g) {
        g = { date, items: [], expense: 0, income: 0 }
        groups.push(g)
      }
      g.items.push(t)
      const type = txTypeOf(t)
      if (type === 'expense') g.expense += Math.abs(t.amount)
      else if (type === 'income') g.income += Math.abs(t.amount)
    }
    return groups
  }, [bills])

  // ── 记一笔 ──
  const openBookForm = (editing: TransactionEntity | null, presetNote?: string) => {
    open(
      <Sheet title={editing ? '编辑账单' : '记一笔'} onClose={close}>
        <BookForm
          initial={
            editing
              ? {
                  amount: editing.amount,
                  txType: editing.txType,
                  transferTo: editing.transferTo,
                  merchant: editing.merchant,
                  category: editing.category,
                  account: editing.account,
                  time: editing.time,
                  note: editing.note,
                  mediaIds: editing.mediaIds,
                  autoSource: editing.autoSource,
                }
              : presetNote
                ? { note: presetNote }
                : undefined
          }
          onSave={async (d) => {
            if (editing) {
              await update(editing.id, {
                amount: d.amount,
                txType: d.txType,
                transferTo: d.transferTo,
                merchant: d.merchant,
                category: d.category,
                account: d.account,
                time: d.time,
                note: d.note,
                mediaIds: d.mediaIds,
                autoSource: d.autoSource,
              })
              showToast('已更新')
            } else {
              const tx = await add(d)
              // 跨容器桥：新增账单写入桥，另一容器（Safari/PWA）经 storage 事件自动合并刷新
              queuePendingBill(tx)
              // 学习闭环：支出/收入未命中规则 → 沉淀（转账不参与分类学习）
              if (d.merchant && d.txType !== 'transfer') {
                const hit = matchRule(d.merchant)
                if (!hit) await learn(d.merchant, d.merchant, d.category, d.account)
              }
              showToast('已记账')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }

  const onDeleteTx = async (t: TransactionEntity) => {
    if (await confirmSheet('删除账单', '删除这条账单记录？账户余额与统计将同步更新。')) {
      await remove(t.id)
      showToast('已删除')
    }
  }

  // ── 批量删除（需求六）：编辑/管理模式多选 → 删除选中（余额回滚+附件清理在 remove 内） ──
  const enterManage = () => {
    setManageMode(true)
    setSelectedIds([])
  }
  const exitManage = () => {
    setManageMode(false)
    setSelectedIds([])
  }
  const toggleSelect = (id: string) => {
    setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  const selectAllShown = () => setSelectedIds(bills.map((b) => b.id))
  const deleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (
      await confirmSheet(
        '删除选中账单',
        `确定删除选中的 ${selectedIds.length} 笔账单？账户余额、资产/月度/预算统计将同步更新，关联截图一并清理。`,
      )
    ) {
      for (const id of selectedIds) await remove(id)
      showToast(`已删除 ${selectedIds.length} 笔账单`)
      exitManage()
    }
  }

  // ── 自动记账（设置入口，非独立板块；不新增左侧导航） ──
  const openAutoBook = () => {
    open(
      <Sheet title="自动记账" onClose={close}>
        <AutoBookContent showToast={showToast} />
      </Sheet>,
    )
  }
  // 点击剪贴板图标：直接读取系统剪贴板，免去手动粘贴的两步操作
  //  - 命中 TITIA_CAPTURE:: 前缀 → 走原有「一键拾光」识别流程（/capture 预览）
  //  - 普通文本 → 直接带入「记一笔」备注（点一次即识别，不再需长按/系统粘贴气泡）
  // 注：iOS WebKit 首次会弹一次系统级「允许粘贴」授权（平台强制，前端无法屏蔽），之后不再弹
  const readClipboardNow = async (): Promise<void> => {
    let text = ''
    try {
      text = (await navigator.clipboard.readText()).trim()
    } catch {
      showToast('无法读取剪贴板（需在 https 下并允许访问）')
      return
    }
    if (!text) {
      showToast('剪贴板为空')
      return
    }
    if (text.startsWith('TITIA_CAPTURE::')) {
      const { tryReadCaptureClipboard } = await import('../../services/captureClipboard')
      if (await tryReadCaptureClipboard()) {
        navigate('/capture')
      } else {
        showToast('该拾光数据已处理过')
      }
      return
    }
    // 普通文本：直接带入记一笔备注
    openBookForm(null, text)
  }
  // 一键拾光点击预览 → 保存后进入账单详情编辑页（跨容器标记经 DataService 读取，页面不直接操作存储）
  useEffect(() => {
    const id = takeEditBillId()
    if (!id) return
    const t = useBookStore.getState().transactions.find((x) => x.id === id)
    if (t) setTimeout(() => openBookForm(t), 150)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 分类 ──
  const topCats = useMemo(() => categories.filter((c) => !c.parent).sort((a, b) => a.order - b.order), [categories])
  const subCatsOf = (p: string) => categories.filter((c) => c.parent === p).sort((a, b) => a.order - b.order)
  const openCatForm = (editing: (typeof categories)[number] | null, presetParent = '') => {
    open(
      <Sheet title={editing ? '编辑分类' : '新增分类'} onClose={close}>
        <CategoryForm
          initial={{ name: editing?.name ?? '', icon: editing?.icon ?? '✨', parent: editing?.parent ?? presetParent }}
          parents={topCats.map((c) => ({ name: c.name, icon: c.icon }))}
          onSave={async (d) => {
            if (editing) {
              await updateCat(editing.id, { name: d.name, icon: d.icon || '✨', parent: d.parent || undefined })
              showToast('已更新')
            } else {
              await createCat({ name: d.name, icon: d.icon || '✨', defaultAccount: undefined, parent: d.parent || undefined })
              showToast('已添加')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }
  const onResetCats = () => {
    void confirmSheet(
      '重置为预设分类',
      '将清空全部现有分类并恢复为预设体系，历史账单不受影响。此操作不可撤销。',
    ).then(async (ok) => {
      if (!ok) return
      await resetToPreset()
      setExpandedCat(null)
      showToast('已恢复预设分类')
    })
  }

  const onDeleteCat = (c: (typeof categories)[number]) => {
    const subs = subCatsOf(c.name)
    // 删除一级分类：不再物理删除其子二级分类，而是解除关联（parent 置空 → 提升为一级），
    // 避免误删用户数据；历史账单仅按分类名引用，不受影响。
    if (!c.parent && subs.length > 0) {
      void confirmSheet(
        '删除一级分类',
        `删除「${c.name}」？其下 ${subs.length} 个二级分类将保留并提升为一级，历史账单不受影响。`,
      ).then(async (ok) => {
        if (!ok) return
        for (const s of subs) await updateCat(s.id, { parent: undefined })
        await removeCat(c.id)
        showToast('已删除，子分类已保留')
      })
      return
    }
    void confirmSheet('删除分类', `删除分类「${c.name}」？历史账单不受影响。`).then((ok) => {
      if (!ok) return
      void removeCat(c.id)
      showToast('已删除')
    })
  }

  // ── 账户 ──
  const openAccForm = (editing: (typeof accounts)[number] | null) => {
    open(
      <Sheet title={editing ? '编辑账户' : '新增账户'} onClose={close}>
        <AccountForm
          initial={{
            kind: editing?.kind ?? 'asset',
            name: editing?.name ?? '',
            type: editing?.type ?? '现金账户',
            balance: editing?.balance != null ? String(Math.abs(editing.balance) / 100) : '',
            bankName: editing?.bankName ?? '',
            cardTail: editing?.cardTail ?? '',
            creditLimit: editing?.creditLimit != null ? String(editing.creditLimit / 100) : '',
          }}
          onSave={async (d) => {
            // d.balance 已是 AccountForm 换算好的「分」字符串；此处直接取整，勿再 ×100
            const bal = d.balance.trim() ? Math.round(Number(d.balance)) : undefined
            if (d.balance.trim() && (Number.isNaN(bal) || bal === undefined)) return
            const limit = d.creditLimit.trim() ? Math.round(Number(d.creditLimit) * 100) : undefined
            if (d.creditLimit.trim() && (Number.isNaN(limit) || limit === undefined)) return
            const patch = {
              name: d.name,
              type: d.type || '其他',
              kind: d.kind,
              balance: bal,
              bankName: d.bankName.trim() || undefined,
              cardTail: d.cardTail.trim() || undefined,
              creditLimit: limit,
            }
            if (editing) {
              await updateAcc(editing.id, patch)
              showToast('已更新')
            } else {
              await createAcc(patch)
              showToast('已添加')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }
  const onDeleteAcc = (a: (typeof accounts)[number]) => {
    void confirmSheet('删除账户', `删除账户「${a.name}」？历史账单不受影响。`).then((ok) => {
      if (ok) {
        void removeAcc(a.id)
        showToast('已删除')
      }
    })
  }

  // ── 资产/分析数据 ──
  // 资产/负债分组（老账户缺 kind → 默认资产）
  const assetAccounts = accounts.filter((a) => (a.kind ?? 'asset') === 'asset')
  const liabilityAccounts = accounts.filter((a) => a.kind === 'liability')
  const assetTotal = assetAccounts.reduce((s, a) => s + Math.max(a.balance ?? 0, 0), 0)
  // 负债账户：信用卡等可能 balance 为负（欠款），累加其绝对值作为负债总额
  const liabilityTotal = liabilityAccounts.reduce(
    (s, a) => s + (a.balance != null && a.balance < 0 ? Math.abs(a.balance) : Math.max(a.balance ?? 0, 0)),
    0,
  )
  const netAssets = assetTotal - liabilityTotal
  const last6Months = useMemo(() => {
    const out: { key: string; label: string; expense: number; income: number; net: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const m = dayjs().subtract(i, 'month')
      const key = m.format('YYYY-MM')
      const label = m.format('M月')
      let exp = 0
      let inc = 0
      for (const t of transactions) {
        if (!t.time.startsWith(key)) continue
        if (txTypeOf(t) === 'expense') exp += Math.abs(t.amount)
        else if (txTypeOf(t) === 'income') inc += Math.abs(t.amount)
      }
      out.push({ key, label, expense: exp, income: inc, net: inc - exp })
    }
    return out
  }, [transactions])
  const monthBills = transactions.filter((t) => t.time.startsWith(monthKey))

  // ── 分析页数据（需求四：按选中月份统计，柱状图/分类占比联动） ──
  const anaBills = useMemo(() => transactions.filter((t) => t.time.startsWith(anaMonth)), [transactions, anaMonth])
  const anaIncome = anaBills.filter((t) => txTypeOf(t) === 'income').reduce((s, t) => s + Math.abs(t.amount), 0)
  const anaExpense = anaBills.filter((t) => txTypeOf(t) === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0)
  const anaMaxExpense = anaBills.filter((t) => txTypeOf(t) === 'expense').reduce((m, t) => Math.max(m, Math.abs(t.amount)), 0)
  const anaDaysInMonth = dayjs(anaMonth + '-01').daysInMonth()
  const anaTopCat = (() => {
    const map = new Map<string, number>()
    for (const t of anaBills) {
      if (txTypeOf(t) !== 'expense') continue
      map.set(t.category || '未分类', (map.get(t.category || '未分类') ?? 0) + Math.abs(t.amount))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0]
  })()
  const anaCatShares = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of anaBills) {
      if (txTypeOf(t) !== 'expense') continue
      const name = t.category || '未分类'
      map.set(name, (map.get(name) ?? 0) + Math.abs(t.amount))
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }))
  }, [anaBills])
  // 明细：默认选中月支出；点分类占比后按分类过滤（再点取消）
  const anaDetail = useMemo(
    () =>
      anaBills
        .filter((t) => (anaCat ? txTypeOf(t) === 'expense' && (t.category || '未分类') === anaCat : txTypeOf(t) === 'expense'))
        .sort((a, b) => b.time.localeCompare(a.time)),
    [anaBills, anaCat],
  )

  // ── 预算统计：分类叶子 → 顶级父（预算绑定一级分类） ──
  const topOf = (catName: string): string => {
    const c = categories.find((x) => x.name === catName)
    if (!c) return catName
    return c.parent ? c.parent : c.name
  }
  const budgetSpent = (topName: string): number =>
    monthBills
      .filter((t) => txTypeOf(t) === 'expense' && topOf(t.category || '') === topName)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
  const budgetRows = useMemo(
    () =>
      budgets
        .map((b) => {
          const cat = categories.find((c) => c.name === b.category)
          return { id: b.id, name: b.category, icon: cat?.icon ?? '🗂', amount: b.amount, spent: budgetSpent(b.category) }
        })
        .sort((a, b) => b.spent / Math.max(b.amount, 1) - a.spent / Math.max(a.amount, 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [budgets, categories, transactions],
  )

  // ── 预算管理 Sheet（组件在文件底部定义；必须包 Sheet 外壳，否则裸渲染混入页面） ──
  const openBudgetSheet = () => {
    open(
      <Sheet title="预算管理" onClose={close}>
        <BudgetSheetContent onClose={close} showToast={showToast} />
      </Sheet>,
    )
  }

  // ── 导入导出（咔皮记账 xlsx 格式：收支账单 13 列 + 内部转账 7 列；兼容旧 CSV） ──
  const topOfCat = (catName: string): string => {
    const c = categories.find((x) => x.name === catName)
    return c?.parent ?? catName
  }
  const subCatOf = (catName: string): string => {
    const c = categories.find((x) => x.name === catName)
    return c?.parent ? c.name : ''
  }
  // 导出咔皮格式 Excel（双 sheet）
  const exportKapi = () => {
    const rows = transactions
      .filter((t) => txTypeOf(t) !== 'transfer')
      .map((t) => {
        const income = txTypeOf(t) === 'income'
        return {
          日期: t.time.slice(0, 10),
          时间: `${t.time.slice(11, 16)}:00`,
          类型: income ? '收入' : '支出',
          金额: Math.abs(t.amount) / 100,
          一级分类: t.category ? topOfCat(t.category) : '',
          二级分类: t.category ? subCatOf(t.category) : '',
          标签: '',
          账户: t.account ?? '',
          计入收支: '是',
          计入预算: income ? '' : '是',
          所属账本: '总账',
          备注: t.note ?? '',
          分摊明细: '',
        }
      })
    const transfers = transactions.filter((t) => txTypeOf(t) === 'transfer').map((t) => ({
      日期: t.time.slice(0, 10),
      时间: `${t.time.slice(11, 16)}:00`,
      类型: '账户互转',
      金额: Math.abs(t.amount) / 100,
      转入账户: t.transferTo ?? '',
      转出账户: t.account ?? '',
      备注: t.note ?? t.merchant ?? '',
    }))
    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 日期: '', 时间: '', 类型: '', 金额: '', 一级分类: '', 二级分类: '', 标签: '', 账户: '', 计入收支: '', 计入预算: '', 所属账本: '', 备注: '', 分摊明细: '' }])
    XLSX.utils.book_append_sheet(wb, ws1, '收支账单')
    const ws2 = XLSX.utils.json_to_sheet(transfers.length ? transfers : [{ 日期: '', 时间: '', 类型: '', 金额: '', 转入账户: '', 转出账户: '', 备注: '' }])
    XLSX.utils.book_append_sheet(wb, ws2, '内部转账')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `咔皮格式账单-${dayjs().format('YYYY-MM-DD')}.xlsx`
    a.click()
    URL.revokeObjectURL(a.href)
    showToast(`已导出 ${rows.length + transfers.length} 条（收支 ${rows.length} / 转账 ${transfers.length}）`)
  }
  // 导入（咔皮 xlsx / 旧 CSV 兼容）
  // 修复（B④ 账单导入对账）：
  //   ① 导入涉及「不存在的账户」时自动创建（否则交易入账但余额无处落地，造成二次「余额不对」）
  //   ② 去重（findDuplicate，重复导入同一文件不再翻倍）
  //   ③ 去掉 silent：导入交易正常联动账户余额（首次导入账户余额 0 → 累加得正确余额）
  const importBook = (file: File) => {
    let imported = 0
    let skipped = 0
    const ensureAccount = async (name?: string) => {
      if (!name) return
      const accs = useAccountStore.getState().accounts
      if (accs.some((a) => a.name === name)) return
      await useAccountStore.getState().create({ name, type: '其他', kind: 'asset', balance: 0 })
    }
    const importOne = async (d: BookDraft) => {
      await ensureAccount(d.account)
      if (d.txType === 'transfer' && d.transferTo) await ensureAccount(d.transferTo)
      if (useBookStore.getState().findDuplicate(d)) {
        skipped++
        return
      }
      await useBookStore.getState().add({ ...d, silent: false })
      imported++
    }
    const report = () =>
      showToast(skipped > 0 ? `已导入 ${imported} 条，跳过 ${skipped} 条重复` : `已导入 ${imported} 条账单`)
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const wb = XLSX.read(new Uint8Array(reader.result as ArrayBuffer), { type: 'array' })
          const drafts: BookDraft[] = []
          const ws1 = wb.Sheets['收支账单']
          if (ws1) {
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws1)
            for (const r of rows) {
              const type = String(r['类型'] ?? '').trim()
              const amount = Number(r['金额'])
              if (!amount || Number.isNaN(amount)) continue
              const date = String(r['日期'] ?? '').trim()
              const tm = String(r['时间'] ?? '').trim()
              const cat2 = String(r['二级分类'] ?? '').trim()
              const cat1 = String(r['一级分类'] ?? '').trim()
              const isIncome = type === '收入'
              drafts.push({
                amount: Math.round(amount * 100) * (isIncome ? -1 : 1),
                txType: isIncome ? 'income' : 'expense',
                category: cat2 || cat1 || undefined,
                account: String(r['账户'] ?? '').trim() || undefined,
                time: date ? `${date} ${tm.slice(0, 5) || '00:00'}` : dayjs().format('YYYY-MM-DD HH:mm'),
                note: String(r['备注'] ?? '').trim() || undefined,
                source: 'manual',
              })
            }
          }
          const ws2 = wb.Sheets['内部转账']
          if (ws2) {
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws2)
            for (const r of rows) {
              if (String(r['类型'] ?? '').trim() !== '账户互转') continue
              const amount = Number(r['金额'])
              if (!amount || Number.isNaN(amount)) continue
              const from = String(r['转出账户'] ?? '').trim()
              const to = String(r['转入账户'] ?? '').trim()
              if (!from || !to) continue
              const date = String(r['日期'] ?? '').trim()
              const tm = String(r['时间'] ?? '').trim()
              drafts.push({
                amount: Math.round(amount * 100),
                txType: 'transfer',
                account: from,
                transferTo: to,
                merchant: '转账',
                time: date ? `${date} ${tm.slice(0, 5) || '00:00'}` : dayjs().format('YYYY-MM-DD HH:mm'),
                note: String(r['备注'] ?? '').trim() || undefined,
                source: 'manual',
              })
            }
          }
          for (const d of drafts) await importOne(d)
          report()
        } catch {
          showToast('导入失败：文件格式不正确')
        }
      }
      reader.readAsArrayBuffer(file)
      return
    }
    // 旧 CSV 兼容（金额(分)/类型/分类/账户/商户/时间/备注）
    const reader = new FileReader()
    reader.onload = async () => {
      const rows = parseCsv(String(reader.result || ''))
      if (rows.length < 2) return showToast('CSV 为空或格式不正确')
      const header = rows[0].map((h) => h.trim())
      const body = rows.slice(1)
      const drafts: BookDraft[] = []
      for (const r of body) {
        const m: Record<string, string> = {}
        header.forEach((h, i) => (m[h] = (r[i] ?? '').trim()))
        const amount = Number(m['金额(分)'])
        if (!amount || Number.isNaN(amount)) continue
        drafts.push({
          amount,
          txType: (m['类型'] as 'expense' | 'income' | 'transfer') || undefined,
          transferTo: m['转出→转入'] || undefined,
          merchant: m['商户'] || undefined,
          category: m['分类'] || undefined,
          account: m['账户'] || undefined,
          time: m['时间'] || dayjs().format('YYYY-MM-DDTHH:mm'),
          note: m['备注'] || undefined,
          source: 'manual',
        })
      }
      for (const d of drafts) await importOne(d)
      report()
    }
    reader.readAsText(file)
  }

  return (
    <PageHost contentClassName="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 顶部横向滑动标签（替代左侧垂直导航）：单行可横向滑动，激活=主色下划线；顶部避让状态栏 */}
        <div className="flex shrink-0 items-stretch gap-5 overflow-x-auto border-b border-line bg-bg px-4 pt-[calc(var(--safe-top)+8px)]">
          {VIEWS.map((v) => {
            const on = v.key === view
            return (
              <button
                key={v.key}
                onClick={() => {
                  haptic()
                  switchView(v.key)
                }}
                aria-current={on ? 'page' : undefined}
                className={`relative flex shrink-0 items-center gap-1 pb-2.5 pt-1 text-[15px] transition-colors ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}
              >
                <span className="text-base leading-none">{v.icon}</span>
                <span className="whitespace-nowrap leading-none">{v.label}</span>
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                  style={{ background: on ? 'var(--color-primary)' : 'transparent' }}
                />
              </button>
            )
          })}
        </div>

        {/* 内容区（全宽，独立滚动，含下拉刷新；不透明背景避免滚动透出） */}
        <PullToRefresh scrollRef={rightRef} onRefresh={reloadAll} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y bg-bg px-4 pb-28 pt-0">
          <div key={view} className="fade-up">
            {/* ═══ 首页（财富概览 / 本月收支 / 预算进度） ═══ */}
            {view === 'home' && (
              <>
                {/* 首页固定区（sticky 吸顶）：标题 + 净资产卡，下方内容滚动 */}
                <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-2 pt-2">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-ink">小账</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void readClipboardNow()}
                      aria-label="从剪贴板读取（拾光或文本）"
                      title="读取剪贴板：拾光数据自动识别，普通文本带入记一笔备注"
                      className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
                    >
                      📥
                    </button>
                    <button
                      onClick={openAutoBook}
                      aria-label="自动记账设置"
                      className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
                    >
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => openBookForm(null)}
                      className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg"
                    >
                      + 记一笔
                    </button>
                  </div>
                </div>

                {/* 财富概览（点击进入资产） */}
                <button onClick={() => switchView('assets')} className="mb-1 block w-full rounded-card bg-surface p-4 text-left shadow-soft">
                  <p className="text-xs text-ink-3">净资产</p>
                  <p className="mt-0.5 text-2xl font-bold text-ink">¥{(netAssets / 100).toFixed(2)}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    资产 ¥{(assetTotal / 100).toFixed(2)} · 负债 ¥{(liabilityTotal / 100).toFixed(2)} ›
                  </p>
                </button>
                </div>

                {/* 记账小贴士（Prompt 引导）：自然语言 / 剪贴板快速记账；可关闭 */}
                {bookTipOpen && (
                  <div className="mb-3 flex items-start gap-2 rounded-card bg-primary-soft px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-primary">💡 快速记账提示</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-2">
                        点右上角 <span className="font-medium">📥</span> 可读取剪贴板里的账单截图文字自动识别；或在「记一笔」里直接输入「午餐 -32」「打车 18.5 元」也能智能解析金额与分类。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeBookTip}
                      aria-label="关闭提示"
                      className="pressable -mr-1 -mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-primary/70 hover:bg-primary/10"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* 本月收支（点击进入分析） */}
                <button onClick={() => switchView('analysis')} className="mb-3 block w-full rounded-card bg-surface p-4 text-left shadow-soft">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-3">本月</p>
                    <span className="text-xs text-ink-3">›</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-sm font-semibold text-accent">+¥{(monthIncome / 100).toFixed(0)}</p>
                      <p className="text-xs text-ink-3">收入</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink">-¥{(monthExpense / 100).toFixed(0)}</p>
                      <p className="text-xs text-ink-3">支出</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-primary">¥{((monthIncome - monthExpense) / 100).toFixed(0)}</p>
                      <p className="text-xs text-ink-3">结余</p>
                    </div>
                  </div>
                </button>

                {/* 预算进度（最多 6 行；点「查看全部预算」进预算页） */}
                <button onClick={() => switchView('budgets')} className="mb-3 block w-full rounded-card bg-surface p-4 text-left shadow-soft">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-3">本月预算</p>
                    <span className="text-xs text-ink-3">›</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {budgetRows.length === 0 ? (
                      <p className="text-sm text-ink-3">还没有预算，点此设置</p>
                    ) : (
                      budgetRows.slice(0, 6).map((r) => {
                        const pct = Math.min(Math.round((r.spent / Math.max(r.amount, 1)) * 100), 100)
                        const over = r.spent >= r.amount
                        return (
                          <div key={r.id}>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-ink">
                                {r.icon} {r.name}
                              </span>
                              <span className="text-xs text-ink-3">
                                ¥{(r.spent / 100).toFixed(0)} / ¥{(r.amount / 100).toFixed(0)}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                              <div className={`h-full rounded-pill ${over ? 'bg-accent' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })
                    )}
                    <p className="pt-1 text-xs text-primary">查看全部预算 ›</p>
                  </div>
                </button>
              </>
            )}

            {/* ═══ 账单（需求六：编辑/管理模式 + 批量删除） ═══ */}
            {view === 'bills' && (
              <>
                {/* 顶部操作区固定（单一 sticky 块：标题+记一笔 + 本月概览 + 筛选 常驻可见，账单列表在其下方滚动；
                    避免「操作条」与「本月概览」各为独立 sticky 在 top:0 重叠） */}
                <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-1 pt-2">
                  {/* 操作栏：标题 + 编辑/记一笔 */}
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-ink">小账</h2>
                    <div className="flex items-center gap-2">
                      {manageMode ? (
                        <button
                          onClick={exitManage}
                          className="pressable rounded-pill bg-surface-sunken px-3 py-1.5 text-xs font-medium text-ink-2"
                        >
                          完成
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={enterManage}
                            aria-label="编辑模式"
                            className="pressable rounded-pill bg-surface-sunken px-3 py-1.5 text-xs font-medium text-ink-2"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => openBookForm(null)}
                            className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg"
                          >
                            + 记一笔
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 本月概览 */}
                  <div className="mb-3 rounded-card bg-surface p-4 shadow-soft">
                    <p className="text-xs text-ink-3">本月支出</p>
                    <p className="mt-0.5 text-2xl font-bold text-ink">¥{(monthExpense / 100).toFixed(2)}</p>
                    <p className="mt-1 text-xs text-ink-3">
                      收入 ¥{(monthIncome / 100).toFixed(2)} · 结余 ¥{((monthIncome - monthExpense) / 100).toFixed(2)}
                    </p>
                  </div>

                  {/* 二级横向分栏（全部/支出/收入/转账 · 细横线非胶囊） */}
                  <div className="mb-2 flex gap-6 border-b border-line px-1">
                    {BILL_FILTERS.map((f) => {
                      const on = billFilter === f.key
                      return (
                        <button
                          key={f.key}
                          onClick={() => setBillFilter(f.key)}
                          className={`relative pb-2 text-[15px] ${on ? 'font-semibold text-ink' : 'text-ink-3'}`}
                          style={{ transition: 'color 200ms' }}
                        >
                          {f.label}
                          <span
                            className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                            style={{
                              background: on ? 'var(--color-primary)' : 'transparent',
                              transform: on ? 'scaleX(1)' : 'scaleX(0)',
                              transformOrigin: 'center',
                              transition: 'transform 250ms cubic-bezier(.4,0,.2,1)',
                            }}
                          />
                        </button>
                      )
                    })}
                  </div>

                  {/* 管理模式操作条：全选 / 已选 / 删除选中 */}
                  {manageMode && (
                    <div className="mb-2 flex items-center justify-between rounded-card bg-surface px-3 py-2 shadow-soft">
                      <button onClick={selectAllShown} className="text-xs text-primary">
                        全选
                      </button>
                      <span className="text-xs text-ink-3">已选 {selectedIds.length} 笔 · 双指下拉可滑选</span>
                      <button
                        onClick={() => void deleteSelected()}
                        disabled={selectedIds.length === 0}
                        className="rounded-pill bg-accent px-3.5 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
                      >
                        删除选中
                      </button>
                    </div>
                  )}
                </div>

                {bills.length === 0 ? (
                  <EmptyState
                    image={undefined}
                    text={billFilter === 'all' ? '还没有账单，记下第一笔吧' : `还没有${BILL_FILTERS.find((f) => f.key === billFilter)?.label}账单`}
                    action={
                      <button onClick={() => openBookForm(null)} className="rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2">
                        记一笔
                      </button>
                    }
                  />
                ) : (
                  <div ref={billListRef} className="flex flex-col gap-3">
                    {billGroups.map((g) => (
                      <div key={g.date} className="overflow-hidden rounded-card bg-surface shadow-soft">
                        {/* 日期栏：左日期 · 右当天支出/收入汇总（右对齐） */}
                        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                          <p className="text-sm font-semibold text-ink">
                            {dayjs(g.date).format('M月D日')}
                            <span className="ml-1.5 text-xs font-normal text-ink-3">
                              {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayjs(g.date).day()]}
                            </span>
                          </p>
                          <p className="text-right text-xs leading-5">
                            {g.expense > 0 && (
                              <span className="ml-2 text-ink">
                                支出 -¥{(g.expense / 100).toFixed(2)}
                              </span>
                            )}
                            {g.income > 0 && (
                              <span className="ml-2 text-accent">
                                收入 +¥{(g.income / 100).toFixed(2)}
                              </span>
                            )}
                          </p>
                        </div>
                        {/* 组内账单（不收起；同一天平铺展示） */}
                        <div className="divide-y divide-line/60">
                          {g.items.map((t) => {
                            const type = txTypeOf(t)
                            const cat = categories.find((c) => c.name === t.category)
                            const isTransfer = type === 'transfer'
                            const sel = selectedIds.includes(t.id)
                            const inner = (
                              <button
                                key={t.id}
                                data-bill-id={t.id}
                                onClick={() => (manageMode ? toggleSelect(t.id) : openBookForm(t))}
                                className="flex w-full items-center justify-between px-4 py-3 text-left"
                              >
                                <span className="flex min-w-0 flex-1 items-center gap-3">
                                  {manageMode && (
                                    <span
                                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-[11px] ${
                                        sel ? 'border-primary bg-primary text-bg' : 'border-line text-transparent'
                                      }`}
                                    >
                                      ✓
                                    </span>
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                      <span className="block truncate text-sm font-medium text-ink">
                                        {t.merchant || (isTransfer ? '转账' : t.category) || '未命名'}
                                      </span>
                                      {t.autoSource === 'rule' && (
                                        <span className="flex-shrink-0 rounded-pill bg-primary-soft px-1.5 py-px text-[10px] leading-4 text-primary">⚡规则</span>
                                      )}
                                      {t.autoSource === 'ai' && (
                                        <span className="flex-shrink-0 rounded-pill bg-accent-soft px-1.5 py-px text-[10px] leading-4 text-accent">🤖AI</span>
                                      )}
                                    </span>
                                    <span className="mt-0.5 block truncate text-xs text-ink-3">
                                      {isTransfer
                                        ? `⇄ ${t.account} → ${t.transferTo}`
                                        : `${cat ? `${cat.icon} ${cat.name}` : t.category ?? '未分类'}${t.account ? ` · ${t.account}` : ''}`}
                                      {t.note ? ` · ${t.note}` : ''}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] text-ink-3">{dayjs(t.time).format('HH:mm')}</span>
                                  </span>
                                </span>
                                <span className="ml-3 flex flex-shrink-0 items-center gap-3">
                                  <span className={`text-base font-semibold ${type === 'income' ? 'text-accent' : 'text-ink'}`}>
                                    {type === 'transfer' ? `⇄ ¥${(t.amount / 100).toFixed(2)}` : fmtYuan(t.amount)}
                                  </span>
                                  {!manageMode && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        void onDeleteTx(t)
                                      }}
                                      className="text-xs text-ink-3"
                                    >
                                      删除
                                    </button>
                                  )}
                                </span>
                              </button>
                            )
                            return manageMode ? inner : <SwipeRow key={t.id} onDelete={() => onDeleteTx(t)}>{inner}</SwipeRow>
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ═══ 资产（需求二：顶部总览固定 + 下方滚动；需求三：点账户进详情页） ═══ */}
            {view === 'assets' &&
              (detailAcc ? (
                <AccountDetail
                  accId={detailAcc.id}
                  onBack={() => setDetailAcc(null)}
                  onEdit={() => openAccForm(detailAcc)}
                  onDelete={() => onDeleteAcc(detailAcc)}
                  onEditTx={openBookForm}
                />
              ) : (
                <>
                  {/* 固定区（sticky 吸顶）：标题 + 净资产 + 资产趋势折线图 合并为一张连贯宽卡片，
                      消除「大数字卡」与「折线图卡」之间的横向割裂感（顶部整体性与高级感）。
                      吸顶头本身保持 bg-bg 不透明，下方内容滚动时从其下方经过、不会透出。 */}
                  <div className="sticky top-0 z-20 -mx-4 bg-bg px-4 pb-2 pt-2">
                    <div className="rounded-card bg-surface px-4 py-3 shadow-soft">
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-ink">资产</h2>
                        <button onClick={() => openAccForm(null)} className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg">
                          + 账户
                        </button>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-ink-3">净资产</p>
                          <p className="mt-0.5 text-2xl font-bold text-ink">¥{(netAssets / 100).toFixed(2)}</p>
                        </div>
                        <div className="text-right text-xs leading-relaxed text-ink-3">
                          <p>资产</p>
                          <p className="font-medium text-ink">¥{(assetTotal / 100).toFixed(2)}</p>
                          <p className="mt-1">负债</p>
                          <p className="font-medium text-ink">¥{(liabilityTotal / 100).toFixed(2)}</p>
                        </div>
                      </div>
                      {/* 折线图直接接续净资产下方，同卡片内以极简分割线过渡，不再另起一张独立卡 */}
                      <div className="mt-3 border-t border-line/70 pt-3">
                        <p className="mb-2 text-xs text-ink-3">资产变化趋势（近 6 月净流入）</p>
                        <Line values={last6Months.map((m) => m.net)} />
                        <p className="mt-1 flex justify-between text-[10px] text-ink-3">
                          {last6Months.map((m) => (
                            <span key={m.key}>{m.label}</span>
                          ))}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* 下方滚动内容：账户列表（点击进入详情页） */}
                  <div className="flex flex-col gap-2 mt-3">
                    {assetAccounts.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-ink-3">资产账户</p>
                        <div className="flex flex-col gap-1.5">
                          {assetAccounts.map((a) => (
                            <Card key={a.id} onPress={() => setDetailAcc(a)}>
                              <div className="flex items-center justify-between p-4">
                                <div>
                                  <p className="font-medium text-ink">
                                    {a.name}
                                    <span className="ml-2 text-xs text-ink-3">{a.type}</span>
                                    {a.cardTail ? <span className="ml-1 text-xs text-ink-3">·{a.cardTail}</span> : null}
                                  </p>
                                  {a.balance != null && <p className="text-xs text-ink-3">余额 ¥{(a.balance / 100).toFixed(2)}</p>}
                                </div>
                                <span className="text-ink-3">›</span>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                    {liabilityAccounts.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-ink-3">负债账户</p>
                        <div className="flex flex-col gap-1.5">
                          {liabilityAccounts.map((a) => (
                            <Card key={a.id} onPress={() => setDetailAcc(a)}>
                              <div className="flex items-center justify-between p-4">
                                <div>
                                  <p className="font-medium text-ink">
                                    {a.name}
                                    <span className="ml-2 text-xs text-ink-3">{a.type}</span>
                                    {a.cardTail ? <span className="ml-1 text-xs text-ink-3">·{a.cardTail}</span> : null}
                                  </p>
                                  {a.balance != null && <p className="text-xs text-ink-3">欠款 ¥{Math.abs(a.balance / 100).toFixed(2)}</p>}
                                </div>
                                <span className="text-ink-3">›</span>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ))}

            {/* ═══ 分析（需求四：月份筛选 + 柱状图联动 + 分类占比联动） ═══ */}
            {view === 'analysis' && (
              <>
                <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-3 pt-2">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-ink">分析</h2>
                </div>
                {/* 月份筛选：左右切换 */}
                <div className="mb-3 flex items-center justify-between rounded-card bg-surface px-3 py-2 shadow-soft">
                  <button
                    type="button"
                    aria-label="上个月"
                    onClick={() => {
                      setAnaMonth(dayjs(anaMonth + '-01').subtract(1, 'month').format('YYYY-MM'))
                      setAnaCat(null)
                    }}
                    className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
                  >
                    ‹
                  </button>
                  <span className="text-sm font-semibold text-ink">{dayjs(anaMonth + '-01').format('YYYY 年 M 月')}</span>
                  <button
                    type="button"
                    aria-label="下个月"
                    onClick={() => {
                      setAnaMonth(dayjs(anaMonth + '-01').add(1, 'month').format('YYYY-MM'))
                      setAnaCat(null)
                    }}
                    className="pressable flex h-8 w-8 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
                  >
                    ›
                  </button>
                </div>
                {/* 选中月份收支三卡 */}
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <div className="rounded-card bg-surface p-3 shadow-soft">
                    <p className="text-xs text-ink-3">收入</p>
                    <p className="mt-1 text-base font-bold text-accent">¥{(anaIncome / 100).toFixed(0)}</p>
                  </div>
                  <div className="rounded-card bg-surface p-3 shadow-soft">
                    <p className="text-xs text-ink-3">支出</p>
                    <p className="mt-1 text-base font-bold text-ink">¥{(anaExpense / 100).toFixed(0)}</p>
                  </div>
                  <div className="rounded-card bg-surface p-3 shadow-soft">
                    <p className="text-xs text-ink-3">结余</p>
                    <p className="mt-1 text-base font-bold text-primary">¥{((anaIncome - anaExpense) / 100).toFixed(0)}</p>
                  </div>
                </div>
                {/* 消费趋势：点击柱子 → 切换选中月份（联动筛选） */}
                <div className="mb-3 rounded-card bg-surface p-4 shadow-soft">
                  <p className="mb-2 text-xs text-ink-3">消费趋势（近 6 月支出 · 点柱子切换月份）</p>
                  <Bars
                    values={last6Months.map((m) => m.expense)}
                    labels={last6Months.map((m) => m.label)}
                    keys={last6Months.map((m) => m.key)}
                    activeKey={anaMonth}
                    onPick={(k) => {
                      setAnaMonth(k)
                      setAnaCat(null)
                    }}
                  />
                </div>
                </div>
                {/* 分类占比（可滚动）：点击分类行 → 联动对应分类账单明细 */}
                <div className="mb-3 rounded-card bg-surface p-4 shadow-soft">
                  <p className="mb-3 text-xs text-ink-3">分类占比（{dayjs(anaMonth + '-01').format('M 月')}支出 · 点分类看明细）</p>
                  {anaCatShares.length ? (
                    <Donut
                      slices={anaCatShares}
                      active={anaCat}
                      onPick={(label) => setAnaCat((p) => (p === label ? null : label))}
                    />
                  ) : (
                    <p className="text-sm text-ink-3">暂无支出数据</p>
                  )}
                </div>
                {/* 月度报告（可滚动，选中月份） */}
                <div className="rounded-card bg-surface p-4 shadow-soft">
                  <p className="mb-2 text-xs text-ink-3">月度报告 · {dayjs(anaMonth + '-01').format('YYYY 年 M 月')}</p>
                  <div className="space-y-1.5 text-sm text-ink">
                    <p>共 <span className="font-semibold text-primary">{anaBills.length}</span> 笔账单</p>
                    <p>日均支出 <span className="font-semibold">¥{anaBills.length ? (anaExpense / 100 / anaDaysInMonth).toFixed(1) : '0'}</span></p>
                    <p>最大单笔支出 <span className="font-semibold">¥{(anaMaxExpense / 100).toFixed(2)}</span></p>
                    {anaTopCat && <p>支出最多分类 <span className="font-semibold">{anaTopCat[0]}（¥{(anaTopCat[1] / 100).toFixed(2)}）</span></p>}
                  </div>
                </div>
                {/* 联动明细：选中月消费详情 / 分类账单明细（可滚动查看） */}
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink-3">
                      {anaCat ? `「${anaCat}」分类明细（${anaDetail.length} 笔）` : `当月消费详情（${anaDetail.length} 笔）`}
                    </p>
                    {anaCat && (
                      <button type="button" onClick={() => setAnaCat(null)} className="text-xs text-primary">
                        清除筛选
                      </button>
                    )}
                  </div>
                  {anaDetail.length === 0 ? (
                    <p className="rounded-card bg-surface px-4 py-6 text-center text-sm text-ink-3 shadow-soft">
                      该月暂无{anaCat ? `「${anaCat}」` : ''}支出记录
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {anaDetail.map((t) => {
                        const cat = categories.find((c) => c.name === t.category)
                        return (
                          <Card key={t.id} onPress={() => openBookForm(t)}>
                            <div className="flex items-center justify-between p-4">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-ink">{t.merchant || t.category || '未命名'}</p>
                                <p className="mt-0.5 truncate text-xs text-ink-3">
                                  {cat ? `${cat.icon} ${cat.name}` : t.category ?? '未分类'}
                                  {t.account ? ` · ${t.account}` : ''}
                                </p>
                                <p className="mt-0.5 text-xs text-ink-3">{dayjs(t.time).format('YYYY-MM-DD HH:mm')}</p>
                              </div>
                              <p className="ml-3 flex-shrink-0 text-base font-semibold text-ink">{fmtYuan(t.amount)}</p>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ═══ 分类（两级） ═══ */}
            {view === 'cats' && (
              <>
                <div className="mb-2 flex items-center justify-between pt-2">
                  <h2 className="text-lg font-semibold text-ink">分类</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={onResetCats} className="pressable rounded-pill bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-ink-2">
                      重置预设
                    </button>
                    <button onClick={() => openCatForm(null)} className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg">
                      + 新增
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-xs text-ink-3">一级分类 + 二级分类，均可自定义</p>
                <div className="flex flex-col gap-2">
                  {topCats.map((c) => {
                    const subs = subCatsOf(c.name)
                    const isOpen = expandedCat === c.name
                    return (
                      <div key={c.id}>
                        <Card onPress={() => setExpandedCat(isOpen ? null : c.name)}>
                          <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{c.icon}</span>
                              <div>
                                <p className="font-medium text-ink">{c.name}</p>
                                {subs.length > 0 && <p className="text-xs text-ink-3">{subs.length} 个二级分类</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openCatForm(c)
                                }}
                                className="text-xs text-ink-3"
                              >
                                编辑
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDeleteCat(c)
                                }}
                                className="text-xs text-ink-3"
                              >
                                删除
                              </button>
                              <span className={`text-ink-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                            </div>
                          </div>
                        </Card>
                        {isOpen && (
                          <div className="ml-6 mt-1 flex flex-col gap-1.5">
                            <button
                              onClick={() => openCatForm(null, c.name)}
                              className="rounded-card bg-surface-sunken px-3 py-2 text-left text-sm text-primary"
                            >
                              + 添加二级分类（{c.name}）
                            </button>
                            {subs.map((s) => (
                              <div key={s.id} className="flex items-center justify-between rounded-card bg-surface px-3 py-2">
                                <p className="text-sm text-ink">
                                  {s.icon} {s.name}
                                </p>
                                <div className="flex gap-3">
                                  <button onClick={() => openCatForm(s)} className="text-xs text-ink-3">
                                    编辑
                                  </button>
                                  <button onClick={() => onDeleteCat(s)} className="text-xs text-ink-3">
                                    删除
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* ═══ 预算管理（查看全部预算 → 独立页） ═══ */}
            {view === 'budgets' && (
              <>
                <div className="h-3" />
                <button onClick={() => switchView('home')} className="mb-3 flex items-center gap-1 rounded-card bg-surface-sunken px-4 py-2 text-sm text-primary">
                  ‹ 返回首页
                </button>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-ink">预算管理</h2>
                  <button onClick={() => openBudgetSheet()} className="pressable rounded-pill bg-primary px-3.5 py-1.5 text-xs font-semibold text-bg">
                    + 新增预算
                  </button>
                </div>
                <p className="mb-3 text-xs text-ink-3">分类预算 · 每月 · 轻提醒（80% 较高 / 100% 用完）</p>
                <BudgetList onEdit={openBudgetSheet} />
              </>
            )}

            {/* ═══ 导入导出（咔皮记账 xlsx 格式） ═══ */}
            {view === 'io' && (
              <>
                <div className="mb-2 pt-2">
                  <h2 className="text-lg font-semibold text-ink">导入导出</h2>
                </div>
                <div className="flex flex-col gap-3">
                  <Card onPress={exportKapi}>
                    <div className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium text-ink">导出账单 Excel（咔皮格式）</p>
                        <p className="mt-1 text-sm text-ink-2">
                          收支账单 + 内部转账 双工作表 · 可导入咔皮记账
                        </p>
                      </div>
                      <span className="text-primary">↓</span>
                    </div>
                  </Card>
                  <Card onPress={() => fileRef.current?.click()}>
                    <div className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium text-ink">导入账单 Excel / CSV</p>
                        <p className="mt-1 text-sm text-ink-2">支持咔皮记账导出文件（收支账单/内部转账）与旧 CSV</p>
                      </div>
                      <span className="text-primary">↑</span>
                    </div>
                  </Card>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void importBook(f)
                      e.target.value = ''
                    }}
                  />
                  <p className="px-1 text-xs text-ink-3">
                    格式与咔皮记账一致：收支账单（日期/时间/类型/金额/一级分类/二级分类/标签/账户/计入收支/计入预算/所属账本/备注/分摊明细）+ 内部转账。
                  </p>
                </div>
              </>
            )}
          </div>
        </PullToRefresh>
      </div>
    </PageHost>
  )
}


// ── 预算管理 Sheet 内容（独立组件以使用 hooks） ──
function BudgetSheetContent({ onClose, showToast }: { onClose: () => void; showToast: (m: string) => void }) {
  const { budgets, create, remove } = useBudgetStore()
  const { categories } = useCategoryStore()
  const { transactions } = useBookStore()
  const [d, setD] = useState({ category: '', amount: '' })

  const topOf = (catName: string): string => {
    const c = categories.find((x) => x.name === catName)
    if (!c) return catName
    return c.parent ? c.parent : c.name
  }
  const monthKey = dayjs().format('YYYY-MM')
  const budgetSpent = (topName: string): number =>
    transactions
      .filter((t) => txTypeOf(t) === 'expense' && t.time.startsWith(monthKey) && topOf(t.category || '') === topName)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
  const rows = budgets
    .map((b) => {
      const cat = categories.find((c) => c.name === b.category)
      return { id: b.id, name: b.category, icon: cat?.icon ?? '🗂', amount: b.amount, spent: budgetSpent(b.category) }
    })
    .sort((a, b) => b.spent / Math.max(b.amount, 1) - a.spent / Math.max(a.amount, 1))

  const topCats = categories.filter((c) => !c.parent)

  return (
    <div>
      <div className="mb-3 rounded-card bg-surface-sunken p-3">
        <Field label="分类（一级）">
          <select
            value={d.category}
            onChange={(e) => setD({ ...d, category: e.target.value })}
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
          >
            <option value="">选择分类</option>
            {topCats.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="预算金额（元/月）">
          <TextInput value={d.amount} onChange={(v) => setD({ ...d, amount: v })} placeholder="如 1500" inputMode="decimal" />
        </Field>
        <button
          onClick={() => {
            const yuan = Number(d.amount)
            if (!d.category || !yuan || Number.isNaN(yuan)) return
            void create({ category: d.category, amount: Math.round(yuan * 100) })
            setD({ category: '', amount: '' })
            showToast('已设置预算')
          }}
          className="pressable w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg"
        >
          + 设置预算
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-3">还没有预算，先设置一个吧</p>
        ) : (
          rows.map((r) => {
            const pct = Math.min(Math.round((r.spent / Math.max(r.amount, 1)) * 100), 100)
            const over = r.spent >= r.amount
            return (
              <Card key={r.id}>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">
                      {r.icon} {r.name}
                    </p>
                    <button
                      onClick={() => {
                        void confirmSheet('删除预算', `删除「${r.name}」的预算？`).then((ok) => {
                          if (ok) {
                            void remove(r.id)
                            showToast('已删除')
                          }
                        })
                      }}
                      className="text-xs text-ink-3"
                    >
                      删除
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-ink-3">
                    ¥{(r.spent / 100).toFixed(0)} / ¥{(r.amount / 100).toFixed(0)}
                    <span className={`ml-2 ${over ? 'text-accent' : ''}`}>{pct}%</span>
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                    <div className={`h-full rounded-pill ${over ? 'bg-accent' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {over && <p className="mt-1 text-xs text-accent">预算已用完{pct >= 100 ? '（超支）' : ''}</p>}
                  {!over && pct >= 80 && <p className="mt-1 text-xs text-highlight">预算使用较高</p>}
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}


// ── 预算编辑金额表单（独立组件以使用 hooks） ──
function BudgetEditForm({
  name,
  initial,
  onSave,
}: {
  name: string
  initial: number // 分
  onSave: (amount: number) => void
}) {
  const [amount, setAmount] = useState(String(initial / 100))
  return (
    <div>
      <Field label={`${name} 预算金额（元/月）`}>
        <TextInput value={amount} onChange={setAmount} placeholder="如 1500" inputMode="decimal" />
      </Field>
      <button
        onClick={() => {
          const yuan = Number(amount)
          if (!yuan || Number.isNaN(yuan)) return
          onSave(Math.round(yuan * 100))
        }}
        className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg"
      >
        保存
      </button>
    </div>
  )
}

// ── 预算列表（页内：进度 + 编辑金额 + 删除；点行编辑） ──
function BudgetList({ onEdit }: { onEdit: () => void }) {
  const { budgets, update, remove } = useBudgetStore()
  const { categories } = useCategoryStore()
  const { transactions } = useBookStore()
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const showToast = useAppStore((s) => s.showToast)

  const topOf = (catName: string): string => {
    const c = categories.find((x) => x.name === catName)
    if (!c) return catName
    return c.parent ? c.parent : c.name
  }
  const monthKey = dayjs().format('YYYY-MM')
  const budgetSpent = (topName: string): number =>
    transactions
      .filter((t) => txTypeOf(t) === 'expense' && t.time.startsWith(monthKey) && topOf(t.category || '') === topName)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
  const rows = budgets
    .map((b) => {
      const cat = categories.find((c) => c.name === b.category)
      return { id: b.id, name: b.category, icon: cat?.icon ?? '🗂', amount: b.amount, spent: budgetSpent(b.category) }
    })
    .sort((a, b) => b.spent / Math.max(b.amount, 1) - a.spent / Math.max(a.amount, 1))

  const openEdit = (r: (typeof rows)[number]) => {
    open(
      <Sheet title="修改预算" onClose={close}>
        <BudgetEditForm
          name={r.name}
          initial={r.amount}
          onSave={async (amount) => {
            await update(r.id, { amount })
            showToast('已更新')
            close()
          }}
        />
      </Sheet>,
    )
  }

  if (rows.length === 0) {
    return (
      <button onClick={onEdit} className="w-full rounded-card bg-surface py-8 text-sm text-ink-3 shadow-soft">
        还没有预算，点此设置
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const pct = Math.min(Math.round((r.spent / Math.max(r.amount, 1)) * 100), 100)
        const over = r.spent >= r.amount
        return (
          <Card key={r.id} onPress={() => openEdit(r)}>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink">
                  {r.icon} {r.name}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openEdit(r)
                    }}
                    className="text-xs text-ink-3"
                  >
                    编辑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void confirmSheet('删除预算', `删除「${r.name}」的预算？`).then((ok) => {
                        if (ok) {
                          void remove(r.id)
                          showToast('已删除')
                        }
                      })
                    }}
                    className="text-xs text-ink-3"
                  >
                    删除
                  </button>
                </div>
              </div>
              <p className="mt-1 text-sm text-ink-3">
                ¥{(r.spent / 100).toFixed(0)} / ¥{(r.amount / 100).toFixed(0)}
                <span className={`ml-2 ${over ? 'text-accent' : ''}`}>{pct}%</span>
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                <div className={`h-full rounded-pill ${over ? 'bg-accent' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
              </div>
              {over && <p className="mt-1 text-xs text-accent">预算已用完{pct >= 100 ? '（超支）' : ''}</p>}
              {!over && pct >= 80 && <p className="mt-1 text-xs text-highlight">预算使用较高</p>}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── 资产账户详情页（需求三） ──
// 结构：顶部「月度总览卡片」固定（本月收入/本月支出/当前余额），下方账单明细列表可滚动，
// 明细按当前账户筛选（支出 + 收入记录）。编辑/删除账户入口保留在顶部。
function AccountDetail({
  accId,
  onBack,
  onEdit,
  onDelete,
  onEditTx,
}: {
  accId: string
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onEditTx: (t: TransactionEntity) => void
}) {
  const { transactions } = useBookStore()
  const { categories } = useCategoryStore()
  // 实时从 store 取最新账户（编辑余额/删除后详情页即时刷新）
  const acc = useAccountStore((s) => s.accounts.find((a) => a.id === accId))

  // 该账户的支出/收入记录（转账不列入收支明细；按时间倒序）
  const accTxs = useMemo(() => {
    if (!acc) return []
    return transactions
      .filter((t) => t.account === acc.name && (txTypeOf(t) === 'expense' || txTypeOf(t) === 'income'))
      .sort((a, b) => b.time.localeCompare(a.time))
  }, [transactions, acc])
  const monthKey = dayjs().format('YYYY-MM')
  const monthIncome = accTxs.filter((t) => txTypeOf(t) === 'income' && t.time.startsWith(monthKey)).reduce((s, t) => s + Math.abs(t.amount), 0)
  const monthExpense = accTxs.filter((t) => txTypeOf(t) === 'expense' && t.time.startsWith(monthKey)).reduce((s, t) => s + Math.abs(t.amount), 0)
  const balance = acc?.balance ?? 0

  // 账户已删除：提示并返回
  if (!acc) {
    return (
      <div className="flex min-h-full flex-col items-center gap-3 px-6 pt-16 text-center">
        <span className="text-4xl">🗑️</span>
        <p className="text-base font-semibold text-ink">账户不存在</p>
        <p className="text-sm leading-relaxed text-ink-2">该账户可能已被删除。</p>
        <button type="button" onClick={onBack} className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-3 text-sm font-semibold text-bg">
          返回资产
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* 固定区（sticky 吸顶紧贴状态栏）：返回 + 账户名 + 操作 + 月度总览卡片 */}
      <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-2 pt-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              aria-label="返回资产"
              className="pressable flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-pill bg-surface-sunken text-ink-2"
            >
              ‹
            </button>
            <h2 className="truncate text-lg font-semibold text-ink">{acc.name}</h2>
            <span className="flex-shrink-0 text-xs text-ink-3">
              {acc.type}
              {acc.cardTail ? ` ·${acc.cardTail}` : ''}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <button type="button" onClick={onEdit} className="text-xs text-primary">
              编辑
            </button>
            <button type="button" onClick={onDelete} className="text-xs text-ink-3">
              删除
            </button>
          </div>
        </div>
        {/* 月度总览卡片（固定） */}
        <div className="rounded-card bg-surface p-4 shadow-soft">
          <p className="text-xs text-ink-3">{acc.kind === 'liability' ? '当前欠款' : '当前余额'}</p>
          <p className="mt-0.5 text-2xl font-bold text-ink">¥{(balance / 100).toFixed(2)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-card bg-surface-sunken/60 px-3 py-2">
              <p className="text-sm font-semibold text-accent">+¥{(monthIncome / 100).toFixed(2)}</p>
              <p className="text-xs text-ink-3">本月收入</p>
            </div>
            <div className="rounded-card bg-surface-sunken/60 px-3 py-2">
              <p className="text-sm font-semibold text-ink">-¥{(monthExpense / 100).toFixed(2)}</p>
              <p className="text-xs text-ink-3">本月支出</p>
            </div>
          </div>
        </div>
      </div>
      {/* 下方：按账户筛选的账单明细（可滚动） */}
      <div className="mt-1 flex flex-col gap-2">
        <p className="text-xs font-semibold text-ink-3">账单明细（{accTxs.length} 笔）</p>
        {accTxs.length === 0 ? (
          <p className="rounded-card bg-surface px-4 py-6 text-center text-sm text-ink-3 shadow-soft">该账户暂无支出/收入记录</p>
        ) : (
          accTxs.map((t) => {
            const type = txTypeOf(t)
            const cat = categories.find((c) => c.name === t.category)
            return (
              <Card key={t.id} onPress={() => onEditTx(t)}>
                <div className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{t.merchant || t.category || '未命名'}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-3">
                      {cat ? `${cat.icon} ${cat.name}` : t.category ?? '未分类'}
                      {t.note ? ` · ${t.note}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">{dayjs(t.time).format('YYYY-MM-DD HH:mm')}</p>
                  </div>
                  <p className={`ml-3 flex-shrink-0 text-base font-semibold ${type === 'income' ? 'text-accent' : 'text-ink'}`}>
                    {fmtYuan(t.amount)}
                  </p>
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── 自动记账设置内容（一键拾光等辅助记账能力；独立组件以使用 hooks） ──
// 默认扣款账户：从「应用设置」迁移至此统一入口（绑定同一 settings 字段 app.defaultAccount）
function DefaultAccountRow({ showToast }: { showToast: (m: string) => void }) {
  const defaultAccount = useSettingsStore((s) => s.defaultAccount)
  const patchApp = useSettingsStore((s) => s.patchApp)
  const accounts = useAccountStore((s) => s.accounts)
  const accLoaded = useAccountStore((s) => s.loaded)
  const loadAccs = useAccountStore((s) => s.load)
  useEffect(() => {
    if (!accLoaded) loadAccs()
  }, [accLoaded, loadAccs])
  return (
    <div className="rounded-card bg-surface-sunken/60 p-4">
      <p className="font-medium text-ink">默认扣款账户</p>
      <p className="mt-0.5 text-xs text-ink-2">OCR 识别内容带账户时优先识别填充；未带则用此默认账户。</p>
      <select
        value={defaultAccount}
        onChange={(e) => {
          void patchApp({ defaultAccount: e.target.value })
          showToast(e.target.value ? `默认扣款：${e.target.value}` : '已清除默认扣款账户')
        }}
        className="titia-input mt-2 w-full max-w-[220px] rounded-btn bg-surface px-2.5 py-1.5 text-sm text-ink outline-none"
      >
        <option value="">未设置</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.name}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function AutoBookContent({ showToast }: { showToast: (m: string) => void }) {
  const [showSteps, setShowSteps] = useState(false)
  const [showRules, setShowRules] = useState(false)
  // 双引擎开关（设置持久化）
  const aiAutoCategory = useSettingsStore((s) => s.aiAutoCategory)
  const ruleFirst = useSettingsStore((s) => s.ruleFirst)
  const patchApp = useSettingsStore((s) => s.patchApp)

  // 手动读取剪贴板拾光数据（需求七：点击后直接 读取→解析→生成识别结果，无中间提示；
  // iOS 系统级「允许粘贴」弹窗由平台弹出，前端无法屏蔽，其余中间文案一律不出现）
  const readClipboard = async () => {
    const { tryReadCaptureClipboard } = await import('../../services/captureClipboard')
    const found = await tryReadCaptureClipboard()
    if (found) {
      navigate('/capture')
    } else {
      showToast('剪贴板没有拾光数据（需以 TITIA_CAPTURE:: 开头）')
    }
  }

  // 识别规则管理子视图（在自动记账 Sheet 内切换）
  if (showRules) {
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setShowRules(false)}
          className="pressable self-start rounded-pill bg-surface-sunken px-3 py-1.5 text-xs text-ink-2"
        >
          ‹ 返回自动记账
        </button>
        <RulesManager />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 📸 一键拾光 */}
      <div className="rounded-card bg-surface-sunken/60 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-primary-soft text-xl">📸</span>
          <div>
            <p className="font-medium text-ink">一键拾光</p>
            <p className="mt-0.5 text-xs text-ink-2">截图支付凭证，自动识别生成账单</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-2">
          自动记账中的一种识别方式：通过 iOS 快捷方式快速录入消费记录。截图 → 快捷方式 →
          识别账单信息 → 生成待确认记录 → 保存到账单（复用现有分类/账户/预算/资产体系）。
        </p>
        <button
          onClick={() => setShowSteps((v) => !v)}
          className="pressable mt-3 w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-medium text-bg"
        >
          设置快捷方式
        </button>
        {showSteps && (
          <div className="mt-3 rounded-card bg-surface p-3 text-xs leading-relaxed text-ink-2">
            <p className="mb-2 font-medium text-ink">剪贴板接力（不打开网页）：</p>
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                <b>截屏</b>：添加动作「截屏」——运行时自动截取当前屏幕。
              </li>
              <li>
                <b>从图像中提取文本（OCR）</b>：添加动作「从图像中提取文本」，点「图像」参数选「截屏」——
                输出魔法变量「提取的文本」（`Text`）。
              </li>
              <li>
                <b>文本（加前缀）</b>：添加动作「文本」，内容填
                <code className="mx-0.5 rounded bg-surface-sunken px-1">TITIA_CAPTURE::</code>
                ，并把「提取的文本」变量接在后面。
              </li>
              <li>
                <b>复制到剪贴板</b>：添加动作「复制到剪贴板」，参数选上一步的「文本」。
              </li>
              <li>
                <b>（可选）显示通知</b>：添加动作「显示通知」，内容如"已拾光，打开 Titia 确认"。
              </li>
            </ol>
            <div className="mt-2 rounded-pill bg-surface-sunken/60 p-2 text-[11px]">
              <p className="mb-1 font-medium text-ink-2">完成后：保存快捷方式 → 长按 → 添加到主屏幕。</p>
              <p className="text-ink-3">桌面点「一键拾光」→ 截屏 → OCR → 写入剪贴板 → 打开 Titia App → 自动识别预览（不再跳转网页）。</p>
            </div>
            <button
              onClick={readClipboard}
              className="pressable mt-2 w-full rounded-pill bg-surface-sunken px-3 py-2 text-xs text-primary"
            >
              📥 从剪贴板读取拾光数据
            </button>
            <p className="mt-2 text-[11px] text-ink-3">
              备用入口：若 App 启动未自动检测到，可点上方按钮手动读取（剪贴板需以 TITIA_CAPTURE:: 开头）。
            </p>
          </div>
        )}
        <button
          onClick={readClipboard}
          className="pressable mt-2 w-full rounded-pill bg-surface-sunken px-3 py-2 text-xs text-primary"
        >
          📥 从剪贴板读取拾光数据
        </button>
      </div>

      {/* 默认扣款账户（已从「应用设置」迁移至此统一入口） */}
      <DefaultAccountRow showToast={showToast} />

      {/* ⚡ 识别规则：关键词/交易方 → 自动归类（双引擎融合） */}
      <button
        onClick={() => setShowRules(true)}
        className="pressable flex items-center justify-between rounded-card bg-surface-sunken/60 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-highlight-soft text-xl">⚡</span>
          <div>
            <p className="font-medium text-ink">识别规则</p>
            <p className="mt-0.5 text-xs text-ink-2">关键词/交易方命中 → 自动预填分类与账户</p>
          </div>
        </div>
        <span className="text-xs text-ink-3">管理 ›</span>
      </button>

      {/* 双引擎开关：AI 自动识别 / 规则优先 */}
      <ToggleRow
        label="AI 自动识别"
        desc="规则未命中时自动用 AI 识别分类（需已在记一笔处配置 AI Key）"
        on={aiAutoCategory}
        onChange={(v) => void patchApp({ aiAutoCategory: v })}
      />
      <ToggleRow
        label="规则优先于 AI"
        desc="开启：先规则后 AI；关闭：先 AI 后规则"
        on={ruleFirst}
        onChange={(v) => void patchApp({ ruleFirst: v })}
      />

      {/* 🤖 自定义识别提示词（直接接入 API system role） */}
      <AiPromptEditor />

      {/* 说明：自动记账定位 */}
      <div className="rounded-card bg-surface p-4 text-xs leading-relaxed text-ink-2">
        <p className="mb-1 font-medium text-ink">自动记账</p>
        <p>小账内部的辅助记账能力，不是独立功能板块。识别结果与手动记账进入同一套账单 / 分类 / 账户 / 预算 / 资产统计。</p>
        <p className="mt-2">未来扩展：图片截图识别、语音识别、银行流水导入、AI 整理。</p>
      </div>
    </div>
  )
}

// 设置开关行（AI 自动识别 / 规则优先于 AI）
function ToggleRow({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card bg-surface-sunken/60 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        className={`relative h-7 w-12 flex-shrink-0 rounded-pill transition-colors ${on ? 'bg-primary' : 'bg-surface'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-pill bg-bg shadow-sm transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  )
}

// 自定义 AI 识别系统提示词编辑器（直接写入 localStorage，下次 aiRecognize 即生效）
function AiPromptEditor() {
  const [text, setText] = useState(() => getAiSystemPrompt())
  const [expanded, setExpanded] = useState(false)
  const dirtyRef = useRef(false)

  const handleSave = () => {
    setAiSystemPrompt(text)
    dirtyRef.current = false
  }

  // blur 时自动保存
  const handleBlur = () => {
    if (dirtyRef.current) handleSave()
  }

  const handleReset = () => {
    void confirmSheet('恢复默认提示词', '将清除自定义提示词并恢复内置默认，下次 AI 识别即使用默认 prompt。').then((ok) => {
      if (!ok) return
      setText('')
      setAiSystemPrompt('')
      setExpanded(false)
    })
  }

  const hasCustom = text.trim().length > 0

  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface-sunken/60 p-4">
      {/* 折叠行 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="pressable flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-primary-soft text-xl">🤖</span>
          <div>
            <p className="font-medium text-ink">自定义识别提示词</p>
            <p className="mt-0.5 text-xs text-ink-2">
              {hasCustom ? '已设置自定义 prompt（覆盖内置默认）' : '使用内置默认提示词'}
            </p>
          </div>
        </div>
        <span className={`text-xs text-ink-3 transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
      </button>

      {/* 展开编辑区 */}
      {expanded && (
        <>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); dirtyRef.current = true }}
            onBlur={handleBlur}
            rows={6}
            placeholder="输入自定义系统提示词…&#10;&#10;留空则使用内置默认提示词（含分类列表、金额规则、合并/去重规则）。&#10;自定义内容将直接作为 API 的 system role 发送。"
            className="w-full resize-y rounded-lg border border-line bg-bg p-3 text-xs leading-relaxed text-ink outline-none focus:border-primary"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-3">{text.length} 字符</span>
            <div className="flex gap-2">
              {hasCustom && (
                <button
                  onClick={handleReset}
                  className="pressable rounded-pill px-3 py-1.5 text-xs text-ink-2"
                >
                  恢复默认
                </button>
              )}
              <button
                onClick={handleSave}
                className="pressable rounded-pill bg-primary px-4 py-1.5 text-xs font-medium text-bg"
              >
                保存
              </button>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-3">
            提示词将作为 DeepSeek API 的 <code className="rounded bg-surface-sunken px-1">system</code> role 直接发送。
            修改后下次「AI 自动识别」立即生效。建议保留 JSON 输出格式与分类列表约束，否则识别结果可能异常。
          </p>
        </>
      )}
    </div>
  )
}
