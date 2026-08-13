import type { ReactNode } from 'react'

// Titia 时序 · Sheet 表单零件
// 统一输入框/文本域/胶囊选择的外观，专供底部 Sheet 内使用。

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm text-ink-2">{label}</span>
      {children}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'email' | 'url'
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="titia-input w-full resize-none rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
    />
  )
}

// 日期选择器：<input type="date"> —— iOS Safari 原生弹出滚轮（iOS Date Picker），
// 安卓 Chrome 原生日历，均禁止手动输入。统一所有日期字段的录入方式。
export function DateInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
    />
  )
}

export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-pill px-3 py-1.5 text-sm ${
            value === o.key ? 'bg-primary text-bg' : 'bg-surface-sunken text-ink-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// 开关（iOS 风格）。受控组件：checked + onChange。
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 overflow-hidden rounded-pill transition-colors ${
        checked ? 'bg-primary' : 'bg-surface-sunken'
      }`}
    >
      <span
        className={`pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-pill bg-bg shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// 开关行：左文案 + 右开关，整行可点击。
export function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-card bg-surface-sunken px-4 py-3 text-left"
    >
      <span>
        <span className="block text-ink">{label}</span>
        {desc && <span className="mt-0.5 block text-xs text-ink-3">{desc}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </button>
  )
}
