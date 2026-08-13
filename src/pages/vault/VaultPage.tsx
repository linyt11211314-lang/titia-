import { useEffect, useState } from 'react'
import { NavBar } from '../../components/nav/NavBar'
import { PageHost } from '../../components/nav/PageHost'
import { EmbeddedHeader } from '../../components/nav/EmbeddedHeader'
import { Card } from '../../components/base/Card'
import { EmptyState } from '../../components/base/EmptyState'
import { PlusIcon, CloseIcon } from '../../components/icons'
import { Sheet } from '../../components/base/Sheet'
import { Field, TextArea, TextInput } from '../../components/base/fields'
import { confirmSheet } from '../../components/base/Confirm'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useAppStore } from '../../stores/useAppStore'
import { useVaultStore, type VaultDraft, type VaultItemView } from '../../stores/useVaultStore'
import { platformLogo } from '../../theme/platformLogos'
import { SwipeRow } from '../../components/base/SwipeRow'

// Titia 时序 · 密码箱（主密码加密，仅本机）
export function VaultPage({ embedded = false }: { embedded?: boolean }) {
  const { hasVault, unlocked, items, loaded, damagedCount, damagedDismissed, init, setup, unlock, lock, add, update, remove, dismissDamagedHint } = useVaultStore()
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!loaded) init()
  }, [loaded, init])

  if (!loaded) {
    if (embedded) return null
    return (
      <>
        <NavBar title="密码箱" />
        <PageHost>{null}</PageHost>
      </>
    )
  }

  if (!hasVault) return <SetupView onSetup={setup} embedded={embedded} />
  if (!unlocked) return <UnlockView onUnlock={unlock} embedded={embedded} />

  const openForm = (editing?: VaultItemView) => {
    open(
      <Sheet title={editing ? '编辑账号' : '添加账号'} onClose={close}>
        <VaultForm
          initial={editing}
          onSave={async (d) => {
            if (editing) {
              await update(editing.id, d)
              showToast('已更新')
            } else {
              await add(d)
              showToast('已添加')
            }
            close()
          }}
        />
      </Sheet>,
    )
  }

  const onRemove = async (it: VaultItemView) => {
    if (await confirmSheet('删除账号', `删除「${it.name}」的密码记录？`)) {
      await remove(it.id)
      showToast('已删除')
    }
  }

  const copySecret = (s: string) => {
    navigator.clipboard?.writeText(s)
    showToast('已复制密码')
  }

  const content = (
    <>
      {embedded && (
        <EmbeddedHeader
          title="密码箱"
          right={
            <button onClick={lock} className="pressable rounded-pill bg-surface-sunken px-3.5 py-1.5 text-xs text-ink-2">
              锁定
            </button>
          }
        />
      )}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-3">已加密保存 · 仅本机</p>
        <button
          onClick={() => openForm()}
          className="pressable flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-pill bg-primary text-bg"
          aria-label="添加账号"
        >
          <PlusIcon width={18} height={18} />
        </button>
      </div>
      {damagedCount > 0 && !damagedDismissed && (
        <div className="mb-3 flex items-start gap-2 rounded-card bg-highlight-soft px-3 py-2.5 text-xs leading-relaxed text-highlight">
          <p className="min-w-0 flex-1">
            有 {damagedCount} 条记录无法解密（密文可能损坏或为旧格式）。数据保留在本地未删除；可到「我呀 →
            数据管理」导出备份排查，或重新添加对应账号。
          </p>
          <button
            onClick={dismissDamagedHint}
            aria-label="关闭提示"
            className="pressable -mr-1 -mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-highlight/60 hover:text-highlight"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          text="还没有保存的账号"
          action={
            <button onClick={() => openForm()} className="rounded-pill bg-primary px-4 py-2 text-sm text-bg">
              添加第一个
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <SwipeRow key={it.id} onDelete={() => onRemove(it)} onPress={() => openForm(it)}>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[12px] bg-surface-sunken text-lg">
                      {platformLogo(it.name)}
                    </span>
                    <p className="truncate font-semibold text-ink">{it.name}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(it)
                    }}
                    className="flex-shrink-0 text-xs text-ink-3"
                  >
                    删除
                  </button>
                </div>
                {it.account && <p className="mt-0.5 truncate text-sm text-ink-2">{it.account}</p>}
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">
                    {revealed[it.id] ? it.secret : '•'.repeat(Math.min(it.secret.length, 12)) || '••••••'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setRevealed((r) => ({ ...r, [it.id]: !r[it.id] }))
                    }}
                    className="flex-shrink-0 text-xs text-ink-3"
                  >
                    {revealed[it.id] ? '隐藏' : '显示'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copySecret(it.secret)
                    }}
                    className="flex-shrink-0 text-xs text-ink-3"
                  >
                    复制
                  </button>
                </div>
                {it.note && <p className="mt-1.5 text-xs text-ink-3">{it.note}</p>}
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
    </>
  )

  if (embedded) return content
  return (
    <>
      <NavBar
        title="密码箱"
        right={
          <button onClick={lock} className="text-sm text-ink-2">
            锁定
          </button>
        }
      />
      <PageHost>{content}</PageHost>
    </>
  )
}

