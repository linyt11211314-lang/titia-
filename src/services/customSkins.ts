import { db } from '../db/schema'
import type { CustomSkinRow } from '../db/types'
import { setCustomSkins, type Skin } from '../theme/skins'

// Titia 时序 · 自定义主题（本地存储 + 注册表）
// 仅存「用户自己创建」的皮肤；预设皮肤不可删、不在此列。
// 存储：IndexedDB（db.customSkins 表）—— 与业务数据同库，随备份导出/导入、WebDAV 同步一起迁移。
// 启动时由 main.tsx 在 render 前 await loadCustomSkins()，保证 App 挂载 applySkin 时能解析自定义 id。

let cache: Skin[] = []

/** 读取本地自定义皮肤并注入注册表（幂等，可重复调用）。导入备份 / 同步后也应调用以刷新内存态。 */
export async function loadCustomSkins(): Promise<Skin[]> {
  try {
    const rows = await db.customSkins.orderBy('createdAt').toArray()
    cache = rows.map((r: CustomSkinRow) => r.skin).filter((s) => s && s.id && s.light && s.dark)
  } catch {
    cache = []
  }
  setCustomSkins(cache)
  return cache
}

/** 同步返回当前内存中的自定义皮肤列表（组件初次渲染用；启动阶段已 await 加载完毕） */
export function getCustomSkins(): Skin[] {
  return cache
}

/** 保存（新增或覆盖同 id）；同时写入 IndexedDB 与注册表，立即生效可选 */
export async function saveCustomSkin(skin: Skin): Promise<void> {
  let createdAt = Date.now()
  try {
    const prev = await db.customSkins.get(skin.id)
    if (prev) createdAt = prev.createdAt
  } catch {
    /* 忽略读取错误，使用新时间戳 */
  }
  const row: CustomSkinRow = { id: skin.id, name: skin.name, createdAt, skin }
  await db.customSkins.put(row)
  const i = cache.findIndex((s) => s.id === skin.id)
  if (i >= 0) cache[i] = skin
  else cache.push(skin)
  setCustomSkins(cache)
}

/** 删除（仅用于自定义皮肤）。返回是否删掉了「当前正在使用」的那条 */
export async function deleteCustomSkin(id: string): Promise<boolean> {
  const existed = cache.some((s) => s.id === id)
  try {
    await db.customSkins.delete(id)
  } catch {
    /* 忽略删除错误 */
  }
  cache = cache.filter((s) => s.id !== id)
  setCustomSkins(cache)
  return existed
}

// ── 预设色板：多巴胺 × 荧光（30-50 色，覆盖高饱和与高亮荧光）────────
// 用户从中选一个主色 → 算法派生整套配色。也支持自定义 HEX 输入（见主题中心）。
export const SWATCH_GROUPS: { label: string; colors: { name: string; hex: string }[] }[] = [
  {
    label: '多巴胺色系',
    colors: [
      { name: '亮橙', hex: '#FF7A00' },
      { name: '珊瑚粉', hex: '#FF6F61' },
      { name: '蜜桃橙', hex: '#FF9F68' },
      { name: '西瓜红', hex: '#FF5E5B' },
      { name: '樱桃红', hex: '#FF3B5C' },
      { name: '玫红', hex: '#FF4D8D' },
      { name: '洋红', hex: '#E84393' },
      { name: '葡萄紫', hex: '#9B5DE5' },
      { name: '紫罗兰', hex: '#7C5CFC' },
      { name: '电光蓝', hex: '#2D6CDF' },
      { name: '湖蓝', hex: '#00B4D8' },
      { name: '天蓝', hex: '#38BDF8' },
      { name: '薄荷绿', hex: '#2EC4B6' },
      { name: '青柠绿', hex: '#A3E635' },
      { name: '草绿', hex: '#4CAF50' },
      { name: '宝蓝', hex: '#1E6FE0' },
      { name: '南瓜橙', hex: '#FF8C42' },
      { name: '番石榴绿', hex: '#2ECC71' },
      { name: '鸢尾蓝', hex: '#5B8DEF' },
      { name: '柠檬黄', hex: '#FFD60A' },
    ],
  },
  {
    label: '荧光色系',
    colors: [
      { name: '荧光黄', hex: '#EAFF00' },
      { name: '荧光青柠', hex: '#CCFF00' },
      { name: '荧光绿', hex: '#39FF14' },
      { name: '荧光青', hex: '#00FFF0' },
      { name: '荧光蓝', hex: '#1FB8FF' },
      { name: '荧光紫', hex: '#BC13FE' },
      { name: '荧光粉', hex: '#FF00FF' },
      { name: '荧光品红', hex: '#FF00A0' },
      { name: '荧光红', hex: '#FF073A' },
      { name: '荧光橙', hex: '#FF6A00' },
      { name: '荧光柠檬', hex: '#F6FF00' },
      { name: '荧光碧', hex: '#00FFA3' },
      { name: '荧光桃', hex: '#FF5EC4' },
      { name: '荧光靛', hex: '#5D00FF' },
      { name: '荧光琥珀', hex: '#FFBF00' },
      { name: '荧光薄荷', hex: '#1CFFD6' },
    ],
  },
]
