import Dexie, { type Table } from 'dexie'
import type {
  RecordEntity,
  PetEntity,
  PetHealthEntity,
  PersonEntity,
  TodoEntity,
  MediaEntity,
  SettingsEntity,
  ShoppingEntity,
  FinanceItemEntity,
  CycleEntity,
  VaultMetaEntity,
  VaultItemEntity,
  CountdownEventEntity,
  TransactionEntity,
  RuleEntity,
  AccountEntity,
  CategoryEntity,
  BudgetEntity,
  CustomSkinRow,
  PresetSkinRow,
  CheckinRow,
  AuraHistoryRow,
  WujiItemRow,
  SleepRow,
} from './types'

// Titia 时序 · Dexie schema
// 阶段一：一次性建全表（含本期不用的表），避免将来 schema 迁移。
export class TitiaDB extends Dexie {
  records!: Table<RecordEntity, string>
  pets!: Table<PetEntity, string>
  petHealth!: Table<PetHealthEntity, string>
  people!: Table<PersonEntity, string>
  todos!: Table<TodoEntity, string>
  media!: Table<MediaEntity, string>
  settings!: Table<SettingsEntity, string>
  // 预建空表
  shopping!: Table<ShoppingEntity, string>
  financeItems!: Table<FinanceItemEntity, string>
  cycles!: Table<CycleEntity, string>
  vaultMeta!: Table<VaultMetaEntity, string>
  vaultItems!: Table<VaultItemEntity, string>
  countdownEvents!: Table<CountdownEventEntity, string>
  // 自动记账四表
  transactions!: Table<TransactionEntity, string>
  rules!: Table<RuleEntity, string>
  accounts!: Table<AccountEntity, string>
  categories!: Table<CategoryEntity, string>
  budgets!: Table<BudgetEntity, string>
  // 自定义主题（用户自建，纯本地资产）
  customSkins!: Table<CustomSkinRow, string>
  // 预设皮肤（出厂内置皮肤的本地可编辑副本，平滑升级建表）
  presetSkins!: Table<PresetSkinRow, string>
  // 打卡（今日页）：每天一行，主键=日期字符串；与所有业务数据一致，可被备份/导入/迁移书签带走
  checkin!: Table<CheckinRow, string>
  // Aura 皮肤诊断历史：每次生成一条，本地留存，便于回顾
  auraHistory!: Table<AuraHistoryRow, string>
  // 物集（个人资产管理）：每件物品一条，纯本地留存
  wujiItems!: Table<WujiItemRow, string>
  // 睡眠数据（快捷指令 Shortcuts 自动导入）：每天一行，主键=日期字符串
  sleep!: Table<SleepRow, string>

  constructor() {
    super('titia')
    this.version(1).stores({
      // records 时间轴统一表
      records: 'id, occurredAt, [type+occurredAt], [refType+refId], deletedAt, pinned',
      pets: 'id, order',
      petHealth: 'id, [petId+date]',
      people: 'id',
      todos: 'id, [done+remindAt], order',
      media: 'id',
      settings: 'id',
      // 预建空表
      shopping: 'id, order',
      financeItems: 'id, [side+kind]',
      cycles: 'id, startDate',
      vaultMeta: 'id',
      vaultItems: 'id',
      countdownEvents: 'id, kind, category',
    })
    // 倒数日表：老用户升级建表（version(1) 已存在时不重复建）
    this.version(2).stores({
      countdownEvents: 'id, kind, category',
    })
    // 自动记账四表：老用户升级建表
    this.version(3).stores({
      transactions: 'id, time',
      rules: 'id',
      accounts: 'id, order',
      categories: 'id, order',
    })
    // 预算表：老用户升级建表
    this.version(4).stores({
      budgets: 'id, category',
    })
    // 自定义主题表：老用户升级建表（平滑升级，不丢数据）
    this.version(5).stores({
      customSkins: 'id, createdAt',
    })
    // 预设皮肤表：老用户升级建表（平滑升级，不丢数据）
    this.version(6).stores({
      presetSkins: 'id, createdAt, order',
    })
    // 打卡表：老用户升级建表（平滑升级，不丢数据）
    this.version(8).stores({
      checkin: 'date',
    })
    // Aura 皮肤诊断历史表：老用户升级建表（平滑升级，不丢数据）
    this.version(9).stores({
      auraHistory: 'id, createdAt',
    })
    // 物集（个人资产管理）：新模块建表（平滑升级，不丢数据）
    this.version(10).stores({
      wujiItems: 'id, category, createdAt',
    })
    // 睡眠数据（快捷指令 Shortcuts 自动导入）：新表（平滑升级，不丢数据）
    this.version(11).stores({
      sleep: 'date, source',
    })
  }
}

export const db = new TitiaDB()