// —— 首次：设置主密码 ——
function SetupView({ onSetup, embedded = false }: { onSetup: (master: string) => Promise<void>; embedded?: boolean }) {
  const showToast = useAppStore((s) => s.showToast)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (pw.length < 4) return showToast('主密码至少 4 位')
    if (pw !== pw2) return showToast('两次输入不一致')
    setBusy(true)
    await onSetup(pw)
    setBusy(false)
    showToast('密码箱已创建')
  }

  const content = (
    <>
      {embedded && <EmbeddedHeader title="密码箱" />}
      <div className={`rounded-card bg-surface p-5 shadow-card fade-up ${embedded ? '' : 'mt-6'}`}>
        <p className="text-2xl">🔐</p>
        <h2 className="mt-2 text-lg font-semibold text-ink">设置主密码</h2>
        <p className="mt-1 text-sm text-ink-2">
          主密码用于加密你的账号密码，<span className="text-ink">仅存于本机、不上传</span>。请务必牢记，遗忘将无法恢复。
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="设置主密码"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
          />
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="确认主密码"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
          />
          <button
            onClick={submit}
            disabled={busy}
            className="pressable mt-1 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg disabled:opacity-50"
          >
            创建密码箱
          </button>
        </div>
      </div>
    </>
  )

  if (embedded) return content
  return (
    <>
      <NavBar title="密码箱" />
      <PageHost>{content}</PageHost>
    </>
  )
}

// —— 已锁：输入主密码解锁 ——
function UnlockView({ onUnlock, embedded = false }: { onUnlock: (master: string) => Promise<boolean>; embedded?: boolean }) {
  const showToast = useAppStore((s) => s.showToast)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await onUnlock(pw)
      if (!ok) {
        setPw('')
        showToast('主密码错误，请检查大小写与首尾空格')
      }
    } catch {
      setPw('')
      showToast('解锁失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const content = (
    <>
      {embedded && <EmbeddedHeader title="密码箱" />}
      <div className={`rounded-card bg-surface p-5 shadow-card fade-up ${embedded ? '' : 'mt-6'}`}>
        <p className="text-2xl">🔒</p>
        <h2 className="mt-2 text-lg font-semibold text-ink">解锁密码箱</h2>
        <p className="mt-1 text-sm text-ink-2">输入主密码以查看与编辑你的账号密码。</p>
        <div className="mt-4 flex flex-col gap-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="主密码"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 text-ink outline-none"
          />
          <button
            onClick={submit}
            disabled={busy}
            className="pressable mt-1 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg disabled:opacity-50"
          >
            {busy ? '解锁中…' : '解锁'}
          </button>
        </div>
      </div>
    </>
  )

  if (embedded) return content
  return (
    <>
      <NavBar title="密码箱" />
      <PageHost>{content}</PageHost>
    </>
  )
}

// —— 添加 / 编辑 表单 ——
function VaultForm({ initial, onSave }: { initial?: VaultItemView; onSave: (d: VaultDraft) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [account, setAccount] = useState(initial?.account ?? '')
  const [secret, setSecret] = useState(initial?.secret ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [show, setShow] = useState(false)

  return (
    <div>
      <Field label="平台 / 名称">
        <TextInput value={name} onChange={setName} placeholder="如 微信 / Gmail / 银行卡" />
      </Field>
      <Field label="账号">
        <TextInput value={account} onChange={setAccount} placeholder="手机号 / 邮箱 / 用户名" />
      </Field>
      <Field label="密码">
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="输入密码"
            className="titia-input w-full rounded-btn bg-surface-sunken px-3 py-2.5 pr-12 text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3"
          >
            {show ? '隐藏' : '显示'}
          </button>
        </div>
      </Field>
      <Field label="备注（可选）">
        <TextArea value={note} onChange={setNote} placeholder="安全提示 / 绑定手机 / 其他" />
      </Field>
      <button
        onClick={() => name.trim() && onSave({ name: name.trim(), account: account.trim(), secret, note: note.trim() || undefined })}
        disabled={!name.trim()}
        className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg disabled:opacity-50"
      >
        保存
      </button>
    </div>
  )
}
