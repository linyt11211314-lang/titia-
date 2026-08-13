import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useBookStore, matchRuleByKeyword } from '../../stores/useBookStore'
import { useAppStore } from '../../stores/useAppStore'
import { useCategoryStore } from '../../stores/useCategoryStore'
import { useAccountStore } from '../../stores/useAccountStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { Sheet } from '../../components/base/Sheet'
import { ToggleRow } from '../../components/base/fields'
import { navigate } from '../../app/useHashRoute'
import { haptic } from '../../services/haptic'
import { takePendingCapture, isCaptureDone, markCaptureDone } from '../../services/captureClipboard'
import { parseCaptureText, parseMultiCaptureText } from '../../services/captureParser'
import { aiRecognize, type AiResult } from '../../services/ai'
import { compressImage } from '../../services/media'
import { mediaRepo } from '../../db/repos'
import { queuePendingBill } from '../../services/dataService'
import { confirmSheet } from '../../components/base/Confirm'
import { BookForm, catDisplay } from './BookPage'
import type { TransactionEntity } from '../../db/types'

// Titia 时序 · 一键拾光（自动记账·识别确认页 RecognitionPreview + SaveHandler）
// 入口：App 启动检测剪贴板（TITIA_CAPTURE::…）→ 进入本页；或旧快捷方式 URL #/capture?text=…
// 识别：CaptureParser 解析金额/商户/时间/账户 + 现有规则库自动分类（无法识别 → 未分类）；
//      规则无法判断时调用 AI 辅助解析（仅识别/建议，结果仍进确认流程，不直接改数据）。
// 确认页显示：类型/金额/交易对象/分类/账户 + 完成/修改。
// 完成 → 保存账单（source:'shortcut'）→ 回小账；修改 → 进入账单详情编辑页。
// 未识别（OCR 失败）→ 提示并提供手动记账入口。

function parseQuery(raw: string): Record<string, string> {
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
  const out: Record<string, string> = {}
  for (const pair of q.split('&')) {
    const [k, ...rest] = pair.split('=')
    if (!k) continue
    out[decodeURIComponent(k)] = decodeURIComponent(rest.join('='))
  }
  return out
}

