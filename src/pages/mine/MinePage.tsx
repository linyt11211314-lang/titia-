import { useEffect, useRef, useState } from 'react'
import { Card } from '../../components/base/Card'
import { Sheet } from '../../components/base/Sheet'
import { ToggleRow, Field, TextInput } from '../../components/base/fields'
import { PullToRefresh } from '../../components/base/PullToRefresh'
import { reloadAll, forceAppUpdate } from '../../services/reload'
import { useOverlayStore } from '../../stores/useOverlayStore'
import { useAppStore } from '../../stores/useAppStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { haptic } from '../../services/haptic'
import { navigate } from '../../app/useHashRoute'
import { exportBackup, importBackup, storageUsage, formatBytes } from '../../services/backup'
import { getAiKey, setAiKey, getAiBaseUrl, setAiBaseUrl, DEFAULT_AI_BASE } from '../../services/ai'
import { confirmSheet } from '../../components/base/Confirm'
import { getCustomSkins, deleteCustomSkin } from '../../services/customSkins'

// Titia 时序 · 我的（主题中心 / 数据管理 / 应用设置）
// 数据存储：本地优先（IndexedDB）。当前阶段不接 Supabase/后端/云端接口，
// 未来如需要多设备同步，再单独增加云同步能力。
export function MinePage() {
  const showToast = useAppStore((s) => s.showToast)
  const open = useOverlayStore((s) => s.open)
  const close = useOverlayStore((s) => s.close)
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [aiKey, setAiKeyState] = useState(getAiKey())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    storageUsage().then(setUsage)
    if (!useSettingsStore.getState().loaded) useSettingsStore.getState().load()
  }, [])

  const onExport = async () => {
    setBusy(true)
    try {
      await exportBackup()
      showToast('备份已导出')
    } finally {
      setBusy(false)
    }
  }

  const onImport = async (file: File) => {
    setBusy(true)
    try {
      await importBackup(file)
      showToast('已从备份恢复')
      storageUsage().then(setUsage)
    } catch {
      showToast('导入失败：文件格式不正确')
    } finally {
      setBusy(false)
    }
  }

  const openSettings = () => {
    open(
      <Sheet title="应用设置" onClose={close}>
        <SettingsForm />
      </Sheet>,
    )
  }

  const openAiSheet = () => {
    open(
      <Sheet title="AI 识别（DeepSeek）" onClose={close}>
        <AiConfigForm
          initialKey={getAiKey()}
          initialBase={getAiBaseUrl()}
          onSaved={(key) => setAiKeyState(key)}
          showToast={showToast}
          onClose={close}
        />
      </Sheet>,
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* 固定 Header Banner：滚动时保持不动（不随下方设置内容滚动） */}
      <div className="shrink-0 px-5 pt-4 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}>
        {/* Titia 时序卡片（仅展览，无功能——主题入口唯一保留下方「主题中心」设置卡） */}
          <div
            className="relative block w-full overflow-hidden rounded-card bg-surface text-left"
            style={{ height: 152 }}
          >
            {/* 文案：三行层级（主标题 → 副标题 → 日期独立第三行，间距分明） */}
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-left">
              <span className="block text-2xl font-bold leading-tight text-ink">Titia 时序</span>
              <span className="mt-1.5 block text-sm leading-tight text-ink-2">让时间留下痕迹</span>
              <span className="mt-2 block text-xs leading-tight text-ink-3/70">2026 年 8 月 3 日</span>
            </span>
          </div>
      </div>

      {/* Scroll Container：设置内容可上下滚动（禁止横向）；不透明背景避免滚动透出 */}
      <PullToRefresh onRefresh={reloadAll} className="px-5 pb-28">
        <div className="mb-1 pt-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3">设置</h2>
        </div>

        <div className="mt-4 flex flex-col gap-3">
        {/* 主题中心入口已移入「应用设置」内（下方设置 Sheet），此处不再单独展示 */}

        {/* 数据管理：容器卡（内部按钮操作） */}
        <div className="rounded-card bg-surface shadow-soft">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-ink">数据管理</p>
              <span className="text-xs text-ink-3">
                {usage ? `${usage.count} 条 · ${formatBytes(usage.bytes)}` : '…'}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-2">导出备份 / 导入恢复 / 存储占用</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  haptic()
                  onExport()
                }}
                disabled={busy}
                className="flex-1 rounded-pill bg-primary px-4 py-2 text-sm text-bg disabled:opacity-50"
              >
                导出备份
              </button>
              <button
                onClick={() => {
                  haptic()
                  inputRef.current?.click()
                }}
                disabled={busy}
                className="flex-1 rounded-pill bg-surface-sunken px-4 py-2 text-sm text-ink-2 disabled:opacity-50"
              >
                导入恢复
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onImport(f)
                  e.target.value = ''
                }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-3">
              导出会弹出系统分享面板，可存到「文件」或发微信 / 邮件给自己；换新手机或重装后，用「导入恢复」从「文件」选回即可。打卡记录已包含在备份内。
            </p>
          </div>
        </div>

        {/* AI 识别：DeepSeek 记账模糊文本识别（规则未命中兜底，可选） */}
        <Card onPress={openAiSheet}>
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-ink">AI 识别（DeepSeek）</p>
              <p className="mt-1 text-sm text-ink-2">
                {aiKey ? 'DeepSeek 记账识别 · 已启用' : 'DeepSeek 记账识别 · 未配置（本地规则可用）'}
              </p>
            </div>
            <span className="text-ink-3">›</span>
          </div>
        </Card>

        {/* 应用设置：真实可保存面板 */}
        <Card onPress={openSettings}>
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-ink">应用设置</p>
              <p className="mt-1 text-sm text-ink-2">提醒偏好 / 震动反馈</p>
            </div>
            <span className="text-ink-3">›</span>
          </div>
        </Card>
      </div>

      {/* 底部版本信息（轻量，不抢主体视觉） */}
      <div className="mt-8 flex flex-col items-center gap-1 pb-6">
        <p className="text-xs text-ink-3/60">Titia 时序 · V3.1</p>
        <p className="text-[11px] text-ink-3/40">让时间留下痕迹</p>
      </div>
      </PullToRefresh>
    </div>
  )
}

