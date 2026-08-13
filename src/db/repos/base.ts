import type { Table } from 'dexie'
import { db } from '../schema'
import type { BaseEntity } from '../types'

// Titia 时序 · Repository 统一契约
// 铁律：组件内禁止直接 db.*，所有读写经此处。
// 统一注入全局字段：id / 时间戳 / 软删 / 同步预留。

export interface RepoFilter {
  [key: string]: unknown
}

export class Repository<T extends BaseEntity> {
  constructor(private table: Table<T, string>) {}

  async create(input: Partial<Omit<T, keyof BaseEntity>> & Partial<BaseEntity>): Promise<T> {
    const now = Date.now()
    const entity = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      _dirty: 1,
      _syncedAt: null,
      ...(input as object),
    } as T
    await this.table.add(entity)
    return entity
  }

  async update(id: string, patch: Partial<T>): Promise<void> {
    await this.table.update(id, {
      ...patch,
      updatedAt: Date.now(),
      _dirty: 1,
    } as any)
  }

  /** 软删除 */
  async remove(id: string): Promise<void> {
    await this.table.update(id, {
      deletedAt: Date.now(),
      _dirty: 1,
      updatedAt: Date.now(),
    } as any)
  }

  /** 从最近删除恢复 */
  async restore(id: string): Promise<void> {
    await this.table.update(id, {
      deletedAt: null,
      _dirty: 1,
      updatedAt: Date.now(),
    } as any)
  }

  async get(id: string): Promise<T | undefined> {
    const row = await this.table.get(id)
    return row && !row.deletedAt ? row : undefined
  }

  /** 默认过滤软删；支持简单等值过滤。
   *  按 createdAt 升序返回（替代旧的 .reverse() 随机主键序——那是历史陷阱）。
   *  limit=0 表示全量（旧默认 100 会悄悄截断数据）。 */
  async query(filter: RepoFilter = {}, limit = 0, offset = 0): Promise<T[]> {
    let coll = this.table.filter((r) => !r.deletedAt)
    for (const [k, v] of Object.entries(filter)) {
      coll = coll.filter((r) => (r as Record<string, unknown>)[k] === v)
    }
    const rows = await coll.sortBy('createdAt')
    if (limit > 0) return rows.slice(offset, offset + limit)
    return rows
  }

  /** 批量写入（预置数据用；会覆盖同 id 行） */
  async bulkPut(rows: T[]): Promise<void> {
    await this.table.bulkPut(rows)
  }

  /** 物理清理 30 天前的软删数据 */
  async purge(beforeTs: number): Promise<void> {
    const toPurge = await this.table.filter((r) => (r.deletedAt ?? 0) > 0 && (r.deletedAt ?? 0) < beforeTs).toArray()
    await this.table.bulkDelete(toPurge.map((r) => r.id))
  }

  /** 硬清空整表（重置/迁移用，谨慎调用：会物理删除全部行，含软删残留） */
  async clear(): Promise<void> {
    await this.table.clear()
  }
}

export const recordRepo = new Repository(db.records)
export const petRepo = new Repository(db.pets)
export const petHealthRepo = new Repository(db.petHealth)
export const personRepo = new Repository(db.people)
export const todoRepo = new Repository(db.todos)
export const mediaRepo = new Repository(db.media)
export const settingsRepo = new Repository(db.settings)
export const shoppingRepo = new Repository(db.shopping)
export const financeRepo = new Repository(db.financeItems)
export const cycleRepo = new Repository(db.cycles)
export const vaultMetaRepo = new Repository(db.vaultMeta)
export const vaultItemRepo = new Repository(db.vaultItems)
export const countdownRepo = new Repository(db.countdownEvents)
export const transactionRepo = new Repository(db.transactions)
export const ruleRepo = new Repository(db.rules)
export const accountRepo = new Repository(db.accounts)
export const categoryRepo = new Repository(db.categories)
export const budgetRepo = new Repository(db.budgets)
export const auraRepo = new Repository(db.auraHistory)
export const wujiRepo = new Repository(db.wujiItems)
