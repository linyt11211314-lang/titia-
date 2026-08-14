# Titia 时序 · 接手手册（Handover）

> 由接手者基于原方案文档整理（技术方案 V1.1 / 开发方案 V1.0 / 开发计划 V1.2 定稿），用于快速接管开发。
> 配套入口文件：`index.html`（开发态）、`index (2).html`（构建态，引用 `/assets/index-*.js`）。

---

## 1. 产品一句话

**Titia 时序** 是一款个人「生活时间轴」记录 App，以 PWA 形式添加到 iPhone 主屏后全屏运行。它把日记、宠物成长、我们的时光、灵光一闪、待办、购物等分散的生活片段，统一收进一条按时间排序的时间轴。基准设备 iPhone 14 Pro（393×852 pt）。

定位三方向（对应强调色）：
- **过去 / 有温度的记忆** → 陶土橙（日记、我们的时光、人生事件）
- **现在 / 未来 / 要处理的事** → 墨绿（待办、购物、财富、密码箱）
- **生活里的光 / 轻盈** → 琥珀黄（我的憨憨、灵光一闪、生理周期）

---

## 2. 技术栈（定稿 · React 版，V1.1 作废了 V1.0 的 Vue 方案）

| 用途 | 选型 | 说明 |
|------|------|------|
| 框架 | react + react-dom 18 | |
| 构建 | vite 6 | |
| 语言 | typescript 5 | 数据模型靠类型兜底 |
| 样式 | **tailwindcss v4** | CSS-first 配置，主题切换天然契合；**不引入任何 UI 框架** |
| 路由 | react-router 7（**hash 模式** `createHashRouter`） | PWA 任意静态托管免 rewrite |
| 状态 | **zustand** | 选择器精确订阅，store 可在组件外调用 |
| 存储 | **dexie** | IndexedDB 封装、索引、版本迁移 |
| 日期 | dayjs | |
| PWA | vite-plugin-pwa | 构建期插件 |

**刻意不引入**：MUI/Ant/Chakra、Redux Toolkit、framer-motion、react-query、第三方图标库、uuid/nanoid（用 `crypto.randomUUID()`）、图片压缩库（Canvas 手写）。
总运行时依赖约 **95KB gzip**。

---

## 3. 分层架构与目录结构

```
视图层  pages / components          只渲染 + 派发事件
状态层  zustand stores（按业务域）   内存镜像 + 派生计算 + UI 态
领域层  services                    timeline 聚合 / reminder / media / backup / cycle / crypto(预留)
仓储层  repositories（统一 CRUD 契约）唯一数据出入口（铁律：组件不碰 db.*）
存储层  Dexie(IndexedDB)            可替换点（未来换远端 API）
```

```
src/
├─ app/        App.tsx · routes.tsx · styles/index.css(@theme token) · styles/themes/
├─ components/ base/ nav/ timeline/ form/ feedback/ icons/
├─ pages/      home/ record/ space/ mine/ (Tab 根页) + pet/ diary/ relation/ … (模块页)
├─ stores/     useRecordStore / useTodoStore / usePetStore / useAppStore
├─ services/   timeline / reminder / media / backup / cycle / crypto(预留)
├─ db/         schema.ts · types.ts · repos/
├─ hooks/      useLiveQuery / useNavStack / useSheet / useHaptic …
└─ utils/      date / id / format / image
```

**三层导航**：Level 0 Tab 根页（首页/记录/空间/我的，常驻保活）→ Level 1 模块页（push 右滑入，不保活）→ Level 2 弹层（Sheet/Modal，写入 history 以支持 iOS 边缘右滑关闭）。

**React 两个自建关键点**：Tab 保活用「懒挂载 + 常驻显隐（`display:none` + `inert`，非卸载）」；转场用自研 `<PageStack>`（约 80 行，维护页面栈，push/pop 用 transform/opacity，320ms `cubic-bezier(.32,.72,0,1)`）。

---

## 4. 数据层（Dexie 表清单）

**本期使用**：`records` `pets` `petHealth` `media` `todos` `people` `settings`
**预建空表**（避免将来迁移）：`shopping` `financeItems` `cycles` `vaultMeta` `vaultItems`

全局字段（Repository 统一注入）：`id` `createdAt` `updatedAt` `deletedAt`(软删) `_dirty` `_syncedAt`(云同步预留，本期不用)。
Repository 统一契约：`create / update / remove(软删) / restore / get / query / purge`。

`records` 为时间轴**统一表**，`type` 区分（`diary`/`pet_moment`/`relation_touched`/`relation_conflict`/`life_event`/`spark`），差异字段进 `payload`。憨憨成长记录直接写 `records`（`type:'pet_moment'`），自动出现在全局时间轴。

