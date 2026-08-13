// Titia 时序 · 实体类型定义
// 所有业务表统一携带全局字段（由 Repository 注入），见 BaseEntity。

import type { Skin } from '../theme/skins'

/** 自定义主题（用户自建，存完整派生后的 Skin 对象，纯本地资产、不走软删/同步语义） */
export interface CustomSkinRow {
  id: string
  name: string
  createdAt: number
  skin: Skin
}

/** 预设皮肤（出厂内置皮肤的本地可编辑副本，存完整 Skin 对象）。
 *  来自 SKINS 种子，可编辑/删除/重置回内置默认；与 CustomSkinRow 区别在于来源与可重置性。
 *  两者皆存完整 Skin，便于 applySkin 直接套用。 */
export interface PresetSkinRow {
  id: string
  name: string
  createdAt: number
  order: number
  skin: Skin
}

/** Aura 个人皮肤诊断历史（每次生成一条） */
export interface AuraHistoryRow extends BaseEntity {
  symptoms: string[]
  factors: string[]
  ageGroup: string
  skinType: string
  sections: {
    overview: string
    care: string
    life: string
    doctor: string
    comfort: string
  }
}

/** 全局字段：云同步预留 + 软删除 + 时间戳 */
export interface BaseEntity {
  id: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  /** 本地有未同步改动（本期不用，预留） */
  _dirty: 0 | 1
  /** 上次同步成功时间（本期不用，预留） */
  _syncedAt: number | null
}

export type RecordType =
  | 'diary'
  | 'pet_moment'
  | 'relation_touched'
  | 'relation_conflict'
  | 'life_event'
  | 'spark'

export interface RecordEntity extends BaseEntity {
  type: RecordType
  occurredAt: number
  title?: string
  content?: string
  mediaIds: string[]
  refType?: 'pet' | 'person' | null
  refId?: string
  payload: Record<string, unknown>
  pinned: boolean
}

export interface PetEntity extends BaseEntity {
  name: string
  breed?: string
  gender: 'boy' | 'girl' | 'unknown'
  birthday?: string // YYYY-MM-DD，自动算年龄
  avatarMediaId?: string
  order: number
}

export interface PetHealthEntity extends BaseEntity {
  petId: string
  kind: 'weight' | 'vaccine' | 'medicine'
  date: string
  value?: number
  name?: string
  note?: string
}

export interface PersonEntity extends BaseEntity {
  name: string
  relation: string
  avatarMediaId?: string
}

export interface TodoEntity extends BaseEntity {
  title: string
  done: boolean
  completedAt?: number
  remindEnabled: boolean
  remindAt?: number
  notified: boolean
  order: number
}

export interface MediaEntity extends BaseEntity {
  blob: Blob
  thumb: Blob
  mime: string
  width: number
  height: number
  size: number
}

export interface SettingsEntity extends BaseEntity {
  profile: { nickname?: string; avatarMediaId?: string }
  theme: { skin: string; mode: 'light' | 'dark' }
  app: {
    firstDayOfWeek: number
    hapticEnabled: boolean
    reminderMode: string
    /** 默认扣款账户（账单/OCR 识别未带账户信息时使用） */
    defaultAccount?: string
    /** 自动归类：AI 识别兜底开关（默认开；关掉后规则未命中走默认分类） */
    aiAutoCategory?: boolean
    /** 自动归类：规则优先于 AI（默认开；关掉后先 AI 后规则） */
    ruleFirst?: boolean
    /** 多笔识别：仅识别含「实付/支付金额/合计」等关键词的金额（忽略单品原价、物流单号等） */
    captureOnlyRealPay?: boolean
    /** 多笔识别：忽略 3-6 位纯整数（物流/订单单号，无货币符号或含物流关键词） */
    captureIgnoreLogistics?: boolean
  }
  schemaVersion: number
}

// 预建空表（本期不实现 UI，仅建表避免将来迁移）
export interface ShoppingEntity extends BaseEntity {
  name: string
  /** 待买 pending / 已买 completed（权威字段；bought 为老数据兼容保留） */
  status: 'pending' | 'completed'
  bought: boolean
  boughtAt?: number
  order: number
}
export interface FinanceItemEntity extends BaseEntity {
  side: 'income' | 'expense'
  kind: string
  category: string
  name: string
  amount: number
  cycle: 'monthly' | 'yearly' | 'once'
  active: boolean
  note?: string
}
export interface CycleEntity extends BaseEntity {
  startDate: string
  endDate?: string
  note?: string
}
// 倒数日：期待（未来日期）/ 足迹（已发生日期）两类共用
export interface CountdownEventEntity extends BaseEntity {
  kind: 'expected' | 'footprint'
  title: string
  relation?: string // 人物关系（如：妈妈）
  category: 'family' | 'friend' | 'partner' | 'pet' | 'other'
  /** 期待事件类型（筛选用）：生日 / 纪念日 / 其他 */
  eventType?: 'birthday' | 'anniversary' | 'other'
  dateType: 'solar' | 'lunar'
  solarDate?: string // 公历 YYYY-MM-DD（footprint 必填；expected 农历时由 lunar 换算）
  lunarDate?: string // 农历（如 八月十五 / 六月初三）
  /** 农历设定的起始年份（0/空 = 每年自动顺延） */
  lunarYear?: number
  avatar: string // emoji
}