export function CapturePage({ raw }: { raw: string }) {
  const q = useMemo(() => parseQuery(raw), [raw])
  const categories = useCategoryStore((s) => s.categories)
  const accounts = useAccountStore((s) => s.accounts)
  const rules = useBookStore((s) => s.rules)
  // 默认扣款账户（设置项）：OCR 未带账户信息时预填（支出用）
  const defaultAccount = useSettingsStore((s) => s.defaultAccount)
  // 默认收入账户（第一个非负债账户）：收入记账默认入账，避免误入信用卡导致余额联动错误
  const incomeAccount = useMemo(() => accounts.find((a) => a.kind !== 'liability')?.name ?? defaultAccount, [accounts, defaultAccount])
  // 多笔识别过滤开关（持久化到设置，作为默认；本页可即时切换）
  const captureOnlyRealPaySetting = useSettingsStore((s) => s.captureOnlyRealPay)
  const captureIgnoreLogisticsSetting = useSettingsStore((s) => s.captureIgnoreLogistics)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const showToast = useAppStore((s) => s.showToast)
  const [saved, setSaved] = useState(false)

  // 剪贴板接力数据优先（App 启动检测剪贴板 → 进入本页）；否则解析 URL query（兼容旧快捷方式）；
  // 也支持直接在面板里粘贴账单文本（普通复制的支付信息，无需 TITIA_CAPTURE:: 前缀）
  const clip = useMemo(() => takePendingCapture(), [])
  const [manual, setManual] = useState('')
  const rawText = (clip?.text || q.text || q.merchant || manual).trim()

  // 多笔识别过滤开关：本页可即时切换，并持久化到设置作为下次默认
  const [onlyRealPay, setOnlyRealPay] = useState(captureOnlyRealPaySetting)
  const [ignoreLogistics, setIgnoreLogistics] = useState(captureIgnoreLogisticsSetting)
  const toggleOnlyRealPay = (v: boolean) => {
    setOnlyRealPay(v)
    void useSettingsStore.getState().patchApp({ captureOnlyRealPay: v })
  }
  const toggleIgnoreLogistics = (v: boolean) => {
    setIgnoreLogistics(v)
    void useSettingsStore.getState().patchApp({ captureIgnoreLogistics: v })
  }

  // CaptureParser：解析金额/商户/时间/账户（剪贴板显式字段优先，文本解析兜底）
  const parsed = useMemo(() => parseCaptureText(rawText), [rawText])
  // 多笔拆分（需求三）：同一截图含多笔消费 → 多候选；不足 2 笔回退单笔流程
  const multi = useMemo(() => parseMultiCaptureText(rawText, { onlyRealPay, ignoreLogistics }), [rawText, onlyRealPay, ignoreLogistics])
  // 多笔勾选状态（默认全选）
  const [checked, setChecked] = useState<boolean[]>([])
  useEffect(() => {
    setChecked(multi.map(() => true))
  }, [multi])
  // 类型：由解析器判定——命中收入关键词（工资/收款/退款/红包/转账收入等）为收入，否则支出
  const txType = useMemo<'expense' | 'income'>(() => (parsed.isExpense ? 'expense' : 'income'), [parsed.isExpense])

  // AI 辅助解析（需求八）：规则/解析无法判断时调用 AI 纠错——AI 仅识别/建议，结果仍进确认流程，不直接改数据
  const [ai, setAi] = useState<AiResult | null>(null)
  useEffect(() => {
    if (!rawText.trim() || ai !== null) return
    const ruleHit = matchRuleByKeyword(rawText, undefined, useBookStore.getState().rules)
    const ruleCategory = ruleHit?.category ?? '未分类'
    const need = ruleCategory === '未分类' || amountFen === null
    if (!need) return
    let alive = true
    aiRecognize(rawText).then((r) => {
      if (alive && r) setAi(r)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawText, ai])

  // 分类：规则匹配原始 OCR 文本（真实商户关键词可靠命中）；未命中 → AI 建议 → 未分类
  const rule = useMemo(() => matchRuleByKeyword(rawText, undefined, rules), [rawText, rules])
  const category = (rule?.category ?? ai?.category ?? '未分类')
  // 商户：规则关键词上下文优先 → AI 商户 → 候选最长中文段
  const merchant = useMemo(() => {
    if (rule?.merchant) return rule.merchant
    if (rule && rawText) {
      const idx = rawText.indexOf(rule.keyword)
      if (idx >= 0) {
        const seg = rawText.slice(idx).match(/^[^\s（）()\-—–·，,。]{2,40}/)?.[0]
        if (seg) return seg.slice(0, 40)
      }
    }
    if (ai?.merchant) return ai.merchant.slice(0, 40)
    const cands = parsed.merchantCandidates.length > 0 ? parsed.merchantCandidates : [parsed.merchant]
    const zh = [...cands].sort((a, b) => (b.match(/[\u4e00-\u9fa5]/g)?.length ?? 0) - (a.match(/[\u4e00-\u9fa5]/g)?.length ?? 0))
    return (zh[0] || rawText.slice(0, 40)).slice(0, 40)
  }, [rule, rawText, parsed.merchant, parsed.merchantCandidates, ai?.merchant])

  // 金额：显式字段 → 解析 → AI 建议
  const amountFen = useMemo(() => {
    if (clip?.amount != null && Number(clip.amount) > 0) return Math.round(Number(clip.amount) * 100)
    if (q.amount) {
      const n = Number(q.amount)
      if (!Number.isNaN(n) && n > 0) return Math.round(n * 100)
    }
    if (parsed.amountFen !== null) return parsed.amountFen
    return ai?.amount ?? null
  }, [clip?.amount, q.amount, parsed.amountFen, ai?.amount])

  // 账户：OCR 显式带账户 → 识别填充；未带 → 默认扣款账户（设置项；账户不存在则不预填）
  const account = useMemo(() => {
    const hint = clip?.account || q.account || parsed.accountHint || ai?.account
    if (hint) {
      const a = accounts.find((x) => x.name === hint || x.name.includes(hint) || hint.includes(x.name))
      if (a) return a.name
    }
    const def = txType === 'income' ? incomeAccount : defaultAccount
    return def && accounts.some((x) => x.name === def) ? def : undefined
  }, [clip?.account, q.account, parsed.accountHint, ai?.account, accounts, defaultAccount, incomeAccount, txType])

  // 时间：剪贴板/URL 显式 → 文本解析 → 当前时间
  const time = useMemo(() => {
    const t = clip?.time || q.time || parsed.time
    return t && dayjs(t).isValid() ? t : dayjs().format('YYYY-MM-DD HH:mm')
  }, [clip?.time, q.time, parsed.time])

  // 未识别判定（OCR 失败/无有效内容）：金额与商户都没有 → 提示手动记账
  const unrecognized = useMemo(
    () => parsed.confidence === 'low' && amountFen === null && !rawText.trim(),
    [parsed.confidence, amountFen, rawText],
  )

  // 防重复（需求九）：URL 来源且同一内容已保存过 → 不重复生成（剪贴板来源已在 listener 层过滤）
  const alreadyDone = useMemo(() => {
    if (!rawText || clip) return false
    return isCaptureDone(rawText)
  }, [rawText, clip])

  // 用户编辑覆盖（点字段编辑识别结果；编辑后的值优先于解析结果）
  const [edited, setEdited] = useState<
    Partial<{ amountFen: number; merchant: string; category: string; account?: string; time: string; note: string }>
  >({})
  const amt = edited.amountFen ?? amountFen
  const mch = edited.merchant ?? merchant
  const cat = edited.category ?? category
  const acc = edited.account ?? account
  const tm = edited.time ?? time
  const nte = edited.note ?? '自动识别'

  // 打开编辑表单：编辑待确认识别结果（不落库，保存由「保存」按钮执行）
  const openForm = () => {
    open(
      <Sheet title="编辑识别结果" onClose={close}>
        <BookForm
          initial={{
            amount: amt ?? undefined,
            txType,
            merchant: mch || undefined,
            category: cat !== '未分类' ? cat : undefined,
            account: acc,
            time: tm,
            note: nte !== '自动识别' ? nte : undefined,
          }}
          onSave={(d) => {
            setEdited({
              amountFen: d.amount,
              merchant: d.merchant,
              category: d.category ?? '未分类',
              account: d.account,
              time: d.time,
              note: d.note ?? '自动识别',
            })
            close()
          }}
        />
      </Sheet>,
    )
  }
  // 手动记账入口（未识别兜底）：回小账并开新表单
  const openManual = () => {
    navigate('/book')
    setTimeout(() => {
      open(
        <Sheet title="记一笔" onClose={close}>
          <BookForm
            onSave={async (d) => {
              await useBookStore.getState().add({ ...d, source: d.source ?? 'shortcut' })
              close()
            }}
          />
        </Sheet>,
      )
    }, 200)
  }

  // 保存：创建正式账单（source:'shortcut'）→ 附件 → 预算/资产统计（add 内自动）→ 回小账
  const saveTx = async (): Promise<void> => {
    if (saved) return
    // 重复检测（需求五）：金额+交易对象+时间+账户 组合与已有账单比对 → 提示是否继续
    const dup = useBookStore
      .getState()
      .findDuplicate({ amount: amt ?? 0, merchant: mch, account: acc, time: tm, txType })
    if (dup) {
      const ok = await confirmSheet(
        '可能重复记账',
        `检测到与已有账单相同（${dup.merchant || dup.category || '账单'} ¥${(Math.abs(dup.amount) / 100).toFixed(2)}），是否继续保存？`,
        { confirmText: '继续保存' },
      )
      if (!ok) return
    }
    setSaved(true)
    try {
      const tx = await useBookStore.getState().add({
        // 收入在库中存为负值（与 BookForm 一致），余额联动按 txType 推导，符号不影响正确性
        amount: txType === 'income' ? -(amt ?? 0) : amt ?? 0,
        txType,
        merchant: mch || undefined,
        category: cat !== '未分类' ? cat : undefined,
        account: acc,
        time: tm,
        note: nte !== '自动识别' ? nte : undefined,
        source: 'shortcut',
      })
      showToast(`已保存：${mch || '账单'} ¥${((amt ?? 0) / 100).toFixed(2)}`)
      // 防重复：标记该内容已处理
      try {
        markCaptureDone(rawText)
      } catch {
        /* 忽略 */
      }
      // 截图附件：剪贴板 JSON 携带 mediaB64（支付截图）→ 存入 media 并关联账单
      if (clip?.mediaB64) {
        try {
          const b64 = clip.mediaB64.includes(',') ? clip.mediaB64.split(',')[1] : clip.mediaB64
          const bin = atob(b64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const file = new File([bytes], 'capture.png', { type: 'image/png' })
          const img = await compressImage(file)
          const mid = crypto.randomUUID()
          await mediaRepo.create({
            id: mid,
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
          await useBookStore.getState().update(tx.id, { mediaIds: [mid] })
        } catch {
          /* 附件失败不影响账单保存 */
        }
      }
      // 跨容器桥：经 DataService 写入 localStorage（若 iOS PWA/Safari 共享 localStorage，桌面 App 打开/下拉刷新即合并）
      queuePendingBill(tx)
      // 云同步：当前阶段本地存储优先（不接云端接口），未来需要多设备同步时再单独接入
    } catch {
      /* 保存失败不阻塞返回 */
    }
    haptic()
    navigate('/book')
  }

  // 多笔批量保存（需求三）：勾选候选 → 重复检测 → 逐笔入库 → 附件挂第一笔 → 回小账
  const saveMulti = async (): Promise<void> => {
    if (saved) return
    const selected = multi.filter((_, i) => checked[i] ?? false)
    if (selected.length === 0) return showToast('请选择要保存的账单')
    // 重复检测（需求五）：任一候选命中已有账单 → 统一提示一次
    const store = useBookStore.getState()
    const dupCount = selected.filter((c) =>
      store.findDuplicate({ amount: c.amountFen, merchant: c.merchant, account: c.accountHint ?? undefined, time: c.time, txType: c.isExpense ? 'expense' : 'income' }),
    ).length
    if (dupCount > 0) {
      const ok = await confirmSheet('可能重复记账', `检测到 ${dupCount} 笔与已有账单相同（金额/交易对象/时间/账户），是否继续保存？`, {
        confirmText: '继续保存',
      })
      if (!ok) return
    }
    setSaved(true)
    try {
      let okCount = 0
      const txs: TransactionEntity[] = []
      for (const c of selected) {
        const cType: 'expense' | 'income' = c.isExpense ? 'expense' : 'income'
        const cat = matchRuleByKeyword(c.merchant, undefined, useBookStore.getState().rules)?.category
        const def = cType === 'income' ? incomeAccount : defaultAccount
        const tx = await store.add({
          // 收入在库中存为负值（与 BookForm 一致）
          amount: cType === 'income' ? -c.amountFen : c.amountFen,
          txType: cType,
          merchant: c.merchant || undefined,
          category: cat && cat !== '未分类' ? cat : undefined,
          account: c.accountHint || (def && accounts.some((x) => x.name === def) ? def : undefined),
          time: c.time,
          note: '自动识别',
          source: 'shortcut',
        })
        txs.push(tx)
        okCount++
      }
      showToast(`已保存 ${okCount} 笔账单`)
      // 防重复：标记该内容已处理
      try {
        markCaptureDone(rawText)
      } catch {
        /* 忽略 */
      }
      // 截图附件：多笔场景挂到第一笔（需求八：删除账单时随账单清理，避免孤立图片）
      if (clip?.mediaB64 && txs[0]) {
        try {
          const b64 = clip.mediaB64.includes(',') ? clip.mediaB64.split(',')[1] : clip.mediaB64
          const bin = atob(b64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const file = new File([bytes], 'capture.png', { type: 'image/png' })
          const img = await compressImage(file)
          const mid = crypto.randomUUID()
          await mediaRepo.create({
            id: mid,
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
          await store.update(txs[0].id, { mediaIds: [mid] })
        } catch {
          /* 附件失败不影响账单保存 */
        }
      }
      // 跨容器桥：逐笔写入，另一容器经 storage 事件自动合并刷新
      txs.forEach((t) => queuePendingBill(t))
    } catch {
      /* 保存失败不阻塞返回 */
    }
    haptic()
    navigate('/book')
  }

  // 快捷方式侧删除系统临时截图（保存完成后通知；失败静默）
  useEffect(() => {
    if (q.cb && typeof (window as unknown as { shortcutDone?: (id: string) => void }).shortcutDone === 'function') {
      ;(window as unknown as { shortcutDone: (id: string) => void }).shortcutDone('done')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 复制诊断信息：OCR 文本 + 解析结果 → 剪贴板（便于用户粘贴反馈排查）
  const copyDiag = async (): Promise<void> => {
    const diag = [
      `OCR文本：${rawText || '（空）'}`,
      `金额：${amountFen !== null ? (amountFen / 100).toFixed(2) : '—'}`,
      `商户：${merchant || '—'}`,
      `分类：${catDisplay(category, categories)}`,
      `账户：${account ?? '未指定'}`,
      `解析详情：${JSON.stringify(parsed)}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(diag)
      showToast('诊断信息已复制，粘贴发给开发者')
    } catch {
      showToast('复制失败，请手动输入 OCR 文本')
    }
  }

  // 浏览器模式（快捷方式经 Safari 打开，非独立窗口）：数据与桌面 App 同源共享，仍可正常保存
  const standalone = window.matchMedia('(display-mode: standalone)').matches

  return (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden bg-bg">
      <div className="flex-1 px-5 pt-[calc(var(--safe-top)+24px)]">
        <div className="mb-4 text-center">
          <p className="text-xs text-ink-3">自动记账 · 一键拾光</p>
        </div>

        {!standalone && (
          <div className="mb-3 rounded-card bg-highlight-soft px-3 py-2 text-xs text-highlight">
            已在浏览器打开：识别与保存仍与桌面 App 完全同步，保存后打开桌面「Titia 时序」即可看到账单。
          </div>
        )}

        {/* 粘贴账单文本：复制支付截图里的文字直接粘贴，自动识别金额/商户/时间（增强剪贴板识别） */}
        {!clip && !q.text && !q.merchant && (
          <div className="mb-4 rounded-card bg-surface p-4 shadow-soft">
            <p className="mb-2 text-sm font-medium text-ink">粘贴账单文本</p>
            <textarea
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="复制支付截图里的文字，粘贴到这里自动识别金额 / 商户 / 时间"
              className="h-24 w-full resize-none rounded-btn bg-surface-sunken px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3"
            />
            {manual.trim() && (
              <p className="mt-2 text-xs text-ink-3">已读取文本，下方为识别预览（如需修改点字段即可）</p>
            )}
          </div>
        )}

        {alreadyDone ? (
          /* ═══ 该笔已处理过（防重复） ═══ */
          <div className="mt-8 flex flex-col items-center gap-3 px-6 text-center">
            <span className="text-4xl">✅</span>
            <p className="text-base font-semibold text-ink">该笔已处理过</p>
            <p className="text-sm leading-relaxed text-ink-2">同一份识别内容已保存过账单，未重复生成。</p>
            <button
              type="button"
              onClick={() => navigate('/book')}
              className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-3 text-sm font-semibold text-bg"
            >
              返回小账
            </button>
          </div>
        ) : unrecognized ? (
          /* ═══ OCR 未识别（验收：OCR 失败时提示并提供手动记账入口） ═══ */
          <div className="mt-8 flex flex-col items-center gap-3 px-6 text-center">
            <span className="text-4xl">🤔</span>
            <p className="text-base font-semibold text-ink">未识别到账单信息</p>
            <p className="text-sm leading-relaxed text-ink-2">
              剪贴板内容未解析出金额或商户（可能截图不清晰、OCR 失败）。可直接手动记账，或重新截图后再试。
            </p>
            <button
              type="button"
              onClick={openManual}
              className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-3 text-sm font-semibold text-bg"
            >
              ✍️ 手动记账
            </button>
            <button
              type="button"
              onClick={() => navigate('/book')}
              className="pressable w-full rounded-pill bg-surface-sunken px-4 py-2.5 text-sm text-ink-2"
            >
              返回小账
            </button>
          </div>
        ) : multi.length >= 2 ? (
          /* ═══ 多笔消费（需求三）：识别到 N 笔 → 勾选 → 全部保存 ═══ */
          <div className="mx-auto mt-10 w-full max-w-[360px]">
            <div className="overflow-hidden rounded-[24px] bg-surface shadow-card">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <p className="text-base font-semibold text-ink">识别到 {multi.length} 笔消费</p>
                <span className="rounded-pill bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">多笔</span>
              </div>
              {/* 高级过滤：减少 OCR 误识别（物流单号/单品原价）→ 仅保留真实消费 */}
              <div className="border-b border-line px-2 py-1">
                <ToggleRow
                  label="仅识别实付款"
                  desc="只收含「实付/支付金额/合计」的数字，忽略单品原价"
                  checked={onlyRealPay}
                  onChange={toggleOnlyRealPay}
                />
                <ToggleRow
                  label="忽略物流单号"
                  desc="过滤 3-6 位纯整数（订单/物流单号），默认开"
                  checked={ignoreLogistics}
                  onChange={toggleIgnoreLogistics}
                />
              </div>
              <div className="px-2 py-1">
                {multi.map((c, i) => {
                  const cat = matchRuleByKeyword(c.merchant, undefined, rules)?.category ?? '未分类'
                  const on = checked[i] ?? false
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setChecked((p) => p.map((v, j) => (j === i ? !v : v)))}
                      className="flex w-full items-center gap-3 rounded-btn px-3 py-2.5 text-left"
                      aria-label={`多笔账单 ${c.merchant}`}
                    >
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-[11px] ${
                          on ? 'border-primary bg-primary text-bg' : 'border-line text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{c.merchant}</p>
                        <p className="truncate text-xs text-ink-3">{catDisplay(cat, categories)}</p>
                      </div>
                      <p className="flex-shrink-0 text-base font-semibold text-ink">¥{(c.amountFen / 100).toFixed(2)}</p>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => navigate('/book')}
                className="pressable flex-1 rounded-pill bg-surface-sunken px-4 py-3 text-sm font-medium text-ink-2"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void saveMulti()}
                className="pressable flex-[1.4] rounded-pill bg-primary px-4 py-3 text-sm font-semibold text-bg"
              >
                全部保存（{(checked ?? []).filter(Boolean).length}）
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 多笔识别设置：单笔页也常驻，避免开启「仅识别实付款」后 multi 变少导致开关消失无法关回 */}
            <details className="mx-auto mt-6 w-full max-w-[360px] rounded-card bg-surface-sunken/50 p-3 text-xs text-ink-3">
              <summary className="cursor-pointer select-none">⚙️ 多笔识别设置（当前识别为单笔）</summary>
              <div className="mt-2">
                <ToggleRow
                  label="仅识别实付款"
                  desc="只收含「实付/支付金额/合计」的数字，忽略单品原价"
                  checked={onlyRealPay}
                  onChange={toggleOnlyRealPay}
                />
                <ToggleRow
                  label="忽略物流单号"
                  desc="过滤 3-6 位纯整数（订单/物流单号），默认开"
                  checked={ignoreLogistics}
                  onChange={toggleIgnoreLogistics}
                />
              </div>
            </details>
            {/* 预览弹窗：识别确认（字段全部来自解析结果；点任意字段进入编辑） */}
            <div className="mx-auto mt-10 w-full max-w-[360px]">
              <div className="overflow-hidden rounded-[24px] bg-surface shadow-card">
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <p className="text-base font-semibold text-ink">账单确认</p>
                  <span className="rounded-pill bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                    {txType === 'income' ? '收入' : '支出'}
                  </span>
                </div>
                {/* 字段区：点击进入编辑状态（改金额/分类/账户/时间/商户等） */}
                <button type="button" onClick={openForm} className="block w-full px-5 py-4 text-left" aria-label="编辑识别结果">
                  <div className="flex flex-col gap-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">金额</span>
                      <span className="text-lg font-bold text-ink">{amt !== null ? `¥${(amt / 100).toFixed(2)}` : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">类型</span>
                      <span className="font-medium text-ink">{txType === 'income' ? '收入' : '支出'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">商户</span>
                      <span className="max-w-[65%] truncate font-medium text-ink">{mch || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">分类</span>
                      <span className="max-w-[65%] truncate font-medium text-ink">{catDisplay(cat, categories)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">账户</span>
                      <span className="font-medium text-ink">{acc ?? '未指定'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">日期</span>
                      <span className="font-medium text-ink">{tm}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-3">备注</span>
                      <span className="max-w-[65%] truncate font-medium text-ink">{nte}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-right text-[11px] text-ink-3">点击字段可修改 ›</p>
                </button>
              </div>

              {/* 操作：取消（不保存，回小账） / 保存（创建账单+附件+统计） */}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/book')}
                  className="pressable flex-1 rounded-pill bg-surface-sunken px-4 py-3 text-sm font-medium text-ink-2"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void saveTx()}
                  className="pressable flex-[1.4] rounded-pill bg-primary px-4 py-3 text-sm font-semibold text-bg"
                >
                  保存
                </button>
              </div>
              {amt === null && (
                <p className="mt-3 text-center text-xs text-highlight">未识别到金额，点上方字段补充。</p>
              )}
              {/* 诊断：原始 OCR 文本（折叠，便于排查「为什么没识别」） */}
              <details className="mt-4 rounded-card bg-surface-sunken/40 p-3 text-xs text-ink-3">
                <summary className="cursor-pointer select-none">📋 查看原始 OCR 文本（用于排查）</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-2">{rawText || '（空）'}</pre>
                <p className="mt-2 text-[10px] text-ink-3">
                  解析：金额 {amt !== null ? `¥${(amt / 100).toFixed(2)}` : '—'} · 商户 「{mch || '—'}」 · 分类 {catDisplay(cat, categories)} · 账户 {acc ?? '未指定'}
                </p>
                <button
                  type="button"
                  onClick={() => void copyDiag()}
                  className="pressable mt-2 w-full rounded-pill bg-surface px-3 py-2 text-[11px] text-primary"
                >
                  复制诊断信息（粘贴发给开发者排查）
                </button>
              </details>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