> 图片独立 `media` 表（Blob 长边≤1600 q=.8 + 缩略图 320），业务表只存 `mediaIds`。

---

## 5. 开发进度（来自开发计划 V1.2 定稿）

| 阶段 | 内容 | 验收 |
|------|------|------|
| 阶段一 | 数据模型（Dexie 全表 + Repository + 最小运行壳 PageHost 抽象） | 增删改查/软删恢复/持久化/导入导出 |
| 阶段二 | 我的憨憨（六步闭环：卡片→/pet→档案增改→成长时间轴增删改→持久化） | 真机逐条通过 |
| 阶段三 | 组件系统抽象（Card/Timeline/Sheet/Field/ImagePicker/EmptyState…） | 重构后行为一致 |
| 阶段四 | 页面扩展（记录/日记/我们的时光/人生事件/首页/空间/灵光/购物） | accept-record 24/24 · phase4 39/39 · regress-p23 13/13 |
| 阶段五 | 动效与体验（Tab 保活/PageStack 转场/左缘手势/按压反馈） | **96/96，0 报错** |
| Phase 6 | 标题能力（`useTitlePresets(ns)`，用户自建快捷 chip，零系统预设） | phase6-pet 18/18 |
| Phase 7 | 复制记录类模块（日记/我们的时光/灵光一闪，带独立路由+空间卡+时间轴+Sheet） | phase7-diary 15/15 · moments 17/17 · spark 10/10 |

**全量回归合计：156/156，0 控制台报错。**

---

## 6. 下一步 / 待办（本期范围）

- ✅→⏭ **阶段六 PWA 部署**：Service Worker 离线策略、图标与启动图全规格、真机安装测试、版本更新提示、出可添加到主屏的链接。**尚未开始**。
- ⏸ **财富规划 /finance**、**生理周期 /cycle**、**我的 /mine（主题中心/数据管理/设置）**：规划里有，本期优先级待定。
- 🔒 **密码保险箱 /vault**：仅建空表 + 设计文档，**不实现加解密**。

---

## 7. 接手必读铁律（验收标准）

> 完成 = **UI 完成 + 交互完成 + 数据保存完成**，三者缺一进度按 0 计。

| 类别 | 铁律 |
|------|------|
| 交互 | 所有卡片必须可点击（无 `onPress` 开发态 console 告警）；点击必须进详情/编辑/状态变更；返回路径完整无死路；空状态**必须带添加入口**（`EmptyState.action` 必填，缺则编译不过） |
| 数据 | 先落库再更新内存；新增即时显示；编辑跨页面同步；删除软删+二次确认；**必须做"完全关闭重开"持久化测试，不只刷新** |
| 移动端 | iPhone 14 Pro 393×852；Tab 切换无白屏/无重播/状态保持；弹层 iOS 体验（底部升起/下拉关闭/边缘右滑）；图片上传压缩；安全区与 44×44 触控区 |
| 视觉 | 组件内**禁止十六进制色值**，只用语义 token；一屏最多两种强调色；数据读写经 Repository，组件禁写 `db.*`；禁止把数据写死当演示 |

---

## 8. 本地运行 & 接手步骤

```bash
npm install          # 或 pnpm
npm run dev          # dev 环境挂 393×852 手机框
npm run build        # 产物进 dist/，由 vite-plugin-pwa 生成 SW + manifest
```

接手顺序建议：
1. 通读本手册 + 三份方案文档，对齐技术决策。
2. 跑通 `npm run dev`，确认能本地启动并看到四个 Tab 壳。
3. 核对 `db/schema.ts` 与文档表结构是否一致（重点：预建空表、`_dirty/_syncedAt` 字段）。
4. 跑现有验收脚本（`.mjs` 系列，headless Chromium 真机视口）确认 156/156 仍全过。
5. 从**阶段六 PWA 部署**切入，或按需求补财富规划/生理周期。

---

## 9. 当前交接状态备注（接手时记录）

- ⚠️ 原 PAT 已明文出现在交接对话中，**须立即吊销并重生成**。
- ⛔ 交接环境默认**屏蔽 github.com**（DNS 解析到保留地址段、连接 EOF），无法 `git clone`/`gh` 操作；源码需通过**打包上传**或**解除网络限制**方式获取。
- 已到手资产：三份方案文档 + `index.html`（开发入口）+ `index (2).html`（构建产物入口）。**尚无 `src/` 与 `package.json`**，需补齐源码方可继续编码。
- 仓库地址疑似 `https://github.com/linyt11211314-lang/life-os`（原提供末尾多一个 `-`）。