// ── 自动记账（方案四表：transactions / rules / accounts / categories） ──
// 交易主表：金额一律用「分」存储避免浮点误差
export interface TransactionEntity extends BaseEntity {
  amount: number // 分（expense/transfer 为正；income 为负）
  /** 账单类型：支出 / 收入 / 转账（缺省按 amount 推导：>0 支出、<0 收入） */
  txType?: 'expense' | 'income' | 'transfer'
  /** 转账目标账户（txType=transfer 时） */
  transferTo?: string
  merchant?: string // 交易对象
  category?: string // 交易类型（分类名，可自定义）
  account?: string // 支出账户（账户名，可自定义）
  time: string // 交易时间（ISO 8601 / YYYY-MM-DD HH:mm）
  note?: string
  source: 'share' | 'shortcut' | 'manual' | 'ai'
  /** 自动归类引擎来源（规则命中 / AI 识别；手动录入或旧数据无此字段则不显示来源标签） */
  autoSource?: 'rule' | 'ai'
  /** 图片附件（支付截图等）：media 表 id 列表，不进备注文字 */
  mediaIds?: string[]
}
// 识别规则 / 学习库：关键词命中 → 自动预填分类/账户
export interface RuleEntity extends BaseEntity {
  keyword: string
  merchant?: string
  category?: string
  account?: string
  priority: number
  hitCount: number
}
// 账户表：完全可自定义（资产/负债两大类，净资产 = 资产总额 - 负债欠款）
export interface AccountEntity extends BaseEntity {
  name: string
  type: string // 现金账户 / 银行卡 / 电子钱包 / 储蓄 / 信用卡 …
  /** 资产账户（拥有的钱）或 负债账户（欠的钱） */
  kind: 'asset' | 'liability'
  balance?: number // 余额（分，资产为正；负债为欠款金额）
  /** 银行卡/信用卡：银行名称 */
  bankName?: string
  /** 银行卡/信用卡：卡号尾号 */
  cardTail?: string
  /** 信用卡：信用额度（分） */
  creditLimit?: number
  order: number
}
// 分类表：完全可自定义（一级 + 二级；parent 为空 = 一级分类）
export interface CategoryEntity extends BaseEntity {
  name: string
  icon: string // emoji
  /** 父分类名（二级分类指向一级；空 = 一级分类） */
  parent?: string
  defaultAccount?: string
  order: number
}
// 预算：绑定一级分类，按月统计该分类下所有二级支出
export interface BudgetEntity extends BaseEntity {
  category: string // 一级分类名
  amount: number // 预算金额（分）
  period: 'month' | 'custom'
  startDate?: string
  endDate?: string
}
// 密码保险箱仅架构预留，不实现加解密
export interface VaultMetaEntity extends BaseEntity {
  salt: string
  iterations: number
  verifier: string
}
export interface VaultItemEntity extends BaseEntity {
  name: string
  account: string
  secret: { iv: string; cipher: string }
  note?: string
}

// 打卡（今日页）：每天一行，主键=日期字符串；由旧版 localStorage 迁移而来，统一进 IndexedDB。
export interface CheckinRow {
  date: string // YYYY-MM-DD
}

// 睡眠数据（来自 iPhone 快捷指令 Shortcuts 自动导入）：每天一行，主键=日期字符串。
// 同日多次导入自动覆盖（put 以 date 为主键）。
export interface SleepRow {
  date: string // YYYY-MM-DD 主键
  sleepHours: number // 睡眠总时长（小时）
  sleepStart?: string // 入睡时间 HH:MM
  sleepEnd?: string // 醒来时间 HH:MM
  source: string // 固定 'Shortcuts'
  importedAt: number // 导入时间戳
}

// ───────────────────────── 物集（个人资产管理） ─────────────────────────

/** 物品分类（与录入表单下拉、分类统计一一对应） */
export type WujiCategory =
  | 'digital' // 数码产品
  | 'appliance' // 家居电器
  | 'luxury' // 奢侈品
  | 'gold' // 黄金/硬通货
  | 'collectible' // 收藏品/手办
  | 'game' // 游戏装备
  | 'clothing' // 衣物鞋包
  | 'other' // 其他

/** 物品状态：服役中 / 闲置 / 已卖出 */
export type WujiStatus = 'active' | 'idle' | 'sold'

/** 物集单件物品（纯本地，存 IndexedDB） */
export interface WujiItemRow extends BaseEntity {
  name: string
  category: WujiCategory
  buyPrice: number // 买入价（人民币，元）
  buyDate: string // 买入日期 YYYY-MM-DD
  brand?: string // 品牌/型号
  note?: string // 备注
  expectedYears: number // 预期使用年限（年），默认 3
  status: WujiStatus
  photos?: string[] // 物品照片（data URL，最多 3 张）
  sellPrice?: number // 卖出价（已卖出时填写）
  sellDate?: string // 卖出日期 YYYY-MM-DD（已卖出时填写）
}

