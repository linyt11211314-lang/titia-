// Titia 时序 · 自动记账智能识别规则配置（用户指定 · 单一配置源）
// 规则优先级：用户明确指定 > 本指令规则 > 系统默认规则。
// 被 captureParser（文本解析）、ai.ts（DeepSeek 提示词）、useBookStore（分类库/去重）、
// billRules（合并/校验/周期性）共同引用。修改此处即全局生效。

// ═══════════ 一、分类体系（12 类，用户指定） ═══════════
export interface AiCategoryDef {
  name: string
  /** 收入类分类（工资等）：不计入消费支出统计 */
  income?: boolean
  /** 转账类分类：不计入消费统计（信用卡还款、理财转入转出） */
  transfer?: boolean
  /** 关键词（商户名/摘要命中即归入） */
  keywords: string[]
}

export const AI_CATEGORIES: AiCategoryDef[] = [
  { name: '餐饮', keywords: ['瑞幸', '星巴克', 'Manner', '库迪', '咖啡', '奶茶', '茶百道', '喜茶', '蜜雪', '早餐', '午餐', '晚餐', '夜宵', '外卖', '美团', '饿了么', '肯德基', '麦当劳', '汉堡王', '华莱士', '海底捞', '火锅', '烧烤', '食堂', '买菜', '生鲜', '叮咚', '盒马', '水果', '餐厅', '小吃', '面包', '蛋糕'] },
  { name: '交通', keywords: ['滴滴', '高德', '地铁', '公交', '铁路', '12306', '火车', '加油', '中石化', '中石油', '停车', '打车', '出租车', '网约车', '高速', 'ETC', '充电'] },
  { name: '购物', keywords: ['淘宝', '京东', '拼多多', '天猫', '唯品会', '抖音商城', '小红书', '商场', '超市', '便利店', '优衣库', '无印良品', '名创优品', '网购', '旗舰店', '严选', '极速达'] },
  { name: '居住', keywords: ['房租', '自如', '蛋壳', '贝壳租房', '水电', '燃气', '电费', '水费', '物业', '维修', '装修', '宽带安装', '开锁'] },
  { name: '娱乐', keywords: ['电影', '万达', '淘票票', '猫眼', '游戏', 'Steam', '王者', '原神', '网易游戏', '腾讯游戏', '旅游', '携程', '飞猪', '机票', '酒店', '民宿', '运动', '健身房', 'Keep', '羽毛球', '游泳', 'KTV', '演出', '门票', '乐刻'] },
  { name: '通讯', keywords: ['话费', '移动', '联通', '电信', '宽带', '网费', '流量', '充值中心'] },
  { name: '医疗', keywords: ['药店', '医院', '诊所', '挂号', '体检', '京东健康', '阿里健康', '口腔', '眼科', '药房', '大参林', '益丰'] },
  { name: '学习', keywords: ['书籍', '书店', '当当', '课程', '得到', '知识付费', '网课', '考试', '报名', '培训', '樊登'] },
  { name: '人情', keywords: ['红包', '礼物', '送礼', '请客', '随礼', '转账给', '发红包', '份子钱'] },
  { name: '转账', transfer: true, keywords: ['信用卡还款', '还信用卡', '理财', '转入', '转出', '定投', '基金', '股票', '还花呗', '还白条', '微粒贷', '还款'] },
  { name: '工资', income: true, keywords: ['工资', '薪资', '奖金', '绩效', '报销', '劳务', '补贴', '年终奖', '提成'] },
  { name: '其他', keywords: [] }, // 兜底分类
]

/** 按商户名+摘要关键词匹配分类；优先级 商户名 > 摘要关键词 > 金额辅助；匹配不到 → 其他 */
export function matchCategory(merchant: string, note = '', isIncome = false): string {
  const text = `${merchant ?? ''} ${note ?? ''}`
  for (const c of AI_CATEGORIES) {
    if (c.name === '其他') continue
    if (c.keywords.some((k) => text.includes(k))) return c.name
  }
  // 收入辅助判断：无关键词命中且为收入 → 工资（工资/奖金类收入）
  if (isIncome && /收入|收款|到账/.test(text)) return '工资'
  return '其他'
}

/** 分类是否不计入消费（转账/收入类） */
export function isNonConsumption(category: string): boolean {
  const c = AI_CATEGORIES.find((x) => x.name === category)
  return !!(c && (c.transfer || c.income))
}

// ═══════════ 二、交易对象标准化 ═══════════
// 公司后缀剥离：瑞幸咖啡（深圳）有限公司 → 瑞幸咖啡
const COMPANY_SUFFIX = /(股份有限公司|有限责任公司|有限公司|集团|分公司|公司|\(.*?\)|（.*?）)/g
/** 商户名去公司后缀/括号分店，保留品牌名 */
export function normalizeMerchant(raw: string): string {
  let m = (raw ?? '').trim()
  if (!m) return ''
  // 去括号内容（含分店）：瑞幸咖啡（港深国际中心店）→ 瑞幸咖啡
  m = m.replace(/[（(][^）)]*[）)]/g, '')
  // 去平台后缀：瑞幸咖啡-美团App → 瑞幸咖啡
  m = m.replace(/\s*[-–—·]\s*(美团|饿了么|淘宝|京东|支付宝|微信|App|APP|小程序).*$/g, '')
  // 去公司后缀
  m = m.replace(COMPANY_SUFFIX, '')
  return m.trim().slice(0, 40)
}

// ═══════════ 三、金额规则 ═══════════
export const AMOUNT = {
  /** 大额交易阈值（元）：> 该值标记建议人工确认 */
  bigThreshold: 10_000,
  /** 小额异常阈值（元）：≤ 该值标记（1 分钱） */
  tinyThreshold: 0.01,
  /** 公式校验容差（元） */
  formulaTolerance: 0.01,
  /** 输出金额保留两位小数 */
  decimals: 2,
}

// ═══════════ 四、重复记账判定（用户规则） ═══════════
export const DUP = {
  /** 同商户+同金额(±0.01)+时间差 ≤ 5 分钟 → 重复 */
  windowMinutes: 5,
  /** 金额容差（元） */
  amountTolerance: 0.01,
}

// ═══════════ 五、多笔订单合并判定（用户规则） ═══════════
export const MERGE = {
  /** 无订单号时：同商户 + 时间差 ≤ 2 分钟 → 同订单 */
  windowMinutes: 2,
  /** 时间差 > 2 小时 → 视为不同订单，不合并 */
  maxWindowMinutes: 120,
}

// ═══════════ 六、周期性识别 ═══════════
export const PERIODIC = {
  /** 同商户连续 ≥3 个月出现、金额偏差 ≤10% → 标记周期性 */
  minMonths: 3,
  amountToleranceRatio: 0.1,
}