// 设置表单：订阅全局 settings store，开关即时落库并自动重渲染。
function SettingsForm() {
  const hapticEnabled = useSettingsStore((s) => s.hapticEnabled)
  const reminderOn = useSettingsStore((s) => s.reminderOn)
  const patchApp = useSettingsStore((s) => s.patchApp)
  const setSkin = useSettingsStore((s) => s.setSkin)
  const showToast = useAppStore((s) => s.showToast)
  const onFactoryReset = async () => {
    const ok = await confirmSheet(
      '恢复出厂设置',
      '将重置主题与所有应用设置：主题回到默认、清空你创建的自定义主题、关闭 AI 识别与提醒/震动。\n\n此操作不会删除你的记账、日记、待办等个人数据。确定继续？',
      { confirmText: '恢复出厂', cancelText: '暂不' },
    )
    if (!ok) return
    try {
      const list = getCustomSkins()
      for (const s of list) await deleteCustomSkin(s.id)
      await setSkin('sweetcool')
      await patchApp({ reminderMode: 'on', hapticEnabled: true, defaultAccount: '' })
      setAiKey('')
      setAiBaseUrl('')
      useOverlayStore.getState().close()
      showToast('已恢复出厂设置')
    } catch {
      showToast('恢复出厂失败，请重试')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 主题中心：皮肤中心入口（已从设置列表移入应用设置内） */}
      <button
        onClick={() => {
          // 注意：close 必须来自 overlay store，不能用 MinePage 作用域的局部 close
          // （SettingsForm 是独立组件，取不到；会退化成 window.close() 空操作）。
          useOverlayStore.getState().close()
          navigate('/theme')
        }}
        className="flex w-full items-center justify-between rounded-card bg-surface-sunken px-4 py-3 text-left"
      >
        <span>
          <span className="block text-ink">主题中心</span>
          <span className="mt-0.5 block text-xs text-ink-3">皮肤与深浅 · 全局生效</span>
        </span>
        <span className="text-ink-3">›</span>
      </button>
      <ToggleRow
        label="提醒总开关"
        desc="开启后，到点待办会弹通知提醒"
        checked={reminderOn}
        onChange={async (v) => {
          await patchApp({ reminderMode: v ? 'on' : 'off' })
          showToast(v ? '已开启提醒' : '已关闭提醒')
        }}
      />
      <ToggleRow
        label="震动反馈"
        desc="点击按钮时轻微震动（需设备支持）"
        checked={hapticEnabled}
        onChange={async (v) => {
          await patchApp({ hapticEnabled: v })
          if (v) haptic(20)
        }}
      />
      <div className="mt-1 flex items-center justify-between rounded-card bg-surface-sunken px-4 py-3">
        <span className="text-ink">震动效果预览</span>
        <button onClick={() => haptic(20)} className="rounded-pill bg-surface px-4 py-1.5 text-sm text-ink-2">
          试一下
        </button>
      </div>
      {/* 应用更新：强制拉取最新代码，保留本地数据（详见 services/reload.ts forceAppUpdate） */}
      <div className="mt-2 rounded-card bg-surface-sunken px-4 py-3">
        <p className="font-medium text-ink">应用更新</p>
        <p className="mt-1 text-xs text-ink-3">Titia 时序 · V3.1 · 拉取最新代码，不清除本地数据</p>
        <button
          onClick={async () => {
            const ok = await confirmSheet(
              '强制刷新应用',
              '将重新加载最新版本的应用代码（JS/CSS/HTML）。\n\n此操作仅清理应用缓存、不会删除你的记账、分类、日记等任何本地数据。确定继续？',
              { confirmText: '立即更新', cancelText: '暂不' },
            )
            if (!ok) return
            showToast('正在更新…')
            setTimeout(() => void forceAppUpdate(), 600)
          }}
          className="mt-3 w-full rounded-pill bg-primary px-4 py-2.5 text-sm font-medium text-bg"
        >
          强制刷新应用
        </button>
      </div>
      <button
        onClick={() => void onFactoryReset()}
        className="mt-2 w-full rounded-card bg-surface-sunken px-4 py-3 text-left text-sm text-ink-2"
      >
        恢复出厂设置（重置主题与设置，保留个人数据）
      </button>
      <p className="text-xs text-ink-3">设置保存在本地，不会上传。</p>
    </div>
  )
}

