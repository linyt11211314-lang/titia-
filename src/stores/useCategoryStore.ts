import { create } from 'zustand'
import {
  getCategories,
  saveCategory,
  updateCategory,
  removeCategory,
  bulkPutCategories,
  clearCategories,
} from '../services/dataService'
import type { CategoryEntity } from '../db/types'
import { useAppStore } from './useAppStore'

// Titia 时序 · 分类 store（完全可自定义）
// 默认预置：餐饮/交通/购物/居住/娱乐/医疗/教育/其他，用户可增删改。

interface CategoryState {
  categories: CategoryEntity[]
  loaded: boolean
  load: () => Promise<void>
  /** 硬清空全部分类并恢复为预设体系（CAT_TREE）；手动触发，不自动抹除用户后续编辑 */
  resetToPreset: () => Promise<void>
  create: (input: { name: string; icon: string; defaultAccount?: string; parent?: string }) => Promise<void>
  update: (id: string, patch: Partial<CategoryEntity>) => Promise<void>
  remove: (id: string) => Promise<void>
}

// 交易分类体系（《小账交易分类体系规划》）：12 个一级分类 + 二级叶子分类
// 一级分类 parent 为空；二级分类 parent = 一级名。
const CAT_TREE: { name: string; icon: string; subs: string[] }[] = [
  { name: '收入', icon: '💰', subs: ['基本工资', '提成', '亚马逊收入', '红包收入', '转账收入', '退款收入', '二手出售'] },
  { name: '餐饮', icon: '🍜', subs: ['早餐', '午餐', '晚餐', '夜宵', '外卖', '咖啡', '奶茶', '饮料', '朋友聚餐', '家庭聚餐', '零食', '水果', '甜品'] },
  { name: '购物', icon: '🛍️', subs: ['清洁用品', '家居用品', '厨房用品', '收纳用品', '衣服', '鞋子', '包包', '配饰', '手机', '电脑', '配件', '耳机', '护肤', '彩妆', '香水', '美容工具', '礼物', '收藏', '二手商品'] },
  { name: '住房生活', icon: '🏠', subs: ['房租', '宽带', '手机话费', '家具家电', '家电维修', '装修', '清洁服务'] },
  { name: '交通出行', icon: '🚗', subs: ['打车', '公交', '地铁', '火车', '加油', '充电', '停车', '洗车', '保养', '维修'] },
  { name: '宠物', icon: '🐱', subs: ['猫粮', '猫砂', '玩具', '猫窝', '零食', '工具', '宠物医疗', '洗澡', '美容', '修剪', '宠物寄养', '宠物保险'] },
  { name: '医疗健康', icon: '💊', subs: ['医疗健康'] },
  { name: '娱乐休闲', icon: '🎬', subs: ['电影', '游戏', '会员', '音乐', '摄影', '书籍', '手办', '收藏', '聚会', '活动', 'KTV'] },
  { name: '学习成长', icon: '📚', subs: ['课程', '书籍', '软件会员'] },
  { name: '人情关系', icon: '💝', subs: ['生日礼物', '节日礼物', '纪念日', '红包支出', '红包收入', '请客', '聚会'] },
  { name: '金融转账', icon: '💳', subs: ['银行转账', '账户充值', '信用卡还款', '平台手续费', '银行手续费'] },
  { name: '其他', icon: '✨', subs: ['临时支出', '未分类'] },
]

// 防并发：多个 load 同时触发（如多 store 共用 effect 重跑）时只执行一次预置
let loadInflight: Promise<void> | null = null

/** 依据 CAT_TREE 构建完整预设分类实体（一级 + 二级叶子），供首次预置与手动重置复用 */
function buildPresetCategories(): CategoryEntity[] {
  const now = Date.now()
  let order = 0
  const presets: CategoryEntity[] = []
  for (const top of CAT_TREE) {
    presets.push({
      id: crypto.randomUUID(),
      name: top.name,
      icon: top.icon,
      parent: undefined,
      order: order++,
      createdAt: now + order,
      updatedAt: now + order,
      deletedAt: null,
      _dirty: 1,
      _syncedAt: null,
    } as CategoryEntity)
    for (const sub of top.subs) {
      presets.push({
        id: crypto.randomUUID(),
        name: sub,
        icon: '·',
        parent: top.name,
        order: order++,
        createdAt: now + order,
        updatedAt: now + order,
        deletedAt: null,
        _dirty: 1,
        _syncedAt: null,
      } as CategoryEntity)
    }
  }
  return presets
}

export const useCategoryStore = create<CategoryState>((set) => ({
  categories: [],
  loaded: false,

  load: () => {
    if (loadInflight) return loadInflight
    loadInflight = (async () => {
      try {
        const list = (await getCategories()) as CategoryEntity[]
        // 仅在「库完全为空」时首次预置默认分类体系。
        // ⚠️ 不再依据「剩余分类全为一级（无 parent）」来判断旧体系并自动重预置——
        // 否则用户手动删光二级分类、或整理后剩余均为一级时，会被误判为旧体系，
        // 触发整棵分类树重预置，导致「已删除的分类在刷新后重新出现」。
        // （旧体系 → 新分类树的一次性迁移早已随新分类树上线完成，无需每轮 load 再重判。）
        if (list.length === 0) {
          const presets = buildPresetCategories()
          await bulkPutCategories(presets)
          set({ categories: presets, loaded: true })
          return
        }
        set({ categories: list.sort((a, b) => a.order - b.order), loaded: true })
      } finally {
        loadInflight = null
      }
    })()
    return loadInflight
  },

  // 硬清空全部分类并恢复为预设体系（CAT_TREE）。
  // 由前端「重置为预设分类」按钮手动触发，仅执行用户主动发起的这一次；
  // 之后用户新增/编辑/删除的分类不会被任何自动逻辑覆盖（空库判断已排除非空库）。
  resetToPreset: async () => {
    await clearCategories()
    const presets = buildPresetCategories()
    await bulkPutCategories(presets)
    set({ categories: presets, loaded: true })
    useAppStore.getState().bumpDataEpoch()
  },

  create: async (input) => {
    const c = await saveCategory({
      name: input.name.trim(),
      icon: input.icon.trim() || '✨',
      defaultAccount: input.defaultAccount || undefined,
      parent: input.parent || undefined,
      order: Date.now(),
    } as Omit<CategoryEntity, keyof CategoryEntity>)
    set((s) => ({ categories: [...s.categories, c].sort((x, y) => x.order - y.order) }))
    useAppStore.getState().bumpDataEpoch()
  },

  update: async (id, patch) => {
    await updateCategory(id, patch)
    set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    useAppStore.getState().bumpDataEpoch()
  },

  remove: async (id) => {
    await removeCategory(id)
    set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }))
    useAppStore.getState().bumpDataEpoch()
  },
}))
