import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useBookStore } from '../../stores/useBookStore'
import { useAppStore } from '../../stores/useAppStore'
import { useCategoryStore } from '../../stores/useCategoryStore'
import type { CategoryEntity } from '../../db/types'
import { queuePendingBill } from '../../services/dataService'
import { TextInput } from '../../components/base/fields'

// Titia 时序 · 快速记账（小账主入口）
// 方式一：数字键盘 + 分类（点分类即记账，极简 3 步：输金额 → 点分类 → 完成）
// 方式二：自然语言输入（兜底，自动解析金额/备注/收支）
// 设计：不设置账户（极简），记账数据结构与资产联动逻辑不变（数据层 useBookStore.add 复用）。
//
// 分类按钮直接取自小账分类 store（useCategoryStore），与小账已有分类实时同步：
// 用户在「小账 → 分类管理」增删改的分类，会立即反映到快记入口，不再写死 8 个图标。

// 收入判定：一级名为「收入」或父级为「收入」（与小账分类体系一致）
function isIncomeCat(c: CategoryEntity): boolean {
  return c.name === '收入' || c.parent === '收入'
}

// 自然语言解析：金额 + 备注 + 收支判定
// 规则：数字前/后的文字作为备注，数字为金额；出现 工资/奖金/退款/红包 等 → 收入
function parseNatural(
  text: string,
): { amount: number; txType: 'expense' | 'income'; note: string; category?: string } | null {
  const t = (text || '').trim()
  if (!t) return null
  const m = t.match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const numStr = m[0]
  const amount = Math.round(parseFloat(numStr) * 100)
  if (!amount) return null
  const note = t.replace(numStr, '').replace(/[元￥¥\s]/g, '').trim()
  const isIncome = /工资|薪资|奖金|提成|退款|红包|报销|利息|补贴|转账收入|二手/.test(t)
  let category: string | undefined
  if (isIncome) {
    if (/工资|薪资|奖金|提成/.test(t)) category = '工资'
    else if (/退款/.test(t)) category = '退款收入'
    else if (/红包/.test(t)) category = '红包收入'
    else category = '收入'
  } else {
    if (/餐|饭|吃|奶茶|咖啡|外卖|早餐|午餐|晚餐|夜宵|零食|饮料|水果|菜/.test(t)) category = '餐饮'
    else if (/书|买|购|淘宝|京东|拼多多|天猫|衣服|鞋|包|护肤|美妆|化妆|数码|手机|电脑|耳机/.test(t)) category = '购物'
    else if (/打车|地铁|公交|火车|加油|出行|交通|滴滴|停车/.test(t)) category = '交通出行'
    else if (/房租|话费|水电|居家|物业|住|宽带/.test(t)) category = '住房生活'
    else category = '其他'
  }
  return { amount, txType: isIncome ? 'income' : 'expense', note, category }
}

export function QuickBook({ onAdvanced }: { onAdvanced: () => void }) {
  const add = useBookStore((s) => s.add)
  const showToast = useAppStore((s) => s.showToast)
  const categories = useCategoryStore((s) => s.categories)
  const loadCats = useCategoryStore((s) => s.load)
  const [raw, setRaw] = useState('')
  const [nl, setNl] = useState('')
  const [saving, setSaving] = useState(false)

  // 确保分类已加载（小账页通常已 load，这里兜底）
  useEffect(() => {
    if (!categories.length) void loadCats()
  }, [categories.length, loadCats])

  // 快记分类 = 小账全部一级分类（与分类管理实时同步）
  const quickCats = useMemo(
    () => categories.filter((c) => !c.parent).sort((a, b) => a.order - b.order),
    [categories],
  )

  const press = (k: string) => {
    setRaw((prev) => {
      if (k === '⌫') return prev.slice(0, -1)
      if (k === '.') {
        if (prev.includes('.')) return prev
        return prev === '' ? '0.' : prev + '.'
      }
      // 数字
      if (prev.includes('.')) {
        const dec = prev.split('.')[1] || ''
        if (dec.length >= 2) return prev // 最多两位小数
      }
      if (prev === '0') return k // 避免前导 0
      return prev + k
    })
  }

  const yuan = parseFloat(raw || '0')
  const fen = Math.round(yuan * 100)

  const doSave = async (c: CategoryEntity) => {
    if (!fen || fen <= 0) {
      showToast('请输入金额')
      return
    }
    const txType = isIncomeCat(c) ? 'income' : 'expense'
    setSaving(true)
    try {
      const tx = await add({
        amount: txType === 'expense' ? fen : -fen,
        txType,
        category: c.name,
        time: dayjs().format('YYYY-MM-DDTHH:mm'),
        source: 'manual',
      })
      queuePendingBill(tx)
      showToast(txType === 'income' ? `已记收入 ¥${(fen / 100).toFixed(2)}` : `已记支出 ¥${(fen / 100).toFixed(2)}`)
      setRaw('')
    } finally {
      setSaving(false)
    }
  }

  const doNl = async () => {
    const p = parseNatural(nl)
    if (!p || !p.amount) {
      showToast('没看懂金额，试试「午餐35」')
      return
    }
    setSaving(true)
    try {
      const tx = await add({
        amount: p.txType === 'expense' ? p.amount : -p.amount,
        txType: p.txType,
        category: p.category,
        note: p.note || undefined,
        time: dayjs().format('YYYY-MM-DDTHH:mm'),
        source: 'manual',
      })
      queuePendingBill(tx)
      showToast('已记账')
      setNl('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 金额显示 */}
      <div className="flex items-baseline justify-end rounded-card bg-surface-sunken px-4 py-3">
        <span className="text-3xl font-bold tabular-nums text-ink">{raw === '' ? '0.00' : raw}</span>
        <span className="ml-1 text-sm text-ink-3">元</span>
      </div>

      {/* 数字键盘（方式一） */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="pressable flex h-14 items-center justify-center rounded-btn bg-surface-sunken text-xl font-medium text-ink active:bg-surface"
          >
            {k}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRaw('')}
        className="pressable -mt-2 w-full rounded-btn bg-surface-sunken/60 py-2 text-sm text-ink-2"
      >
        清空
      </button>

      {/* 分类（方式一：点分类即记账，分类取自小账分类 store 实时同步） */}
      <p className="text-xs font-medium text-ink-3">点分类完成记账</p>
      {quickCats.length === 0 ? (
        <p className="text-xs text-ink-3">分类加载中…</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {quickCats.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={saving}
              onClick={() => void doSave(c)}
              className="pressable flex flex-col items-center gap-1 rounded-card bg-surface px-1 py-3 active:scale-95"
            >
              <span className="text-2xl leading-none">{c.icon === '·' ? '📁' : c.icon}</span>
              <span className="text-xs text-ink">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* 自然语言（方式二：兜底） */}
      <div className="rounded-card bg-surface-sunken/50 p-3">
        <p className="mb-2 text-xs font-medium text-ink-3">或一句话记账（如「午餐35」「工资8000」）</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <TextInput value={nl} onChange={setNl} placeholder="午餐35 / 工资8000" inputMode="text" />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void doNl()}
            className="pressable flex-shrink-0 rounded-pill bg-primary px-4 text-sm font-medium text-bg"
          >
            记账
          </button>
        </div>
      </div>

      {/* 高级 / 转账（开完整表单） */}
      <button
        type="button"
        onClick={onAdvanced}
        className="pressable w-full rounded-pill bg-surface-sunken py-2.5 text-sm text-ink-2"
      >
        转账 / 高级记账 ›
      </button>
    </div>
  )
}
