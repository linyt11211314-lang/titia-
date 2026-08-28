import { db } from '../db/schema'
import type { PresetSkinRow } from '../db/types'
import { setPresetSkins, SKINS, type Skin } from '../theme/skins'

// Titia 时序 · 预设皮肤（出厂内置皮肤的本地可编辑副本）
// 存储：IndexedDB（db.presetSkins 表）—— 与业务数据同库，随备份/同步迁移。
// 首播：库为空时把 SKINS（现有 20 个内置皮肤）种子化写入；之后用户编辑/删除/重置都作用于本表。
// 启动时由 main.tsx 在 render 前 await loadPresetSkins()，保证 App 挂载 applySkin 时能解析预设 id（含编辑覆盖）。
//
// 解析优先级（见 skins.ts getSkin）：预设库覆盖 → 自定义库 → SKINS 代码常量兜底。
// 因此「未改动时」预设库里的皮肤 == SKINS 值；「用户改过某内置皮肤」时，预设库优先于 SKINS，编辑生效。

let cache: Skin[] = []

/** 读取本地预设皮肤并注入注册表（幂等）。
 *  库为空时种子化 SKINS；失败兜底回 SKINS 代码常量，保证 App 永远有样式可用。 */
export async function loadPresetSkins(): Promise<Skin[]> {
  try {
    const rows = await db.presetSkins.orderBy('order').toArray()
    if (rows.length === 0) {
      // 首次：种子化内置 SKINS（保留原始顺序）
      const now = Date.now()
      const seeds: PresetSkinRow[] = SKINS.map((s, i) => ({
        id: s.id,
        name: s.name,
        createdAt: now + i,
        order: i,
        skin: s,
      }))
      await db.presetSkins.bulkPut(seeds)
      cache = SKINS.slice()
    } else {
      cache = rows.map((r) => r.skin).filter((s) => s && s.id && s.light && s.dark)

      // 版本升级：内置皮肤的代码 version 大于本地副本时，自动覆盖本地预设。
      // 这样出厂主题迭代（如奶喵喵配色更新）能自动同步到所有设备；
      // 用户主动编辑过的预设若未带更高 version，仍会被覆盖，因此 version 只由代码侧管理。
      const codeById = new Map(SKINS.map((s) => [s.id, s]))
      const updates: PresetSkinRow[] = []
      for (const row of rows) {
        const code = codeById.get(row.id)
        if (!code) continue
        const storedVersion = row.skin.version ?? 0
        const codeVersion = code.version ?? 0
        if (codeVersion > storedVersion) {
          const updated: PresetSkinRow = { ...row, skin: code }
          updates.push(updated)
          const i = cache.findIndex((s) => s.id === row.id)
          if (i >= 0) cache[i] = code
        }
      }
      if (updates.length) {
        try {
          await db.presetSkins.bulkPut(updates)
        } catch {
          /* 忽略写入错误，仅内存缓存已更新 */
        }
      }

      // 增量合并：把 SKINS 代码常量里「持久化预设表没有」的皮肤补进列表与 IndexedDB。
      // 这样新增内置皮肤（如角色皮肤）会对老用户自动出现，且不破坏他们对其它预设皮肤的编辑。
      const present = new Set(cache.map((s) => s.id))
      const missing = SKINS.filter((s) => !present.has(s.id))
      if (missing.length) {
        let maxOrder = rows.reduce((m, r) => Math.max(m, r.order ?? 0), -1)
        const now = Date.now()
        const seeds: PresetSkinRow[] = missing.map((s, i) => ({
          id: s.id,
          name: s.name,
          createdAt: now + i,
          order: maxOrder + 1 + i,
          skin: s,
        }))
        try {
          await db.presetSkins.bulkPut(seeds)
        } catch {
          /* 忽略写入错误，仅内存补充也能让本次会话可用 */
        }
        cache = cache.concat(missing)
      }
    }
  } catch {
    cache = SKINS.slice() // IDB 不可用兜底
  }
  setPresetSkins(cache)
  return cache
}

/** 同步返回当前内存中的预设皮肤列表（组件初次渲染用；启动阶段已 await 加载完毕） */
export function getPresetSkins(): Skin[] {
  return cache.length ? cache : SKINS.slice()
}

/** 保存（新增或覆盖同 id）；同时写入 IndexedDB 与注册表，立即生效 */
export async function savePresetSkin(skin: Skin): Promise<void> {
  let createdAt = Date.now()
  let order = cache.length
  try {
    const prev = await db.presetSkins.get(skin.id)
    if (prev) {
      createdAt = prev.createdAt
      order = prev.order
    }
  } catch {
    /* 忽略读取错误，使用新时间戳 */
  }
  const row: PresetSkinRow = { id: skin.id, name: skin.name, createdAt, order, skin }
  await db.presetSkins.put(row)
  const i = cache.findIndex((s) => s.id === skin.id)
  if (i >= 0) cache[i] = skin
  else cache.push(skin)
  setPresetSkins(cache)
}

/** 删除预设皮肤（仅从预设库删；SKINS 常量仍作兜底，下次重置可恢复）。
 *  返回是否删掉了「当前正在使用」的那条。 */
export async function deletePresetSkin(id: string): Promise<boolean> {
  const existed = cache.some((s) => s.id === id)
  try {
    await db.presetSkins.delete(id)
  } catch {
    /* 忽略删除错误 */
  }
  cache = cache.filter((s) => s.id !== id)
  setPresetSkins(cache)
  return existed
}

/** 硬清预设表并重播 SKINS，恢复出厂 20 套内置皮肤。
 *  不影响自定义皮肤与任何业务数据（账本/分类等）。 */
export async function resetPresetSkins(): Promise<void> {
  try {
    await db.presetSkins.clear()
  } catch {
    /* 忽略清空错误 */
  }
  const now = Date.now()
  const seeds: PresetSkinRow[] = SKINS.map((s, i) => ({
    id: s.id,
    name: s.name,
    createdAt: now + i,
    order: i,
    skin: s,
  }))
  try {
    await db.presetSkins.bulkPut(seeds)
  } catch {
    /* 忽略写入错误 */
  }
  cache = SKINS.slice()
  setPresetSkins(cache)
}