// ── AI 识别（DeepSeek）配置表单 ──
// 独立组件（自管 useState）：Sheet 内容经 useOverlayStore 存储为 ReactNode 快照，
// 若内联绑定父组件 state，受控 value 会被快照锁定导致「无法输入」；
// 与其他 Sheet 表单（BookForm/SettingsForm 等）一致，输入状态由组件自身管理。
function AiConfigForm({
  initialKey,
  initialBase,
  onSaved,
  showToast,
  onClose,
}: {
  initialKey: string
  initialBase: string
  onSaved: (key: string) => void
  showToast: (m: string) => void
  onClose: () => void
}) {
  const [key, setKey] = useState(initialKey)
  const [base, setBase] = useState(initialBase)
  return (
    <div>
      <p className="mb-4 text-sm text-ink-2">
        记账时 AI 自动从模糊描述识别交易对象/金额/分类/账户（规则未命中时兜底）。填写你的
        DeepSeek API Key 即可启用（调用 deepseek-chat，数据仅发送给 DeepSeek）；不填则完全走本地规则与手动记账，不影响使用。
      </p>
      <Field label="DeepSeek API Key">
        <TextInput value={key} onChange={setKey} placeholder="sk-…" />
      </Field>
      <Field label="API 地址（可选，默认 DeepSeek）">
        <TextInput value={base} onChange={setBase} placeholder={DEFAULT_AI_BASE} />
      </Field>
      <button
        onClick={() => {
          setAiKey(key)
          setAiBaseUrl(base)
          onSaved(key.trim() ? key.trim() : '')
          showToast(key.trim() ? '已启用 AI 识别（DeepSeek）' : '已关闭 AI 识别')
          onClose()
        }}
        className="pressable mt-2 w-full rounded-pill bg-primary px-4 py-2.5 text-sm text-bg"
      >
        保存
      </button>
      {key && (
        <button
          onClick={() => {
            setAiKey('')
            setAiBaseUrl('')
            setKey('')
            onSaved('')
            showToast('已清除 AI 配置')
            onClose()
          }}
          className="mt-3 w-full py-2 text-xs text-ink-3"
        >
          清除 AI 配置
        </button>
      )}
    </div>
  )
}
