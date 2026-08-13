// Titia 时序 · SyncService（同步接口预留 · Local First + Sync Ready）
//
// 架构目标：
//   页面 → DataService → IndexedDB(Repository) → SyncService → 云端数据库（未来）
//
// 当前阶段：**不实现任何云同步**（不接 Supabase / 后端数据库 / 云端接口）。
// 本文件仅预留接口与本地变更标记，为未来多设备同步提供扩展点：
//   - 同步后端（SyncBackend）注册能力：未来接入 Supabase 或其他云服务时实现该接口并注册；
//   - 本地变更日志（markDirty）：写操作经 DataService 时记录变更，未来后端直接消费，
//     无需扫描全表比对；行级 _dirty / _syncedAt 字段已由 Repository 在写库时维护（双保险）。

export type SyncOp = 'create' | 'update' | 'remove'

/** 一条本地数据变更（未来同步的最小单元） */
export interface SyncChange {
  table: string
  id: string
  op: SyncOp
  updatedAt: number
}

export type SyncStatus = 'ok' | 'error' | 'no-backend'

export interface SyncResult {
  status: SyncStatus
  message?: string
  pulled?: number
  pushed?: number
  at?: number
}

/** 未来云同步后端契约：实现 push/pull 后注册即可接入（当前不提供任何实现） */
export interface SyncBackend {
  readonly id: string
  readonly label: string
  /** 推送本地变更到云端（未来实现） */
  push(changes: SyncChange[]): Promise<SyncResult>
  /** 从云端拉取变更合并到本地（未来实现） */
  pull(): Promise<SyncResult>
}

// ── 后端注册表（当前为空；未来接入时 registerBackend） ──
const backends = new Map<string, SyncBackend>()

// ── 内存变更日志（预留同步队列；上限防内存膨胀） ──
const CHANGE_LOG_MAX = 500
let changeLog: SyncChange[] = []

export const syncService = {
  /** 注册一个云同步后端（未来接入 Supabase / 其他云服务时调用） */
  registerBackend(b: SyncBackend): void {
    backends.set(b.id, b)
  },

  /** 注销一个同步后端 */
  unregisterBackend(id: string): void {
    backends.delete(id)
  },

  /** 当前已注册的后端列表（当前阶段恒为空） */
  getBackends(): SyncBackend[] {
    return [...backends.values()]
  },

  /**
   * 标记一条本地变更（由 DataService 写操作调用）。
   * 当前仅记录内存日志，不产生任何网络请求；行级 _dirty 已由 Repository 维护。
   */
  markDirty(table: string, id: string, op: SyncOp): void {
    changeLog.push({ table, id, op, updatedAt: Date.now() })
    if (changeLog.length > CHANGE_LOG_MAX) changeLog = changeLog.slice(-CHANGE_LOG_MAX)
  },

  /** 取出并清空变更日志（未来同步后端消费） */
  drainChanges(): SyncChange[] {
    const out = changeLog
    changeLog = []
    return out
  },

  /**
   * 触发一次同步（当前阶段无后端，恒返回 no-backend）。
   * 未来接入后：依次推送本地变更 → 拉取云端合并。
   */
  async syncNow(): Promise<SyncResult> {
    if (backends.size === 0) {
      return { status: 'no-backend', message: '当前阶段未接入云同步（预留接口）' }
    }
    const changes = this.drainChanges()
    let pushed = 0
    let pulled = 0
    for (const b of backends.values()) {
      const pr = await b.push(changes)
      if (pr.status === 'ok') pushed += pr.pushed ?? 0
      const pl = await b.pull()
      if (pl.status === 'ok') pulled += pl.pulled ?? 0
    }
    return { status: 'ok', pushed, pulled, at: Date.now() }
  },
}
