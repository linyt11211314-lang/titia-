# Titia 时序 · 从零重建说明（接手交付）

> 背景：原账号失联，GitHub 仓库 `life-os-` 为空，源码不可得。
> 因此依据你提供的三份方案文档（技术方案 V1.1 / 开发方案 V1.0 / 开发计划 V1.2 定稿）**从零重建工程**。
> 目标：先做出架构正确、能启动、可持久化的真项目，后续每个模块按文档"复制模板"补齐。

> 线上地址（PWA，已验证 verified）：`https://a149a628a3c099573.sh7.agentos-app.net`
> 构建：`npm run build` 通过；`tsc --noEmit` 零错误。

---

## 1. 技术栈（对齐文档定稿 · React 版）

Vite 6 + React 18 + TypeScript 5 + **Tailwind v4**（CSS-first 主题）+ react-router 7（hash 模式）+ zustand 5 + Dexie 4 + dayjs。无 UI 框架、无 redux、无 framer-motion，与文档一致。

## 2. 本次已真实落地

| 层 | 内容 | 对应文档 |
|----|------|----------|
| 工程 | package.json / vite.config / tsconfig / index.html / .npmrc(走 npmmirror) | — |
| 数据层 | Dexie 全表（含预建空表 vault/shopping/finance/cycles）+ 实体类型 + Repository 统一契约（create/update/remove软删/restore/get/query/purge）+ 全局字段(`_dirty/_syncedAt` 同步预留) | 阶段一、技术方案 §4 |
| 主题 | 语义 token 三层（`@theme inline`），warm 浅/深两套，奶油底+陶土橙+墨绿+琥珀；组件零十六进制色值 | 技术方案 §5 |
| 导航壳 | hash 路由 + 四 Tab keep-alive 显隐 + TabBar(安全区/毛玻璃) + PageHost 抽象 + 模块页右滑入转场 + dev 393×852 手机框 | 技术方案 §2.3/2.5 |
| 基础组件 | `Card`(缺 onPress 开发态告警) / `EmptyState`(action 必填) / `Toast` / `NavBar` / 自建 SVG 图标集 | 技术方案 §6 |
| 状态层 | zustand stores（useAppStore/usePetStore/useRecordStore/useTodoStore）+ 启动水合 + 写库后 bumpDataEpoch | 技术方案 §3 |
| **核心闭环** | **我的憨憨**：档案增删改查 / 成长时间轴增删改查（写入 `records` 表 `type:'pet_moment'`）/ 健康记录 / 软删+二次确认 / IndexedDB 持久化 | 阶段二 |

> 铁律已落实：组件内不碰 `db.*`（全走 Repository）、`Card` 无 `onPress` 告警、`EmptyState` 必带添加入口、一屏至多两强调色、语义 token。

## 3. 当前为占位（按文档后续补齐）

- ~~日记 / 我们的时光 / 灵光一闪~~ → **已按 Phase 7 复制实现**（见下方「新增」），空间卡片已接入，可增删改查 + 持久化。
- ~~密码保险箱：仅建空表 + 设计，未实现~~ → **已实现**（PBKDF2 + AES-GCM 真加密，见 §3.5 密码箱模块）
- PWA 部署（阶段六）：**已完成** — `vite-plugin-pwa` 接入，`manifest.webmanifest` + Service Worker（App Shell 离线缓存）构建产物正确生成；图标为占位 SVG（建议替换为正式 PNG 180/192/512）；真机「添加到主屏 / 离线 / 安全区」需你在 iPhone 上最终验证
- 购物清单（/shopping）：**已实现** — 独立 `useShoppingStore`(shopping 表) + `ShoppingPage`（财富规划删除后，这里是唯一的完整编辑面）；输入即增、勾选置「已买」、删除，无图片/价格/优先级（文档克制）。首页只做「待买速览 + 点按标记已买」。
- 验收脚本 `.mjs`（headless Chromium 真机视口）体系：原项目 156 条，本期重建尚未补自动化验收

### 新增（Phase 7 三模块复制）

| 模块 | 路由 | store | 字段/特点 |
|------|------|-------|-----------|
| 日记 | `/diary` | `useDiaryStore`(type:'diary') | 标题可空(回退日期)、心情/天气 chip、增删改查、**图片上传+卡片展示** |
| 我们的时光 | `/moments` | `useMomentsStore`(type∈touched/conflict) | 双类型共用时间轴、不同徽标、可选关联人物、感动3字段/复盘6字段、**图片** |
| 灵光一闪 | `/spark` | `useSparkStore`(type:'spark') | 输入即存、归类 chip、完成标记、无标题 |

均复用 `records` 统一表 + Repository，写库后 `bumpDataEpoch` + 同步全局 `useRecordStore`，满足跨页面刷新一致性（文档 §4 跨模块约定）。

---

## 3.5 本轮新增：图片上传 / 底部 Sheet 弹层 / 数据备份（用户明确需求）

> 原所有模块用 `prompt()`/`window.confirm()`，已被原生弹窗替换；图片零展示。本轮补齐三块基础设施并接入全部页面。

### 基础设施（共享，一次性）
| 文件 | 作用 |
|------|------|
| `components/base/Sheet.tsx` | 底部升起弹层（遮罩+面板+取消/Esc 关闭，可滚） |
| `stores/useOverlayStore.ts` | 全局浮层容器，提升到 `App` 根级（覆盖全屏含 TabBar） |
| `components/base/fields.tsx` | Sheet 内表单零件：Field / TextInput / TextArea / ChipSelect |
| `components/base/Confirm.tsx` | `confirmSheet()` 用 Sheet 替代 `window.confirm`（返回 Promise\<boolean\>） |
| `services/media.ts` | Canvas 压缩（长边≤1600 q.8 原图 + 长边320 缩略图），零第三方库 |
| `components/base/ImagePicker.tsx` | 选图→压缩→存 media 表→回传 id 列表，可移除 |
| `components/base/MediaImage.tsx` | 按 id 从 IndexedDB 取 Blob→objectURL 展示 |
| `services/backup.ts` | 导出（全表+图片 base64→JSON 下载）/ 导入（自动先备份再 upsert）/ 存储占用统计 |

### 接入页面（已落地）
- **日记 / 我们的时光 / 憨憨成长**：Sheet 表单 + `ImagePicker`；卡片内 `MediaImage` 横向展示图片。
- **财富规划**：Sheet 表单（类型/类别/名称/金额/周期），点击条目卡即编辑；内嵌购买清单。
- **生理周期**：Sheet 记录（开始/结束日期）。
- **我的 → 数据管理**：真实导出/导入按钮 + 存储占用（条数 + 体积）。
- **所有删除**统一走 `confirmSheet`（原生 confirm 已全清）。

### 关键架构决策（踩坑记录）
- **Sheet 内的表单必须自带 `useState`**：`useOverlayStore.open(<Sheet>…)` 存的是一次性 ReactNode，外层页面 state 变更不会重渲染冻结的 Sheet 子树。因此每个表单做成内部 `useState` 的自包含组件，`onSave(draft)` 回调上抛。
- **`Repository.create` 入参改宽松**：由 `Omit<T, keyof BaseEntity>` 改为 `Partial<Omit<T, keyof BaseEntity>> & Partial<BaseEntity>`，兼容各 store「只传部分业务字段」的现状。
- **`mediaRepo.create` 返回整实体**：取 `.id` 而非返回值本身（之前误当 string 用，已修）。
- 已知小瑕疵：Sheet 取消后已上传但放弃保存的 media 会留孤儿 Blob（本期不回收）。

### 本轮补充（用户「都做」三项）
1. **孤儿图片回收**：`services/media.ts` 新增 `purgeOrphanMedia()`，扫描 records/pets/people/settings 的引用，删除未被引用的 media 行；挂载到 `useOverlayStore.close()`（取消 Sheet 后自动回收）+ `importBackup` 之后。
2. **正式 PNG 图标**：重绘 `public/icon.svg`（陶土橙爪印），用 ImageMagick 生成 `icon-192.png` / `icon-512.png` / `apple-touch-icon.png`；`vite.config` manifest 改为 PNG（含 maskable），`index.html` 加 `apple-touch-icon` + manifest 链接。iOS 添加到主屏终于有正确图标。
3. **首页待办红点 + 到期高亮 + 轻量提醒**：
   - `useTodoStore` 扩展 `create(title, remindAt?)` + `isTodoDue()` + `markNotified()`。
   - 首页待办：Sheet 添加（含可选提醒时间）；到期项红色高亮 +「到点」标签；删除走 `confirmSheet`。
   - `TabBar` 新增 `badge` 属性，首页 tab 显示红点（有到期提醒时）。
   - `App` 挂载每分钟轮询：到点待办弹 Toast 提醒并标记 `notified`（持久化，刷新不重复打扰）。
   - **独立模块页 `/todo`**：新增 `pages/todo/TodoPage.tsx`，全量待办管理（新增/编辑/勾选/删除 + 提醒时间），排序为「到点 → 未完成 → 已完成」；`useTodoStore` 新增 `update()`；从「空间」卡片墙 + 首页「待办 · 全部 ›」双入口进入；`App` 路由挂接 `MODULE_TAB['/todo']='space'`。

### 全站按钮可用性审计（用户「检查是否还有按钮不能点击」明确要求）
全覆盖排查后修复如下，已消除所有"点了没反应"的死角：
1. **「应用设置」做成真实可保存面板**：
   - 新增 `stores/useSettingsStore.ts`（单行 `settings` 表，固定 id `default`，首次访问自动建默认行）。
   - `app` 字段承载 `hapticEnabled / reminderMode('on'|'off')`；`patchApp()` 即时落库。
   - `components/base/fields.tsx` 新增 `Switch` + `ToggleRow` 原语。
   - 「我的」→ 应用设置卡点击弹出 Sheet，内含「提醒总开关」「震动反馈」两个即时保存开关 + 震动预览按钮。
2. **周期条目可编辑**：`CyclePage` 列表卡点击进入编辑 Sheet（`useCycleStore` 新增 `update()`）；新增/编辑共用 `CycleForm`。
3. **健康条目可编辑**：`PetPage` 健康卡点击进入编辑 Sheet（`usePetStore` 新增 `updateHealth()`）；新增/编辑共用 `HealthForm`；`+` 按钮重置为新增。
4. **纯展示卡去伪按钮化**：记录页时间轴、首页「最近痕迹」、财富规划总览卡（环形图）改为非交互 `<div>`，不再伪装成可点 Card（消除"点了没用"的错觉）；「我的」主题中心 / 数据管理两个容器卡同步改为 `<div>`（操作走内部真实按钮）。
5. **删除按钮冒泡修复**：周期卡 / 健康卡内的「删除」按钮补 `stopPropagation()`，避免误触发卡片编辑 Sheet。
6. **震动反馈全局生效**：新增 `services/haptic.ts`（`navigator.vibrate` 受 `hapticEnabled` 控制）；接入 TabBar 切换、主题浅/深切换、数据管理按钮、设置开关。
7. **提醒总开关联动**：`App` 每分钟轮询尊重 `reminderOn`，关闭后不再弹待办提醒 Toast。

> 已验证：`grep` 全仓无残留 `onPress={() => {}}` 空死按钮；`tsc --noEmit` 零错误；`npm run build` 通过；已重新发布到同一 verified 链接。

### 全站页面重排（用户「重新设计页面排版」+ 更活泼卡片化）
方向：保持暖色系，但整体往 **更活泼的卡片化** 走——大圆角、明显悬浮阴影、色彩分区、彩色入口卡。改动集中在「设计 token + 两个共享组件」，因此全站自动继承新观感，无需逐页重写。

1. **设计 token（`app/styles/index.css` `@theme`）全面升级**：
   - 圆角放大：card 20→24px、sheet 24→30px、btn 14→16px、img 12→16px。
   - 阴影增强：`--shadow-soft` 0 2px→0 6px/18px；新增 `--shadow-card`（0 12px/32px，卡片主阴影）、`--shadow-pill`（悬浮导航条阴影）。
   - 按压手势更弹：`.pressable:active` scale 0.97→0.95，并叠加 `--shadow-soft` 形成"按下去"的浮沉感。
2. **`Card` 组件活泼化**：默认改用 `shadow-card`（更强悬浮）；传 `accentColor` 时整块着色软色底（`bg-*-soft`）而非底色叠淡色——入口卡变彩色块。
3. **`TabBar` 重做为悬浮药丸导航**：从通栏毛玻璃改为居中悬浮圆角药丸条（`shadow-pill` + 细 ring），激活项图标套彩色 squircle + 主色文字；模块页打开时整条下滑隐藏；首页红点位置适配。
4. **空间入口卡片墙增强**：图标改为浮在着色卡上的白色 squircle 芯片（`bg-surface shadow-soft`），层次更分明。
5. **`NavBar` 微调**：硬边框 `border-b` 改为柔和 `shadow-soft`，呼应卡片化。

> 影响范围：因 Tailwind v4 `@theme` 驱动，所有使用 `rounded-card / shadow-soft / bg-surface / bg-*-soft` 的页面（记录页、首页、财富、憨憨等）同步获得更大圆角与更强悬浮感。
> 验证：`tsc --noEmit` 零错误；`npm run build` 通过；已重新发布到同一 verified 链接。预览图见对话内可视化挂件。

### 视觉设计说明 V1.0 对齐（用户给出权威设计文档）
对照《Titia 时序 UI 视觉设计说明 V1.0》逐条校准，已完成：
1. **配色语义校正**（文档 §二）：三强调色固定语义——陶土橙=日记/我们的时光/成长，墨绿=憨憨/周期/日常，琥珀=灵光/购物/规划。空间入口卡着色按此重排：憨憨·周期→墨绿，财富·购物·灵光→琥珀，日记·我们的时光→陶土橙。
2. **空间卡片墙（文档 §五）**：每张卡加「撞色标签」（陪伴/灵感/记忆/私密，实色药丸）；卡内边距 20px；按文档示例顺序重排，并补「密码箱」卡（点击弹出优雅的"即将开放"说明 Sheet，非死按钮）。副标题「我的生活空间」。
3. **首页（文档 §三）**：顶部加副标题「让时间留下痕迹」；「最近时间痕迹」改为私人朋友圈形式（模块图标 + 日期 + 标题 + 正文），轻量不似 Todo 软件。
4. **记录页（文档 §四）**：从纯列表改为「筛选 Chips（全部/日记/憨憨/我们的时光/灵光一闪）+ 真正双列瀑布（masonry）」。采用贪心分栏算法：按内容预估高度把每张卡放进当前较矮的一列，保留时间先后顺序的错落感；日期移到每张卡上（图标 + 日期 + 标题 + 正文 + 图片），去掉大日期分组头以免割裂瀑布流。
5. **我的憨憨（文档 §六）**：档案卡放大头像（64px 圆角方）、显式展示生日/年龄，避免"宠物医院/检查表"观感。
6. **组件规范（文档 §十/§十一）**：Sheet 顶部圆角 28px；新增克制 `fade-up` 淡入上浮动效（首页/记录/空间/憨憨头像入场），符合"淡入/上浮/页面滑入、避免炫技"。

> 说明：文档空间墙示例为 6 张（憨憨/周期/财富/购物/灵光/密码箱）。为保持所有已建模块可达（不制造死模块），保留日记/我们的时光入口卡（二者为记录型模块，需入口创建），待办则经首页「全部 ›」与独立 /todo 页进入，故未放入空间墙。如需严格 6 张，可将日记/我们的时光创建入口收归记录页。
> 验证：`tsc --noEmit` 零错误；`npm run build` 通过；已重新发布到同一 verified 链接。

### 信息架构重构（用户反馈：高频内容不该全埋在空间里）
用户痛点：所有有用模块都在「空间」卡片墙，每次要多点一步。按用户确认的方案重排为 **4 个底部 Tab：今日 / 小窝 / 时光 / 我呀**（后经用户两次改名：首页→今日、空间→小窝、日记·关系→时光、我的→我呀；仅改 `TabBar.tsx` 的 `TABS` 标签，路由 key 不变，零副作用）。
1. **底部导航重组**：TabBar 改为 今日 / 时光(JournalIcon) / 小窝 / 我呀；`App.tsx` 的 `TAB_OF_PATH` / `MODULE_TAB` / `TabContent` 同步重排（/diary、/moments 归属 journal Tab；/record 归属 mine；/todo 归属 home）。
2. **新增「日记·关系」合并 Tab**（`pages/journal/JournalPage.tsx`）：内部子切换「我的日记 / 我的关系」；关系内含「感动瞬间 / 吵架复盘」子切换。复用 `DiaryPage`/`MomentsPage` 的 `embedded` 模式（不重复 NavBar/滚动容器）。

> **v2（用户修正导航结构）**：一级目录「我的日记 / 我的关系」**从顶部横向 Tab 改为左侧侧边导航**（参考空间页布局：68px 竖排图标栏 📖 日记 / 💙 关系，常驻可见，页内 state 切换不走路由）；二级「感动瞬间 / 矛盾复盘」仅存于「我的关系」右侧详情页顶部。

> **v3（用户要求二级参考憨憨入口）**：二级分类从 `rounded-pill` 胶囊改为 **`grid-cols-2` 等宽入口卡片**（💞 感动瞬间 / 🔍 矛盾复盘，图标 + 文字，选中态 `bg-primary`，参考憨憨资料卡下方的三入口视觉语言）；「+ 新增」按钮移到顶部右对齐。顺手修了一个存量 bug：**列表原本不按 kind 过滤**（切「感动瞬间 / 矛盾复盘」只是 UI 高亮，列表两类混显），现在 `items.filter(m => m.type === kind)` + 按分类显示空态文案（「还没有感动瞬间 / 还没有矛盾复盘」）。验证 `/tmp/navcheck.mjs` 扩到 **17 项全通过 / 0 失败**（本地 + 线上）：左侧 nav ≈68px 且常驻、顶部无横向 Tab、默认右侧日记页、二级等宽卡片（rounded-card + grid 两卡等宽 194px）、二级可切换且选中高亮、+ 按钮右对齐、**感动/矛盾分类各只显示对应记录**、空态按分类显示。

> **测试踩坑（本轮最耗时）**：navcheck 一度"默认右侧显示日记页"假红。排查半天发现 **chromium headless 的 `--remote-debugging-port` 端口被上次运行的残留进程占用**时，新 chromium 会加载出 Chrome 错误页（body 只有 "Reload/Details" 按钮），页面根本没挂载——所有断言全挂。教训：**跑 CDP 测试前先 `pkill -9 chromium`（按进程名，别用 `-f` 全命令行匹配——会把含 "chromium" 字符串的当前 shell 一起杀掉）并确认端口已释放**。另：`vite preview` 进程会缓存启动时的 dist 文件列表，rebuild 后必须重启 preview 才会提供新 JS，否则测试加载旧版本（表现为页面混合新旧代码）。
3. **首页 dashboard 收敛**：仅保留顶部问候卡（app 名「Titia 时序」+ 问候 + 标语「让时间留下痕迹」），**去掉待办/痕迹/憨憨三张预览统计卡**；下方「待办」（新增 / 删除 / 勾选完成）；再下方「购物清单·待买（只读同步，不可修改）」。
4. **我的页面**：顶部显示 app 名「Titia 时序」+ 标语；保留 主题中心 / 数据管理 / 应用设置。**已移除「我的板块」7 个快捷入口卡**（憨憨/周期/财富/购物/灵光/时间轴/日记·关系）——这些模块已在底部导航直达，无需重复入口。
5. **空间墙瘦身**：移除已迁出的日记/我们的时光，仅保留其余生活板块（憨憨/周期/财富/购物/灵光/密码箱）。
6. ~~**财富规划·购买清单只读化**~~ → **已作废**：用户反馈「不能只读，不然怎么添加」，随后整个财富规划模块被删除（见下方 §3.6 第 1 条）。购物清单的编辑面回归独立 `/shopping` 页。

### 密码箱模块（用户要求：平台/账号/密码可编辑保存）
落地为**真正加密的保险箱**，复用预建的 `vaultMeta` / `vaultItems` 表与 `VaultItemEntity{name,account,secret:{iv,cipher},note}` 结构。
- **加密方案**（`services/vault.ts`，Web Crypto）：主密码经 PBKDF2（SHA-256，15 万次）派生 AES-GCM 256 密钥；主密码**永不落库**，仅存派生所需的 `salt/iterations` 与用主密码加密的 verifier 令牌（用于解锁校验）。每条密码以独立随机 iv 加密，`{iv, cipher}` 入库；解锁后用内存会话密钥解密展示，**锁定即清空内存密钥**。
- **状态层**（`stores/useVaultStore.ts`）：`init/setup/unlock/lock/add/update/remove`；会话密钥存模块作用域（不进 state、不落库）。
- **页面**（`pages/vault/VaultPage.tsx`，路由 `/vault`，归空间 Tab）：三态——① 未创建→设主密码（≥4 位、二次确认）；② 已锁→输主密码解锁（错误提示）；③ 已解锁→列表（平台/账号/密码，密码支持显示·隐藏·一键复制）+ 底部 Sheet 增改表单（平台/账号/密码/备注，密码框带显隐）+ 删除二次确认 + 右上「锁定」。
- **入口**：空间页「密码箱」卡由「敬请期待」占位改为 `navigate('/vault')` 真正进入。
- **验证**：`tsc --noEmit` 零错误；`npm run build` 通过；已重发布到同一 verified 链接。加密闭环已用独立 Node 脚本验证（正确密码解锁成功、错误密码被拒、密文可解密还原）。

---

## 3.6 本轮批量需求（用户一次性 11 条）

> 用户一口气提了 11 条，本节按条目逐一记录落地方式与踩坑。全部已实现、`tsc --noEmit` 零错误、`npm run build` 通过、已重发布到同一 verified 链接。

| # | 用户原话（摘要） | 落地 |
|---|------------------|------|
| 1 | 财富规划没必要，删掉 | 删除 `pages/finance/`，移除路由/入口/`MODULE_TAB` 映射 |
| 2 | 灵光一闪联网自动联想电影音乐图片 | `services/sparkImage.ts` + SparkPage「🔗 联网配图」 |
| 3 | 憨憨头像可自定义 + 增加体重记录模块 | PetPage 头像 `ImagePicker` + 独立 `WeightSection` |
| 4 | 密码箱按平台名自动显示 logo | `theme/platformLogos.ts` 关键词匹配 |
| 5 | 首页购买清单可改为「已买」 | 首页条目点按即 `toggle(id, true)` |
| 6 | 我的关系可上传多张图片 | 复核：`ImagePicker` 本就 `multiple`，无需改动 |
| 7 | 首页待办占位空间小一点 | `EmptyState` → 一行 `bg-surface` 提示条 |
| 8 | 灵光一闪放底部导航中间，用加号 | `TabBar` 中央悬浮 `+`，并从空间移出 |
| 9 | 主题中心做成入口，里面可换皮肤，全局生效 | `theme/skins.ts` + `/theme` 页 + `applySkin` |
| 10 | Dashboard 加天气（不要苹果源），显示状态/气温/紫外线 | `services/weather.ts`（Open-Meteo） |
| 11 | 空间页做成侧边导航入口，不要卡片 | SpacePage 重写（经三版迭代，最终为一屏聚合工作面） |

### 关键实现细节

**1. 删除财富规划**
- 删 `pages/finance/FinancePage.tsx` 与整个目录；`App.tsx` 移除 import / 路由分支 / `MODULE_TAB['/finance']`；空间入口去掉「财富规划」。
- **保留** `financeItems` 表 + `useFinanceStore` + `financeRepo`：老用户备份文件里可能有这批数据，删表会导致导入报错/丢数据。属于「页面下线、数据层保留」的有意决策。

**2. 灵光一闪联网配图（`services/sparkImage.ts`）**
- `searchImage(query)` 走 **Wikipedia REST summary**（`zh.wikipedia.org` 优先，失败回退 `en`），取 `thumbnail.source`。选它的理由：无需 API Key、响应带 CORS 头、电影/专辑/书名命中率高。
- SparkPage 输入框旁加「🔗 联网配图」按钮 → 拉取中显示 loading → 命中则出缩略图预览（可 × 移除）→ 保存时把 `imageUrl` 写进 `useSparkStore.create()`；卡片渲染 `p.imageUrl && <img>`。
- **踩坑**：沙箱网络策略拦截 wikipedia（curl 返回 HTTP 000），一度误判接口不可用；实测浏览器端（用户真机）CORS 正常。因此代码做了 `catch → null` 的静默降级，拿不到图不影响正常保存。

**3. 憨憨头像 + 体重模块（`pages/pet/PetPage.tsx`）**
- 档案实体加 `avatarMediaId?: string`；`PetForm` 里用 `ImagePicker` 单选（`onChange={(ids) => setD({...d, avatarMediaId: ids[0] ?? ''})}`）。**注意 `ImagePicker` 没有 `max` 属性**（曾误写 `max={1}`），靠取 `ids[0]` 限制。
- 档案卡有头像时渲染 `<MediaImage className="h-16 w-16 rounded-[20px] object-cover">`，无则回退原 emoji。
- 新增 `WeightSection`：从健康记录里筛 `kind === 'weight'` 单独成块，顶部 `WeightSparkline`（纯 SVG `polyline`，零图表库）画趋势，下方列历史；`+` 走预填 `kind='weight'` 的 `HealthForm`。原健康区同步 `filter(kind !== 'weight')`，避免重复展示。

**4. 密码箱平台 logo（`theme/platformLogos.ts`）**
- `platformLogo(name)` 按关键词匹配返回 emoji（微信/支付宝/淘宝/Gmail/GitHub/银行卡/…），兜底 🔐。
- 纯本地匹配，**不联网抓 favicon**——密码箱页面对外发请求会泄露「用户有哪些平台账号」，是隐私红线。

**5/7. 首页调整（`pages/home/HomePage.tsx`）**
- 购物条目由只读改为「点按即标记已买」（`onClick={() => toggle(i.id, true)}`，右侧提示「标记已买」），并加「管理 ›」跳 `/shopping` 做完整增删。
- 待办空态：`EmptyState`（大留白 + 按钮）→ 单行 `rounded-card bg-surface p-4` 提示条，高度与上方 dashboard 相当。

**8. 底部导航中央加号（`components/nav/TabBar.tsx`）**
- `TABS` 拆成 `leftTabs = slice(0,2)` 与 `rightTabs = slice(2)`，中间插 `h-12 w-12 rounded-pill bg-primary` 的 `+` 按钮，`onQuickSpark` 由 `App` 传入 → `navigate('/spark')`。
- 单 tab 宽度 68→60px 给中央按钮腾位；首页红点偏移同步 19→14px。
- 空间侧边导航移除「灵光一闪」，避免双入口。
- **后续调整**：应用户要求把「空间」与「日记·关系」对调，最终排布为 **首页 / 空间 / [+] / 日记·关系 / 我的**。改动只在 `TABS` 数组里换两项的位置——`leftTabs/rightTabs` 的 `slice` 切法、路由映射 `TAB_OF_PATH`（按 key 查而非按下标）、`TabContent` 的保活容器（全部 `absolute inset-0`，只靠 `display` 显隐）都不依赖顺序，所以零副作用。`App.tsx` 的 `tabs` 数组同步调序，纯为可读性一致。

**9. 皮肤系统（全局换肤）**
- `theme/skins.ts`：`SKINS` 五套（暖陶土 warm / 樱花粉 sakura / 海蓝 ocean / 森绿 forest / 薰衣草 lavender），每套含 `light` + `dark` 两组 13 个 `--color-*` token。（后由第 13 条扩充为 10 套，并加入分组与装饰能力。）
- `applySkin(skinId, mode)` 把 token 直接写到 `document.documentElement.style`（内联变量优先级高于 `@theme` 默认值），同时打 `data-theme` / `data-mode`。**因此换肤对所有用语义 token 的页面自动全局生效，零逐页改动**——这正是前面坚持"组件零十六进制色值"铁律的回报。
- 持久化：`SettingsEntity.theme` 由 `{id, mode}` 改为 `{skin, mode}`；`useSettingsStore` 加 `skin` + `setSkin()`。`App.tsx` 里 `useEffect(() => applySkin(skin, mode), [skin, mode])`。
- 入口：「我的 → 主题中心」由内联浅/深按钮改为 `Card onPress → /theme`；`ThemePage` 内含浅色/深色切换 + 五套皮肤选择。

> ⚠️ 这一版留了个哑弹，直到第 12 条才发现：`ThemePage` 被 import 进 `App.tsx`，`MODULE_TAB` 也配了 `'/theme': 'mine'`，**唯独漏了 `{path === '/theme' && <ThemePage />}` 这行渲染**。于是点进主题中心是一片空白，整套换肤功能等于没有入口。`tsconfig` 里 `noUnusedLocals: false`，那个只 import 不使用的 `ThemePage` 就这么一路溜过了类型检查。教训：**"写完了" ≠ "点得到"**，新功能必须实际点进去看一眼。

**10. 天气模块（`services/weather.ts`）**
- 用 **Open-Meteo**（`current=temperature_2m,weather_code,uv_index`）：免 Key、免注册、CORS 开放，且明确**不是苹果天气源**（用户点名要求）。沙箱内 curl 实测可达。
- 定位走 `navigator.geolocation`，拒绝授权或超时则回退北京坐标，不阻塞页面。
- WMO weather_code → `{desc, icon}` 映射表；`uvLevel(uv)` 把紫外线指数转「弱/中等/强/很强/极强」。
- 首页 dashboard 改为 `flex justify-between`：左侧问候语，右侧天气块（图标 + 气温 + 天气状态 + `紫外线 X 强度`），只显示用户要的三项，不做逐时/多日预报。

**11. 空间页（五版迭代）**

这条返工多次，把弯路和定稿都记下来：

| 版本 | 形态 | 用户反馈 |
|------|------|----------|
| v1 | 纵向 `<nav>` 列表（图标+标题+副标题+`›`） | 「不是列表目录」——只是把卡片拍扁，本质还是目录 |
| v2 | 左侧 74px 竖栏 + 右侧内容区，右侧带「进入」按钮 | 「不要每个板块单独点进入」——比列表还多一步 |
| v3 | 一屏纵向聚合，每块直接可操作 | 「侧边导航取消了」——把栏也一起干掉了 |
| v4 | 左侧竖栏一击进模块 + 右侧速用区（摘要+高频动作） | 「不需要速用区，不用预览」——中间层是多余的 |
| **v5（当前）** | **左侧竖栏常驻 + 右侧直接渲染完整模块页** | — |

**v5 设计原则**

一句话：**空间页 = 一个带左侧导航的模块容器**。点侧栏图标 → 右侧就变成那个模块的完整页面，不是摘要、不是预览、不是缩水版。

- **左栏 68px 常驻**，在空间的任何模块页都在，随时可点着切到另一个模块。
- **右侧是真页面**：`ShoppingPage / CyclePage / PetPage / VaultPage` 原样渲染，功能一件不少（购物增删改、周期记录 Sheet、憨憨编辑与体重、密码箱解锁与增改）。
- **切换不换路由**：用局部 `useState<TabKey>` 而非 `navigate()`，hash 始终停在 `#/space`。这是"侧栏常驻"的关键——一旦跳 `/shopping`，就进了独立页面，侧栏必然消失。
- **两栏独立滚动**：右侧内容再长，左栏也不动。

**实现方式：`embedded` 复用而非复制**

四个模块页各加一个 `embedded?: boolean`：

```tsx
// 每个模块页的收尾都是这个形状
if (embedded) return content              // 只给内容，容器/标题由空间页管
return <><NavBar title="…" right={…} /><PageHost>{content}</PageHost></>
```

`content` 开头补一行 `{embedded && <EmbeddedHeader title="…" right={…} />}`。新组件 `components/nav/EmbeddedHeader.tsx` 就 8 行——一个标题 + 右侧动作槽，**把 NavBar 的 `right` 按钮原样接过来**（购物无 / 周期「记录」/ 憨憨「编辑」/ 密码「锁定」），所以内嵌后一个操作都不丢，同时不会出现第二条返回栏。

这个 `embedded` 模式不是为空间页新发明的，`DiaryPage`/`MomentsPage` 通过 `JournalPage` 早就在用，这次只是把同一套约定推广到四个模块。**零业务逻辑复制**——空间页里跑的就是模块页本体，以后改模块页，空间页自动跟着变。

| | 购物 | 周期 | 憨憨 | 密码 |
|---|---|---|---|---|
| 侧栏点击 | 右侧 = 完整购物清单页 | = 完整周期页 | = 完整憨憨页 | = 完整密码箱页 |
| 保留的头部动作 | —（输入框即入口） | 记录 | 编辑 | 锁定 |

**几个刻意的取舍**
- `VaultPage` 的 Setup / Unlock 两个前置视图也接了 `embedded`（去掉 `mt-6`、换 `EmbeddedHeader`），否则未解锁状态下右侧会顶着一段空白；loading 态内嵌时直接 `return null`，不闪骨架。
- 右侧可用宽度只剩约 287px（左栏 68 + 内边距），给密码/购物的长文本补了 `min-w-0` + `truncate`、给图标容器补 `flex-shrink-0`，防止 flex 子项撑破容器。
- 切走再切回不丢数据：模块状态都在全局 zustand store 里，组件卸载不影响。给右侧容器加了 `key={active}` + `fade-up`，切换有淡入而不是硬闪。
- `CyclePage` 的空态按钮原本是个 `<span>`（纯装饰），内嵌后成了这个模块唯一可见的入口，顺手改成真 `<button onClick={openCycleForm(null)}>`。

**顺手修掉的既有 bug（排序随机）**
`Repository.query()` 结尾是 `.reverse()`，即**按主键倒序**；而主键是 `crypto.randomUUID()`，所以列表顺序实际上是**随机的**，刷新一次就换个顺序。`shopping` 表建了 `order` 字段却从没参与排序，`pets` 的 `order` 建档时恒为 `0`。已修：
- `useShoppingStore`：抽 `sorted()` 统一按 `order`（创建时间戳）**降序**，新加的在最上面；并给 `toggle`/`remove` 补上漏掉的 `bumpDataEpoch()`，否则空间页勾完首页数字不动。
- `usePetStore.load`：按 `createdAt` **升序**（`order` 恒为 0 排不了序），先接回家的憨憨排前面。

**基础设施扩展**
`PageHost` 增加 `contentClassName` 可选属性：默认仍是「整页滚动 + px-5」；空间页这种左右分栏、双滚动容器的布局可以自己接管样式，无需违背 PageHost 的封装。

**验证**：用 CDP 驱动 headless Chromium 做真实交互回归（`/tmp/interact3.mjs`），**23 项全通过、0 失败、无运行时错误**：

- 侧栏 4 项存在、有选中态标记；默认内嵌完整购物页。
- 依次切「周期 / 憨憨 / 密码 / 购物」，每次断言三件事：hash 仍是 `#/space`（没跳走）、侧栏仍在 DOM（没消失）、右侧确实是完整模块页（能查到该模块的输入框/记录/操作按钮）。
- 内嵌保留原 NavBar 动作（憨憨「编辑」、周期「记录」且能真的打开表单）；内嵌页**没有**重复的返回键。
- 内嵌购物能真实新增；切走再切回数据保持；右侧滚到底侧栏仍常驻；全页无「速用区」残留文案。

踩坑记录：v4 的脚本误把底部 TabBar 的 `<nav>` 也选进侧栏 query，且按钮文本含 emoji（`🛒购物`）导致全等匹配失败——必须用 `document.querySelector('nav.border-r')` 精确定位、用 `.includes()` 匹配文本。另外每轮测试开头要先 `clear()` 相关 IndexedDB 表，否则上一轮遗留的「进行中周期」会污染断言。

> **补充说明**：第 6 条「我的关系上传多张图片」经复核**无需改动**——`ImagePicker` 的 `<input>` 本就带 `multiple`，`MomentsPage` 也已用 `MediaRow` 遍历渲染全部 `mediaIds`。用户可以一次选多张吵架聊天记录截图。这条如实回报为「已支持」，没有为了凑数造改动。

**12. 底部导航调序**

「空间」与「日记·关系」对调，最终为 **首页 / 空间 / [+] / 日记·关系 / 我的**。只改 `TABS` 数组里两项的位置：`leftTabs/rightTabs` 的 `slice` 切法、`TAB_OF_PATH`（按 key 查非按下标）、`TabContent` 的保活容器（全部 `absolute inset-0`，靠 `display` 显隐）都不依赖顺序，零副作用。`App.tsx` 的 `tabs` 数组同步调序仅为可读性。CDP 验证 10 项通过。

**13. 角色皮肤系列（皮肤系统 v2）**

需求是「玉桂狗主题」。先说清楚判断：**只换 13 个颜色 token 做不出角色感**——那份可爱来自云朵和圆润的形状，不来自色相，纯换色只会得到"一个淡蓝色的 App"。所以这次是把皮肤系统从「配色表」升级成「配色 + 装饰 + 形状」三件套。

**版权处理**：三丽鸥角色形象受版权保护，常规做法是**不复刻任何角色形象**，装饰一律自绘通用几何图形（云 / 星 / 五瓣花 / 爪印 / 蝴蝶结），这类符号本身不构成侵权；角色皮肤只借「配色气质」。

> **用户后续追加**：用户在已有"通用几何 motif"基础上，单独**新增一个玉桂狗主题** `cinnamon`（保留全部合规的通用 motif），从用户提供的玉桂狗主题效果图中裁剪出 5 个玉桂狗元素。后经用户反馈"不要方块贴图，要融入背景"——第二轮改为 **PIL 抠图抠出玉桂狗本体（透明背景 PNG，flood fill 抠掉浅蓝背景）** `cut-*.png`，再应用到页面：`ThemePage` cinnamon 卡片用 cut-0 在 primary-soft 浅蓝圆角预览里（无方块）；`PetPage` 资料卡用 cut-1 半透明（opacity 0.4 + saturate 0.9）作为卡片"水印背景装饰"（不再贴图在卡片角落）；空态用 cut-2/3（透明背景融入浅蓝页面）；`MinePage` Banner 重做成**渐变背景**（primary-soft → surface → highlight-soft）+ 玉桂狗融入右下角 + 浮动云朵星星点缀；`CyclePage` 月份旁加 SVG 云朵（保持融入式）。**版权风险由用户承担**（Sanrio 角色商用需授权，公开链接可能被 IP 投诉）。

*架构扩展（`theme/skins.ts`）*

```ts
interface Skin {
  group: 'basic' | 'character' | 'clash'  // 分组（'clash' 见第 14 条）
  motif?: MotifKind              // 装饰图形，仅 character 有；不设 = 完全不渲染装饰
  note?: string                  // 主题中心的一句话说明
  light: Palette; dark: Palette
}
```
`applySkin` 除写 13 个 `--color-*` 外，再写 7 个形状 token（角色皮肤用 `SOFT_SHAPE`：圆角 24→28px、阴影更散更淡），并打 `data-motif` 属性供 CSS 与测试判断。

*一个必须先解决的技术障碍*

`--radius-*` / `--shadow-*` 原本是**直接写在 `@theme inline` 里的字面值**。`inline` 关键字的含义是把值内联进工具类——`rounded-card` 会编译成 `border-radius: 24px` 而**不是** `var(--radius-card)`，所以运行时 `setProperty` 根本改不动它。颜色能换肤是因为它们写成了 `--color-bg: var(--color-bg)` 的两层引用。解法就是把形状 token 也改成同构：`:root` 里放真值，`@theme inline` 只做 `var()` 引用。改完实测 `borderRadius` 确实随皮肤在 24px / 28px 之间切换。

*五套角色配色*

| 皮肤 | motif | 取色思路 |
|---|---|---|
| 玉桂狗 cinnamon | 云 | 天蓝 `#1a7fb5` + 奶白底 + 腮红粉 highlight |
| 库洛米 kuromi | 星 | 暗紫 `#6b4e9e` + 近黑紫 accent + 骷髅粉 |
| 美乐蒂 melody | 花 | 奶粉 `#dc3f76` + 兜帽红 accent + 奶油黄（刻意与既有 sakura 拉开） |
| 布丁狗 purin | 爪印 | 焦糖金 `#a5730f` + 贝雷帽棕 accent |
| 凯蒂猫 kitty | 蝴蝶结 | 蝴蝶结红 `#d93a51` + 背带蓝 accent |

原始角色色（如玉桂狗的浅天蓝、布丁狗的奶黄）饱和度太低，直接当 `primary` 会导致按钮上的白字看不清，所以主色统一取「同色相加深一档」，浅色留给 `bg` / `*-soft`。上表色值是第 14 条对比度审计后的**终值**，比初版又各压深了一档。

*装饰层实现*

- `SkinBackdrop`：`absolute inset-0` + `pointer-events-none`，9 个错开大小/时长/延迟的 motif，只用 `transform` 做 16~26s 的超慢漂浮（GPU 合成，不触发重排）。浅色 opacity 上限 0.085，深色压到 0.055（亮图形在暗底上更抢眼）。带 `@media (prefers-reduced-motion)` 静止兜底。
- **挂两处**：shell 底层管四个 Tab 页；模块页那层自带 `z-20 bg-bg` 会把底层完全盖住，所以容器内补挂一份。
- `MotifMark` / `MotifCorner`：空态顶一枚 64px 淡图形填补留白；卡片角标。

*刻意的克制*

`Card` 的角标做成**默认关闭的 `motif` 可选属性**，而不是自动给所有卡片加——购物清单 10 条就是 10 朵云，那是灾难不是点缀。目前只在首页 dashboard 和宠物 stat 卡这两处单独出现的大卡上开启。所有装饰在 `group === 'basic'` 时**返回 `null`、不产出任何 DOM**，基础色皮肤的观感与改造前逐像素一致。

*顺手修掉的致命 bug*

见第 9 条的警告框：`ThemePage` 从来没被渲染过，主题中心是空白页。这次做皮肤才撞上——**整套换肤功能此前根本进不去**。

**验证**：`/tmp/skincheck.mjs`，本地与线上各 **27 项全通过 / 0 失败**：主题中心可打开、分组正确、5 套角色皮肤齐全、切换后主色真的变（`#d9613c → #1a7fb5`）、`data-motif` 正确、飘云层出现且含 18 枚图形（shell + 模块页两层）、**圆角实测 24px→28px**、`pointer-events: none` 且页面中心命中的是内容而非装饰、四套皮肤 motif 各不相同、空态点缀出现、**基础色下空态干净无点缀**、刷新后持久化、深色模式装饰更淡且底色切换。踩坑：断言空态时用 `text-ink-2` 选 `<p>` 会抓到页面上更靠前的其它段落，得按文案精确匹配。

> **测试脚本别硬编码色值。** 这条断言最初写死了 `=== '#3d9fd1'`，第 14 条做对比度调优把玉桂狗主色压到 `#1a7fb5` 后测试就假红了一次。已改成从 `skins.ts` 源码解析期望值。

**14. 撞色皮肤系列（第三组 · clash）**

前两组都是**邻近色**配色（主色与 accent 色相接近，气质柔和统一）。这次要的是**对撞**：主色与撞色在色环上尽量拉开，观感冲突、张力强。

*五套撞色*

| 皮肤 | 主色 | 撞色 | 色相间隔 |
|---|---|---|---|
| 克莱因蓝 × 熔岩橙 klein | `#2436b8` | `#e0501d` | 143° |
| 正红 × 孔雀绿 peacock | `#c31f3c` | `#04796a` | 177° |
| 品红 × 湖青 magenta | `#fc4d94` | `#2ab0c4` | 141° |
| 紫罗兰 × 芥末黄 grape | `#5b2d9e` | `#9c7a10` | 141° |
| 墨绿 × 珊瑚粉 jade | `#0a6b58` | `#e0435f` | 179° |

*形状也跟着换气质*

撞色配硬朗形状才成立。新增第三套 `SHARP_SHAPE`：圆角 card 14px / sheet 18px / btn 10px / img 10px，阴影从暖灰改成冷灰 `rgba(20,20,30,…)` 且更收紧。至此三组形状各有辨识度——**角色 28px（软萌）/ 基础 24px（中性）/ 撞色 14px（硬朗）**，实测确认能真实切换。

撞色组**不带 motif**：飘浮云朵和撞色的锐利感互相打架，这组保持干净。装饰组件对 `group !== 'character'` 一律返回 `null`，天然生效。

*主题中心的差异化预览*

前两组预览是三个圆点。撞色组改成**两块紧贴无缝的色块**（`overflow-hidden` 外框 + 两个 `w-7` 子块）——只有让两色边缘直接相接，才看得出"撞"；隔开的圆点会削弱对比。旁边的高亮小方块用直角，呼应本组的硬朗形状。

*对比度审计（新增工具）*

`/tmp/contrast.mjs` 直接解析 `skins.ts` 源码，按 WCAG 相对亮度公式算全部 15 套 × 明暗两套 × 若干关键组合的对比度。首轮跑出 **15 项低于底线**（不只撞色，既有皮肤也有），逐项调色后收敛到 **0 项必修**；余下 9 项落在 3.0–4.5 区间，是大字号按钮文字的行业普遍取值，判定可接受。

> 踩坑：审计初版把 `bg-*-soft` + `text-*` 的组合也算了进去，报出 41 项。核查发现这些组合只出现在空间页侧栏和宠物页，那里的内容是 emoji，`text-*` 根本不生效——是伪命中，已从规则里删掉。

**验证**：`/tmp/clashcheck.mjs` **21 项全通过 / 0 失败**：第三组存在且 5 套齐全、三组俱全、长名称不破版、预览两色确实无缝（实测子块间距 0）、五套色相间隔均 >140°、**圆角实测收紧到 14px**、三组形状各异、撞色组无装饰层 / 无 `data-motif` / 空态干净、切换主色真的变、刷新后保持、深色底色切换。

**15. 设置表重复行（真 bug · 用户可见）**

做撞色验证时两条持久化断言挂了：换皮肤刷新后**有时**变回默认。直连 IndexedDB 一看，`settings` 表里躺着**两行**，创建时间差 1 毫秒。

*成因是两个独立缺陷叠加*

1. `ensureRow()` 无并发保护。App 启动时它可能被并发触发，两次调用都查到空表 → 各建一行。
2. `Repository.query()` 结尾是 `.reverse()`，按**主键**倒序；而主键是 `crypto.randomUUID()`。两行谁排前面完全随机。

单独看，缺陷 1 只是多一行冗余数据；缺陷 2 对其它表无害（它们都自己按业务字段排序）。但 `settings` 是唯一的**单行表**，代码直接取 `rows[0]` —— 两者一叠加，每次启动读到哪行是掷骰子。用户感知就是「换了皮肤，重开 App 有时变回去」这种最难复现的随机 bug。

*修法（`useSettingsStore.ts`）*

- **`inflight` promise 守卫**：并发调用共享同一个 in-flight promise，杜绝重复创建。
- **显式固定主键** `id: 'default'`：让这张表在主键层面就不可能有第二行（`Repository.create` 的 `...input` 在 `id` 之后展开，显式 id 会覆盖随机 UUID）。
- **自愈去重**：读到多行时保留 `updatedAt` 最新那行（才是用户最后一次真实修改），其余**软删**——不物理删，数据可回溯。老用户设备上已有的脏数据下次启动自动收敛。

**验证**：新增 `/tmp/settingscheck.mjs`，**13 项全通过 / 0 失败**。绕过 app 代码直连 IndexedDB 看物理真相：单行存活、主键为 `default`、连续 3 次换肤刷新零回弹、**注入一条伪造旧脏行后刷新能自愈回一行且保留正确那行**、脏行走软删、清空表后冷启动只重建一行。

> **踩坑（差点写出假绿测试）**：这脚本第一版用 `Page.navigate` 去 `#/theme` 当"刷新"。但当前 URL 已经是 `#/theme`，**只有 hash 的同 URL 导航属于同文档导航，页面根本不重启** —— 于是"刷新后皮肤保持"这类断言全部无条件通过。必须用 `location.reload()`。现在脚本里加了一条哨兵断言：刷新前在 `window` 上插标记，刷新后确认它消失，先证明"刷新真的刷了"，再谈后面的持久化。

**16. 数据同步修复（用户实测：保存成功但列表不刷新）+ 配套交互优化**

*根因（重要）*

`useDiaryStore` / `useMomentsStore` / `useSparkStore` 的 `create/update/remove` 只调 `sync()`（去刷新**全局** recordStore + bump epoch），**从不更新自己 store 的 `items` state**。页面订阅的是各模块自己的 store → storage 写进去了，但订阅方 UI 不重渲染，直到重进页面重新 `load()`。`useRecordStore` / `usePetStore` / `useCycleStore` / `useShoppingStore` / `useTodoStore` 都是正确的（写库后同步自身 state），所以只有这三个模块"保存后延迟出现"。

修法：三个 store 的写操作在落库后同步改自身 `items`（create 插头部 / update 映射 / remove 过滤），`load()` 统一按 `occurredAt` 倒序（此前 `query().reverse()` 是随机 UUID 序，列表顺序刷新会跳）。

*顺手挖出的真实 bug（购物勾选失效）*

首页购物清单卡片的 `onClick` 调用的 `toggle` 是 **`useTodoStore` 的 toggle**（HomePage 解构了待办的 `toggle` 却没解构购物 store 的），传进去的是 shopping 表的 UUID → 待办表 `update` 找不到记录 → 点了没反应。已改为 `shopToggle`。

*购物清单 status 字段（首页快捷勾选）*

`ShoppingEntity` 增加 `status: 'pending' | 'completed'`（权威字段），`bought` 保留兼容老数据，`load()` 归一化（老数据按 `bought` 推断）。首页只显示 `pending` 并带勾选圆钮，点击立即置 `completed` + Toast「已买：xx」，首页即时消失；空间页两组显示（想买/已买）。**同一份 `shopping` 表，无第二份数据**。

*全局日期选择器*

新增 `DateInput`（`<input type="date">`，iOS Safari 原生滚轮 / 安卓原生日历，禁手输），替换生理周期（开始/结束）、体重、健康记录、憨憨生日四处日期录入。

*生理周期*

「历史记录」独立入口（overview ↔ history 两个本地视图，点「返回月历」回退）；日历三种标记：**实际经期粉底 `#F9A8C7`、预计月经浅粉 `#FCE4EC`+深粉字、今天蓝色边框 `#3B82F6`**；顶部「预计下次」与日历预计标记共用 `predictNext` 输出，天然同步。

*我的憨憨*

资料卡保留，下方改为**三个横向等宽入口**（成长时光 📸 / 体重 ⚖️ / 健康记录 💊，`grid-cols-3` 等宽），点击进入各自管理视图（原 section 内容）+「返回资料」。不再纵向平铺大卡片。

**验证**：新增 `/tmp/synccheck.mjs` **18 项全通过 / 0 失败**（本地 + 线上）：测试1 新增日记立即出现、测试2 删除日记立即消失、测试3 新增灵光立即显示、测试4 删除灵光立即消失、测试5 首页勾选→首页消失→空间页已买同步（直连 IndexedDB 确认 `status:'completed'`）、测试6 刷新后数据保持；附：周期蓝框/粉格/历史入口、憨憨三入口等宽。连同既有回归（interact3 23 / clashcheck 21 / skincheck 27 / tabcheck 10 / settingscheck 13）共 **112 项全绿**。

> **测试脚本踩坑**：keepalive 的 TabContent 把四个 Tab 页都留在 DOM（只是 `display:none`），`querySelectorAll('button')` 会抓到隐藏层的按钮（例如 `clickBtn('记')` 误点到隐藏的「我的日记」）。所有点击/查找必须过滤 `offsetParent !== null`。另：断言"勾选后消失"要等 Toast（1.8s）消失再查 body 文本，否则会被「已买：湿厕纸」误命中。JS 模板字符串里正则的 `\s` 会被吞成 `s`（未知转义丢弃反斜杠），断言颜色改用 `includes('249, 168, 199')` 这类字面量最稳。

---

## 4. 目录结构

```
src/
├─ app/        App.tsx(壳/保活/转场/换肤effect) · useHashRoute.ts · styles/index.css
├─ components/ base/(Card,EmptyState,Toast,Sheet,fields,Confirm,ImagePicker,MediaImage)
│              nav/(TabBar[中央+],NavBar,PageHost,EmbeddedHeader) · icons/
│              base/ 另有 SkinBackdrop(全局飘浮装饰) · MotifMark(空态/卡片点缀)
├─ db/         types.ts · schema.ts · repos/(base.ts,index.ts)
├─ services/   media · backup · haptic · vault(加密) · weather(Open-Meteo) · sparkImage(Wikipedia)
├─ theme/      skins.ts(15套皮肤 5基础/5角色/5撞色 + applySkin) · motifs.tsx(装饰图形) · platformLogos.ts
├─ stores/     useAppStore · usePetStore · useRecordStore · useTodoStore · useDiaryStore
│              useMomentsStore · useSparkStore · useCycleStore · useShoppingStore
│              useSettingsStore · useOverlayStore · useVaultStore · useFinanceStore(仅备份兼容)
│              useCountdownStore
└─ pages/      home/ record/ space/ mine/ pet/ · diary/ moments/ spark/ journal/
               cycle/ todo/ shopping/ vault/ theme/ countdown/
```

> 已下线：`pages/finance/`（财富规划）。其数据表 `financeItems` 与 store 保留，仅为老备份文件导入不报错。

## 5. 运行（环境已验证）

```bash
npm install        # .npmrc 已指向 npmmirror（官方源在本环境被拦）
npm run dev        # dev 环境自动套 393×852 手机框，访问 http://localhost:5173
npm run build      # 已验证通过，产物 dist/（gzip JS ~89KB / CSS ~4KB）
```

验证结果：构建无报错无警告；dev server 返回 200、标题 `Titia 时序`。

**17. WebDAV 双向云同步（用户需求：多设备互相同步，桌面重装不丢数据）**

*背景*：数据此前全存各设备本地 IndexedDB，手机/网页各一份、互不可见；iOS 删除桌面 PWA 图标会清空该 App 存储 → "重发到桌面数据丢失"。用户选择 WebDAV 方案（免自建服务器）。

*实现（`src/services/webdav.ts`）*：
- **配置**存 localStorage（url / user / pass），支持坚果云等免费 WebDAV。
- **同步协议（双向收敛，非单向覆盖）**：启动时（App.tsx 水合后）或手动触发 `syncNow()`：① GET 云端 `titia-sync.json`；② dump 本地全表；③ **`mergePayloads` 按表按 id 逐行合并，`updatedAt` 较新者胜**（含软删行保留）；④ 合并结果 bulkPut 写本地 + PUT 回云端 → 两端最终一致。
- media 图片 blob↔base64 序列化（复用 backup.ts 的表名与转换逻辑）。
- MinePage 新增「云同步」卡片：Sheet 配置 WebDAV（地址/账号/应用密码）+ 保存并同步 + 立即同步 + 清除配置；同步状态展示。
- **自动同步**：App 启动自动拉取合并（配置了才触发，失败静默）。

*验证*：`/tmp/syncdav.mjs`（本地 mock WebDAV 服务器 `mockdav.mjs` 模拟 GET/PUT）**8 项全通过 / 0 失败**：配置保存、上传云端（含日记）、**云端加购物清单 → 桌面拉取出现（双向）**、**桌面标记已买 → 云端同步 completed（双向收敛）**、桌面日记合并后云端/本地均保留（不覆盖）。

> **用户须知**：WebDAV 服务需支持浏览器跨域（CORS）。坚果云 `https://dav.jianguoyun.com/dav/` 通常允许；若某服务 CORS 拦截，需换支持 CORS 的 WebDAV（如自建 nginx/NextCloud 配置 CORS）。

**17.5 Supabase 双向云同步（终版方案，替代 17 的 WebDAV）**

*演进*：WebDAV（坚果云 CORS 不稳、CF Worker 代理被 CF 出站拦截 520）→ 最终 **Supabase REST（自带 CORS）**。

*实现（`src/services/webdav.ts` 内，文件名为历史遗留）*：
- **配置**存 localStorage（url + anonKey），MinePage「云同步」Sheet 输入 **Supabase URL + Anon Public Key**（⚠️ 禁止 service_role secret key，浏览器会 401）。
- **写入**：`POST {table}?on_conflict=id` + `Prefer: resolution=merge-duplicates`（**必须复数**，单数会被当普通 INSERT 报 23505）。
- **RLS**：单用户场景直接关闭 RLS 或加 `allow_all` policy，anon key 即可读写。
- 同步协议与 17 相同：启动/手动 `syncNow()` → GET 全表 → `mergePayloads` 按 id + updatedAt 行级合并（较新者胜）→ 写本地 + upsert 回云端，两端收敛。
- `TABLE_NAMES` 含 `countdownEvents`，倒数日数据同样跨设备同步。

*验证*：`/tmp/supabasetest.mjs` mock Supabase **7/7 通过**（含双向合并、双向收敛、保留不覆盖）。

**18. 倒数日模块（小窝 🕰 入口 · 期待/足迹 · 公历农历）**

*需求*：小窝侧边导航新增倒数日；期待（未来）/足迹（已发生）两个页面；公历/农历；卡片 + 详情/编辑；数据持久化 + 云同步。

*实现*：
- `db/types.ts` +`CountdownEventEntity`（kind/title/relation/category/dateType/solarDate/lunarDate/avatar）；`schema.ts` +`countdownEvents: 'id, kind, category'`；**`version(2)` 声明同表**（老用户 Dexie 已是 v1，加进 v1 不触发建表，必须升 v2）；`repos/base.ts` +`countdownRepo`。
- `stores/useCountdownStore.ts`：CRUD + items 排序 + `bumpDataEpoch`。
- `pages/countdown/CountdownPage.tsx`：**期待/足迹 iOS 风格文字切换**（细横线 scaleX 动画）；期待卡片 = 剩余天数大字 + 分类/关系；足迹卡片 = 「已经 X 年 X 个月 X 天」；卡片右上角「删除」（`stopPropagation` 防触发编辑）+ `confirmSheet` 确认；新增/编辑 Sheet 表单。
- **农历自动换算**：引入 `lunar-javascript`（附 `src/types/lunar-javascript.d.ts` 声明）。`parseLunar` 把「八月十五/六月初三/腊月三十/正月」解析为 {month,day}（按「月」字切分，⚠️ 不能整体 replace 掉「月」，否则「八月十五」变「八十五」）；`expectedSolarDate` 从今年起找最近一次未过期的公历日期（今年已过自动取明年）→ 剩余天数真实可算；卡片显示「农历 八月十五 · 每年 · 下一次 YYYY-MM-DD」。
- **足迹强制公历**：已发生时间必须具体到公历日期，表单对 footprint 隐藏日期类型选择；历史农历足迹兜底显示「农历 X 开始」。
- **表单日期输入**：公历用 `DateInput`（原生 iOS 滚轮/安卓日历），农历用 `TextInput`（八月十五 自由文本）。
- 入口：SpacePage 左侧导航 +「🕰 倒数日」tab（5 个）；App.tsx `MODULE_TAB` +`'/countdown': 'space'` 支持独立路由。

*验证*：`/tmp/countdowncheck.mjs` **26/26 通过**（入口、切换、新增、剩余天数、刷新持久化、足迹年/月/天、农历换算 52 天精确、编辑、删除确认、无运行时错误）。

> **Dexie 教训**：给已上线的 v1 数据库加新表，光改 `version(1).stores` 没用（版本号不变不触发升级），必须 `version(2).stores({...})` 声明新表。

**18.5 倒数日二轮：农历日历选择器 + 每年自动顺延（用户反馈）**

*反馈*：① 期待日期"需要每年重新修改"——期望设置一次月日，自动算到下一年；② "还不支持农历日历选择和计算"。

*修复（`src/pages/countdown/CountdownPage.tsx`）*：
- **公历每年自动顺延**：`nextOccurrence()` 把已过期（含今天）的公历日期按"月日不变"逐年顺延到最近一次未来日期——生日/纪念日设一次，年年自动更新；卡片显示「🎂 2025.01.01 · 下一次 2027-01-01」（未过期不显示多余文案）。
- **农历日历选择器**：农历模式由自由文本输入改为**月/日两个下拉**（正月~腊月 × 初一~三十，`LUNAR_MONTHS`/`lunarDayName` 生成）；保存时组装「八月十五」存 `lunarDate`；编辑时用 `parseLunar` 回填选择器。换算仍走 lunar-javascript（今年已过自动取明年）。
- 期待列表排序改用换算后的下一次日期（农历/顺延事件不再 NaN 乱序）。
- 足迹仍强制公历（已发生时间必须具体日期）。

*验证*：`/tmp/countdowncheck3.mjs` **10/10 通过**（选择器、八月十五 52 天、过期 2025-01-01 顺延到 2027-01-01 精确 150 天、编辑回填、无错误）。

**19. 体重保存修复 + 灵光一闪备忘录 + 小窝宽度适配（用户反馈四连）**

*反馈*：① 憨憨体重记录不可保存；② 灵光一闪要备忘录且支持编辑；③ 小窝 4 个模块页右侧留 ~1cm 空位。

*修复*：
1. **体重保存 bug（`PetPage.tsx`）**：`WeightSection` 的 `onAdd` 误传了一个 `id:''` 的假记录对象 → `openHealthForm` 走**编辑分支** → `updateHealth('')` 空 id 静默失败。改为 `onAdd={() => openHealthForm(null)}`；空态「记一笔」由 span 改 button 可点击。保存后**可视列表**（日期 + 数值 + 趋势折线 + 删除）一直存在，只是此前根本存不进去。
2. **灵光一闪备忘录（`SparkPage.tsx`）**：分类加「📝 备忘录」；该分类下输入框变多行 textarea（无联网配图）；备忘录卡片**跨整行**（col-span-2）+ 保留换行（whitespace-pre-wrap）+ 时间戳；点击卡片打开 Sheet **编辑**（内容 + 分类），保存走 `useSparkStore.update`；普通灵光卡片点击仍是完成标记，不受影响。
3. **小窝宽度适配（`PullToRefresh.tsx`）**：根因是外层 div 只有 `relative h-full`、缺 `flex-1 min-w-0`——在空间页 flex 行布局中该容器宽度由**内容 max-content** 决定，短内容（空态/短标题）时右侧留空 ~1cm+。改为 `relative h-full min-w-0 flex-1`（PageHost 场景 flex-col 块级自动撑满，不受影响）。修复后 4 个模块页滚动容器 68→393 占满、内容区占满、无横向溢出。

*验证*：`/tmp/mixcheck.mjs`（393 真机视口，Emulation.setDeviceMetricsOverride——headless 窗口最小宽 500 不能代表真机）**27/27 通过**：体重保存+趋势+持久化、备忘录新增/多行/跨行/编辑、普通灵光完成标记不受影响、4 页宽度占满、无运行时错误。

**19.5 倒数日列表不能滚动（用户反馈）**

*反馈*：倒数日**足迹**列表不能上下滑动；期待一并检查。

*复现*：种 12 条足迹 + 8 条期待后触摸滑动，scrollTop 恒为 0。实测滚动容器 `scrollH(1271) === clientH(1271)`——**容器被内容撑到和内容一样高，没有可滚空间**。

*根因（`PullToRefresh.tsx`）*：外层 div 是普通块级（`relative h-full min-w-0 flex-1`），**不是 flex 容器**；空间页通过 `scrollRef` 传入的滚动容器 className 里的 `flex-1` 在非 flex 父级下无效，高度 auto = 内容高度。期待/足迹同样受影响（其他嵌入模块页同理）。

*修复*：外层 div 改为 `relative flex h-full min-w-0 flex-1 flex-col`——滚动子项 `flex-1` 生效，高度被约束在视口内。内部自建容器（PageHost 默认场景）不受影响；下拉刷新逻辑未动。

*验证*：`/tmp/scrollcheck2.mjs` **7/7 通过**（足迹/期待上滑 0→385、下滑回顶、下拉刷新指示器仍触发、无错误）；回归 ptrcheck 3/0、mixcheck 27/0、navcheck 17/0、interact3 23/0、tabcheck 10/0、countdowncheck3 10/0、skincheck 27/0、settingscheck 13/0。**线上实测 7/7 通过**。

**19.6 倒数日三轮：吸顶导航 + 期待筛选 + 农历年份（用户反馈）**

*反馈*：① 顶部导航栏要固定，列表滚动时一直显示在头部；② 期待加筛选项（生日/纪念日/其他）；③ 农历只能选月份日期、不能选年份。

*实现（`src/pages/countdown/CountdownPage.tsx` + `db/types.ts`）*：
1. **吸顶头部**：标题栏 + 期待/足迹切换（+筛选 chips）包进 `sticky top-0 z-20 bg-bg px-4 pb-4` 容器，列表滚动时头部常驻（非 embedded 时 NavBar 本就在 PageHost 外固定，仅 tab 区吸顶）。
2. **期待筛选**：`CountdownEventEntity` +`eventType?: 'birthday' | 'anniversary' | 'other'`（表单「类型」ChipSelect，仅期待显示）；期待 tab 头部加筛选 chips（全部/🎂生日/💍纪念日/✨其他），按 `(eventType ?? 'other')` 过滤，空态文案区分「该类型下还没有期待」；足迹 tab 不显示筛选；卡片分类行显示类型标签。
3. **农历年份**：农历选择器由 2 个下拉变 **3 个**（年份「每年/今年~+10」+ 月 + 日），存储 `lunarYear`（0/空 = 每年自动顺延）；`expectedSolarDate` 有年份时从该年起找最近未来（已过顺延次年），卡片显示「农历 八月十五 · 2028 年起 · 下一次 …」。

*验证*：`/tmp/countdowncheck4.mjs` **14/14 通过**（年份/月/日 3 下拉、2028 中秋 791 天精确换算、卡片「2028 年起」、三种筛选互斥正确、足迹无筛选、滚动 scrollTop 435 后标题 20px 原位 + chips 固定可见）；countdowncheck3 更新农历索引后 10/10；全量回归（mixcheck 27 / ptrcheck 3 / navcheck 17 / interact3 23 / tabcheck 10 / skincheck 27 / settingscheck 13 / clashcheck 21 / scrollcheck2 7）全绿。

**20. 自动记账一期（方案 PDF → 落地，核心：分类/账户可自定义）**

*方案*：用户上传《自动记账PWA功能方案 v1.0》（四表 Dexie / 规则引擎 + AI 兜底 / 快捷入口），重点要求「账单分类等账户信息都需要可以自定义」。按方案建议节奏先做**纯本地规则版**（阶段 ①②），AI 层与快捷入口留二期。

*实现*：
1. **四表**（`db/types.ts` + `schema.ts` version(3) 老用户建表 + repos）：
   - `transactions`（amount 存**分**，>0 支出 / <0 收入，merchant/category/account/time/note/source）
   - `rules`（keyword→merchant/category/account 映射 + priority + hitCount）
   - `accounts` / `categories`（**完全可自定义**，首次进入预置 8 类 3 账户）
2. **store**：`useBookStore`（交易 + 规则 + `matchRuleByKeyword` 关键词包含匹配 + `learn` 学习闭环）、`useAccountStore`、`useCategoryStore`。
3. **记账页**（`pages/book/BookPage.tsx`，小窝 🧾 入口 + `/book` 路由）：
   - 本月支出概览卡 + 交易列表（时间倒序，支出红色 -¥ / 收入 accent +¥，分类 emoji + 账户 + 时间，删除确认）
   - **记一笔 Sheet**：收支切换 / 金额 / 交易对象 / 分类下拉（自定义）/ 账户下拉（自定义）/ datetime-local / 备注
   - **规则识别**：输入交易对象即时匹配 rules → 自动预填分类/账户（toast「已识别」）；**保存未命中自动沉淀规则**（下次直通，越用越准）
   - **分类管理 / 账户管理**：页内视图（返回记账 + 新增 + 列表编辑/删除），新增/编辑走 Sheet 表单——分类（名称/图标 emoji/默认账户）、账户（名称/类型/余额）
4. **云同步**：`TABLE_NAMES` 加入四表。

*踩坑*：① 预置数据 bulkPut **缺 id 主键** → Dexie DataError 被 async 吞掉，预置静默失败；② 三个 store 加载绑在一个 useEffect → 一个完成触发 effect 重跑 → 未完成的被重复 load → 预置**双写**（17 条）；修复 = 预置补 id + 独立 useEffect + `loadInflight` 防并发守卫；③ open 替换式 Sheet 导致「新增分类后管理列表消失」→ 改**页内视图切换**（PetPage 模式）。

*验证*：`/tmp/bookcheck.mjs` **22/22 通过**（入口、预置、记支出/收入、规则学习沉淀、二次输入自动预填、自定义分类/账户增删、持久化刷新、编辑回填、无错误）；全量回归 12 组全绿（mixcheck 27 / countdowncheck3/4 / scrollcheck2 / ptrcheck / navcheck / interact3 / tabcheck / skincheck / settingscheck / clashcheck）。

**20.1 记账二期：AI 识别层（方案阶段③，规则未命中兜底）**

*实现*：
1. **Serverless 代理**（`cloudflare-worker/ai-proxy.js`）：Cloudflare Worker，转发至 DeepSeek（deepseek-chat，`response_format: json_object` 强制 JSON）；**API Key 只存 Worker 环境变量 `DEEPSEEK_API_KEY`**；校验层（金额正则、分类枚举白名单、字段清洗）；每 IP 每分钟 30 次限流；CORS 全开。
2. **前端封装**（`src/services/ai.ts`）：`aiRecognize(text)` —— localStorage 存代理地址（`titia.aiProxyUrl`）；未配置 / 超时 8s / 非 2xx / JSON 异常 / 金额非法 → **一律返回 null 静默降级**，核心记账流程不阻塞。
3. **接入**：BookPage 记一笔表单交易对象行加「🤖 AI 识别」按钮（规则未命中时点按；识别结果回填金额/分类/账户/时间/备注 + toast 提示）；MinePage 设置区新增「AI 识别」卡（配置代理地址，可随时关闭）。

*说明*：headless CDP 对 React 受控 input 的模拟输入有 restore 竞态（部分输入框 value 被 React 重置），属测试环境怪癖；真机键盘输入（isTrusted 事件）不受影响。测试配置步骤直接写 localStorage 验证识别链路。

*验证*：`/tmp/aicheck.mjs` **8/8 通过**（AI 卡、识别按钮、mock 代理识别回填 2.68/餐饮/支付宝、识别后保存、代理 500 时金额不被污染静默降级、无错误）；回归 bookcheck 22 / mixcheck 27 / ptrcheck 3 / navcheck 17 / interact3 23 / tabcheck 10 / skincheck 27 全绿。

**23.2 备份完整性修复 + 「从链接导入」功能（用户数据迁移）**

*背景*：用户旧桌面图标不更新，导出备份后换新图标，但新图标无数据；手机上不便保存/选择 JSON 文件，询问如何迁移。

*发现*：① `backup.ts` 的 `TABLE_NAMES` **漏了 6 张新表**（countdownEvents/transactions/rules/accounts/categories/budgets）——**旧版导出的备份根本没有倒数日与小账数据**；② 导入刷新 store 也未覆盖小账/倒数日。

*修复*：
1. `backup.ts` TABLE_NAMES 补全 6 表；`applyBackupData` 抽出共用写入逻辑，导入后刷新**全部 store**（含小账五表）。
2. **「从链接导入」功能**（`importFromUrl` + MinePage 数据管理新按钮）：把备份文件放到任意 HTTPS 链接（网盘直链 / Gist raw / WebDAV 空间），填 URL 一键拉取导入；支持 `.gz` gzip（`DecompressionStream`）与纯 JSON——**彻底绕开手机上保存/选择文件的痛点**。

*验证*：`/tmp/importcheck.mjs` 用真实用户备份（3.6MB）走 URL 导入 → records 11 / pets 1 / todos 2 与备份一致；bookcheck3 17/17、settingscheck 13/13。


## 6. 下一步建议

1. ~~阶段六 PWA 部署~~ / ~~补齐记录类模块~~ / ~~财富·周期·密码箱~~ / **倒数日（核心+滚动+吸顶+筛选+农历年份）** / **体重保存修复** / **备忘录+编辑** / **小窝宽度适配** / **自动记账一期（规则+分类账户自定义）** / **记账二期（AI 识别层）** / **query 排序修复 + 天气缓存 + e2e 入库** → **均已完成**。
2. **记账三期（按方案 §6 待办）**：Web Share Target 分享记账（manifest share_target）、带参 URL 快捷入口（iOS 快捷指令/辅助触控）、AI 识别结果确认卡 + 金额大额强制确认。
3. **倒数日第四阶段（可选）**：期待卡片加「距离下一次还有 X 天」圆环进度条；足迹支持农历（需选年份换算，当前强制公历）；事件类型筛选加计数角标。
4. **自动化验收**：**已收进仓库 `scripts/e2e/`**（15 个脚本 + `run-all.sh` + `npm run e2e` / `npm run e2e:live`），套件 **14 组全绿**；共 222 项断言（bookcheck 22 / mixcheck 27 / countdowncheck4 14 / countdowncheck3 10 / scrollcheck2 7 / aicheck 8 / interact3 23 / skincheck 27 / clashcheck 21 / settingscheck 13 / navcheck 17 / tabcheck 10 / ptrcheck 3 / countdowncheck v2 26）+ `contrast.mjs` 静态审计。
5. **孤儿 media 与体积**：`purgeOrphanMedia()` 目前只在关 Sheet / 导入后触发，建议加一次「设置 → 清理缓存」手动入口。
6. **皮肤扩展**：新增皮肤只需往 `theme/skins.ts` 的 `SKINS` 加一项（13 个 token × 明暗两套 + `group`），无需碰任何页面；加完记得跑一遍 `contrast.mjs`。
7. 把 `TITIA_接手手册.md` 作为团队入口，持续更新进度。

> 安全提醒：交接对话中曾出现明文 PAT，请到 GitHub 吊销并重新生成。

**21. 工程收尾：query 排序修复 + 天气缓存 + e2e 入库（REBUILD.md 待办落地）**

*① `Repository.query()` 陷阱修复（`db/repos/base.ts`）*：旧实现 `.reverse()` 按随机 UUID 主键倒序 = 随机序，且默认 limit 100 会悄悄截断 >100 条数据。改为 **`sortBy('createdAt')` 升序 + 默认全量**（limit=0），各 store 仍自行二次排序（结果不变）。全量回归 12 组无破坏。

*② 天气 10 分钟缓存（`services/weather.ts`）*：`getWeather()` 结果存 `sessionStorage`（key `titia.weatherCache`，10 分钟 TTL），每次进首页不再重复请求 Open-Meteo。

*③ E2E 入库（`scripts/e2e/`）*：15 个 CDP 脚本 + `run-all.sh`（清理 cdp 残留目录 + 顺序执行 + 汇总）+ `package.json` 的 `e2e` / `e2e:live` 命令。`npm run e2e` **14 组全绿**（222 项断言）。

*幂等关键坑*：清库脚本（bookcheck/mixcheck）清 IndexedDB 后必须 `location.reload()`——**外部清库不会更新 zustand state**，直接测空态/持久化会读到上一轮数据残留（第二次运行必挂）。已加轮询清空 + reload 使脚本可重复运行。

**22. 小账升级改造（用户指令 docx → 落地：记账迁为底部一级导航「小账」）**

*指令*：《小账模块升级改造指令.docx》——把「小窝」里的记账模块迁移为**底部一级导航「小账」**（个人财富管理中心），原「+」改全局悬浮羽毛笔（灵光一闪），按三阶段（一期入口/结构/记账/分类/账户/持久化 → 二期图表/资产/导入导出 → 三期 OCR/智能分类）。

*实现*：
1. **底部导航**（`TabBar.tsx` + `App.tsx`）：5 Tab = 今日/小窝/**小账**/时光/我呀，小账替换原「+」位置、与其他 tab **统一样式**（不放大不突出，新增 `BookIcon` 钱包账本图标）；`/book` 从模块路由改一级 tab 路由。
2. **悬浮羽毛笔**：原「+」的灵光一闪改为全局右下角悬浮按钮（`FeatherIcon`），非模块页显示，保留 `/spark` 页与全部数据/保存逻辑。
3. **小窝**：删除侧边「记账」tab（剩倒数日/购物/周期/憨憨/密码）。
4. **小账页**（`BookPage.tsx` 重构，参考小窝设计逻辑）：
   - **左侧一级导航**：账单 / 资产 / 分析 / 分类 / 导入导出
   - **账单二级横向分栏**：全部 / 支出 / 收入 / 转账（细横线非胶囊）；账单字段金额/类型/分类/账户/商户/时间/备注/来源；**转账**（转出→转入账户）新增 `txType` / `transferTo` 字段，列表显示「⇄ 转出 → 转入」；规则识别 + AI 识别保留（识别后沉淀规则）
   - **资产**：总资产（Σ账户余额）+ 账户列表（余额可编辑，`AccountForm` 输入元→存分）+ 近 6 月净流入趋势折线（SVG）
   - **分析**：本月收支三卡 + 近 6 月消费趋势柱状图 + 分类占比环形图 + 月度报告（笔数/日均/最大单笔/支出最多分类）
   - **分类两级**：`categories` + `parent` 字段（一级/二级）；支持新增/编辑/删除（删一级连带二级）
   - **导入导出**：CSV 导出（金额(分)/类型/分类/账户/商户/时间/备注，Excel 可开）+ CSV 导入（解析回填）
5. **数据层**：全部走 Dexie 四表，无临时 state；`TABLE_NAMES` 云同步已含四表。

*踩坑*：① 余额双重换算——`AccountForm` 输入元 ×100 转分后，`openAccForm` 又把"分"当"元"再 ×100（1000 元存成 10000000 分）；修复 = 外层直接取整不再换算；② headless 测试对 Sheet 内同名按钮（分栏"收入/转账" vs 表单 ChipSelect）需取 DOM 最后匹配（overlay 渲染在后），转账双 select 需按索引设置。

*验证*：`/tmp/bookcheck2.mjs` **30/30 通过**（5 tab 统一样式、羽毛笔→灵光一闪、小窝无记账、左侧一级导航、账单分栏、支出/收入/转账记账+过滤、资产余额编辑、分析四卡、分类两级、CSV 导入、持久化刷新）；tabcheck 更新为 5 tab 断言 11/11；`npm run e2e` **14 组全绿**。

*验证*：`npm run e2e` **14/14 组通过**；bookcheck/mixcheck 连续两次运行 22/22、27/0（幂等验证）。

**22.1 小账二期：分类体系 + 账户资产/负债 + 预算/首页 + 可拖动羽毛笔（三份设计文档落地）**

*文档*：《小账交易分类体系规划》《小账账户体系设计》《小账预算自动记账首页设计补充规范》；补充要求：羽毛笔可拖动、不被导航栏遮挡。

*实现*：
1. **羽毛笔可拖动**（`App.tsx` FloatingFeather）：pointer 事件拖动 + clamp 视口内 + localStorage 记忆位置（`titia.fabPos`）；初始位置抬高避开底部导航；拖动 >6px 判为拖动（存位置），否则点击进灵光一闪；onClick 兜底（程序化/键盘点击）。
2. **分类体系**（`useCategoryStore`）：预置替换为文档 **12 个一级 + ~70 个二级**（收入/餐饮/购物/住房生活/交通出行/宠物/医疗健康/娱乐休闲/学习成长/人情关系/金融转账/其他）；**旧体系（8 个一级无 parent）自动识别并软删重建**。
3. **账户体系**（`AccountEntity` +`kind/bankName/cardTail/creditLimit`）：资产账户/负债账户两大类；AccountForm 加「资产/负债」选择 + 类型（现金账户/银行卡/电子钱包/储蓄/信用卡）+ 银行卡/信用卡扩展字段；**净资产 = 资产总额 − 负债欠款**；资产页显示净资产卡 + 资产/负债分组列表。
4. **预算**（`budgets` 表，Dexie v4 + `useBudgetStore`）：绑定一级分类月预算；预算管理 Sheet（设置/进度条/80% 较高提醒/100% 超支提示/删除）；统计 = 本月该一级下所有二级叶子支出（`topOf` 找顶级父）。
5. **小账首页**（默认视图）：左侧导航加「首页」（6 项）；首页 = **财富概览卡**（净资产/资产/负债，点进资产）+ **本月收支卡**（收入/支出/结余，点进分析）+ **预算进度卡**（最多 3 项，超 3 提示更多，点进预算管理）；首页不放完整列表（详细数据进二级页面）。
6. **系统默认规则库**（`useBookStore`）：预置商户规则（瑞幸/星巴克/Manner→咖啡、美团外卖/饿了么→外卖、滴滴/高德→打车、淘宝/京东/天猫→购物、亚马逊→亚马逊收入），priority 0（用户学习规则 priority 1 优先）。

*踩坑*：① 预算管理 Sheet 内用了 useState（hook 在普通函数）→ 提取 `BudgetSheetContent` 组件；② 羽毛笔程序化 `el.click()` 不触发 pointer 事件 → onClick 兜底 + movedRef 抑制拖动后误触；③ 默认视图改首页后 bookcheck2/aicheck 需先进「账单」视图。

*验证*：`/tmp/bookcheck3.mjs` **17/17 通过**（首页三卡、分类体系、净资产、预算设置+进度、默认规则瑞幸→咖啡、羽毛笔拖动+持久化）；bookcheck2 30/30（适配首页默认视图）；aicheck 8/8；`npm run e2e` **15 组全绿**。

**23. 刷新修复 + 预算 Bug + 我呀 UI + 倒数日时间轴（三份需求文档 + 用户反馈）**

*反馈*：① 小账和时光页面没有下拉刷新；② 刷新"使用了但没真正刷新"（网页版改动不能在 app 内刷新同步）；③ 点「本月预算」布局破坏、内容覆盖首页；另附《我呀页面 UI 优化》《倒数日时间轴功能优化》《小账预算功能 Bug 排查修复》三份文档。

*修复/实现*：
1. **刷新修复**（`services/reload.ts` + `BookPage` + `JournalPage`）：`reloadAll()` **补上 useCountdownStore / useBookStore / useAccountStore / useCategoryStore / useBudgetStore**（此前缺失 → 小账/倒数日下拉刷新不重载数据）；小账右侧内容区与时光页右侧内容区包 `PullToRefresh`（scrollRef + reloadAll），两页恢复下拉刷新。
2. **预算 Bug（关键）**：`openBudgetSheet` 在提取 `BudgetSheetContent` 组件时**丢了 `<Sheet>` 外壳**——裸组件直接渲染进页面（无 fixed 遮罩面板），首页与预算内容并存、布局被破坏。修复 = 补回 `<Sheet title="预算管理">` 外壳。复现（panel:null/mask:false）与修复后（panel + mask 正常）均验证。
3. **我呀 UI 优化**（`MinePage.tsx`，仅视觉不改逻辑）：顶部品牌卡改**三行文字层级**（Titia 时序 → 让时间留下痕迹 → 日期独立第三行小字号低透明度，间距分明）、Banner 高度 152→118 紧凑、卡片间距收紧、底部新增**版本信息**（Titia 时序 · Version 1.0 · 让时间留下痕迹，低透明度）；主题中心/数据管理/AI 识别/云同步/应用设置内容完全不动。
4. **倒数日时间轴**（`CountdownPage.tsx`）：新增第三分类「时间轴」（细横线切换）；**12 个月份卡片墙**（有事件月份显示小圆点，默认当年 + ‹ › 切年）；点月份进**月历**（星期排头 + 日期网格，事件日期小圆点）；**同天多事件优先级**（足迹 > 纪念日 > 生日 > 其他）；点带标记日期弹**毛玻璃事件卡**（backdrop-blur、圆角 28px、从底部升起、点外/下滑关闭）；事件读取现有数据（期待每年重复换算当年、农历用 lunar-javascript 换算、足迹取具体日期），无需重新添加。

*踩坑*：① 预算 Sheet 提取组件时外壳丢失（回归时用 panel/mask 断言兜住）；② 时间轴弹窗 state 已设但**组件未渲染**（`setPopup` 后漏挂 `<TLEventPopup>`）；③ 测试圆点断言需查 innerHTML（圆点 span 无文本）；④ 期待事件每年重复——切年份后"无事件"断言必须改用**足迹（一次性）**验证。

*验证*：`/tmp/countdowncheck5.mjs` **16/16 通过**（时间轴 tab、月份墙圆点、农历换算、月历、日期圆点、毛玻璃弹窗、优先级、年份切换+足迹不重复）；预算 Bug 复现/修复对比（panel/mask）；bookcheck2/3、countdowncheck3/4、ptrcheck 全绿；`npm run e2e` **16 组全绿**。
**23.1 PWA 更新修复（桌面快捷方式不同步网页版）**

*问题*：桌面快捷方式（PWA 独立窗口）打开后一直是旧版，不同步网页端升级。

*根因*：① 线上 `sw.js` 无 `Cache-Control` 头 → 浏览器启发式缓存（基于 last-modified）挡住 SW 更新检查 → 打开时根本不检查新版本；② 前端无 SW 更新监听 → 即使有新版本页面也不刷新（仍加载旧预缓存资源）。

*修复*（`vite.config.ts` + `main.tsx`）：
1. `injectRegister: null` 关闭自动注入，改为 **main.tsx 手动注册**；
2. `navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none', scope: '/' })` —— **SW 更新检查绕过 HTTP 缓存**（标准做法，解决启发式缓存挡住检查）；
3. `controllerchange` 监听 + 自动 `location.reload()`（防循环标志）—— 新 SW 激活接管时**自动刷新一次**，立即加载新版预缓存资源。

*效果*：以后每次发布，用户打开桌面快捷方式 → SW 检查（绕过缓存）→ 发现新版 → 自动更新 → 自动刷新 → 新版立即可用。

*验证*：线上 SW 注册 `updateViaCache='none'` + 更新检查可触发 5/5；发布 Version 1.1 后全新打开**直接加载新版**（自动更新链路打通）。

---

## Version 1.2（全局回归修复批）

> 发布地址不变：`https://a149a628a3c099573.sh7.agentos-app.net`（verified，线上冒烟 10/10 通过）。

本轮（用户需求：恢复我呀 Banner + 预算与分类选择优化 + 全局回归排查）：

| 项 | 落地 |
|----|------|
| 我呀 Banner 恢复 | `MinePage.tsx` 恢复 152px Banner（cut-4 玉桂狗插画）+ 三行文字（主标题/副标题/日期） |
| 羽毛笔层级与遮挡 | `App.tsx` FloatingFeather `z-[60]` > TabBar `z-30`；默认 y 上移到导航上方；可拖动 + `titia.fabPos` 持久化 |
| 记账后资产余额同步 | `useBookStore.ts` `applyBalance(tx, sign)` 挂到 add/update/remove（重放/回滚；转账双向）；支出减余额、收入加余额 |
| 时间轴弹窗完整信息 | `CountdownPage.tsx` 弹窗补「人物（relation）」「类型」「日期」完整字段 |
| 首页预算最多 6 行 | 首页预算卡 ≤6 行 + 「查看全部预算 ›」进入独立预算管理页（`BudgetList`/`BudgetEditForm`，可删除/改金额） |
| 分类选择面板 | 记一笔表单分类改为**独立面板**（一级 3 列网格 → 二级列表），替代原 `<select>`；`catDisplay()` 显示「🍜 餐饮 / 咖啡」 |

**回归与发布**：
- `bookcheck3.mjs` 预算/分类断言更新为面板式交互（卡片 → 预算管理页 → `+ 新增预算` sheet；分类面板点选人情关系→朋友聚餐；瑞幸→咖啡 改为断言分类按钮文本）；
- 新增 `bookcheck4.mjs` 入仓并注册进 `run-all.sh`（Banner 152 / 羽毛笔 z 与位置 / 资产 1000→800→1300 / 分类面板 / 预算 6 行+管理页 / 时间轴弹窗人物）；
- `aicheck.mjs` AI 回填分类断言改为面板按钮文本（`🍜 餐饮▾`）；
- **`npm run e2e` 全量 17 组全绿**；`tsc --noEmit` 零错误；构建通过；
- 已发布 Version 1.2 并线上验证（新 JS 指纹 + Version 1.2 + SW 接管 + 无运行时错误）。

### 发布后追加修复：Banner 高度被 flex 压成 0

> 复盘发现"恢复 Banner"此前并未真正生效：`MinePage` 页面滚动容器是 `flex h-full flex-col`，Banner 内联 `height:152px` 在 flex 布局中被压缩为 **0 高度**（内容全为 absolute 定位、固有高度 0 → `min-height:auto`=0 + flex-shrink 生效）；旧测试断言误匹配 852 容器（`h>=148` 太宽松）掩盖了问题。

- **修复**：Banner div 增加 `shrink-0`（`flex-shrink:0`），实测 `getBoundingClientRect().height` 恢复 152；
- **测试收紧**：`bookcheck4` Banner 断言改为匹配含 cut-4 插画且高度 ≤200 的容器、断言 `h>=148 && h<=200`——避免再被大容器误匹配；另补「羽毛笔轻触（tap）→ 打开灵光一闪」断言（`#/spark`）；
- 排查全仓：仅 Banner 一处使用内联固定高度 + absolute 内容，无同类隐患；
- 重新构建、`npm run e2e` 仍 17/17 全绿、重新发布同链接，**线上冒烟实测 Banner 高度 = 152**。





---

## Version 1.3（全局滚动与交互优化批）

> 发布地址不变：`https://a149a628a3c099573.sh7.agentos-app.net`（verified，线上冒烟 8/8 通过）。

本轮（用户需求文档：全局滚动 / 小账分类选择 / 我呀滚动结构 三项交互优化；禁止改数据结构与功能逻辑）：

### 一、全局禁止横向滚动
- `index.css`：`html, body, #root { overflow-x: hidden }` 全局兜底；
- 所有页面级纵向滚动容器统一 `overflow-x-hidden` + `touch-pan-y`：PageHost 默认内容区、PullToRefresh 滚动容器、Sheet 面板、小窝/时光/小账 左栏导航与右栏内容；
- 横向 chip 行（记录/憨憨/日记/时光/倒数日 的筛选胶囊）保留横向滑动：加 `touch-manipulation` 覆盖祖先 pan-y（允许双向 pan）；
- **关键修复**：`PullToRefresh` 外层加 `min-h-0`——flex 子项默认 `min-height:auto`（=内容高度）会顶住 `flex-grow` 收缩，导致滚动容器高度=内容高度、页面永不滚动（此前 PageHost 场景的潜在隐患，本次在"我呀 Banner 固定区 + 滚动区"布局中暴露）；修复后滚动容器正确约束在剩余空间，内容可滚动。

### 二、小账「记一笔」分类选择（内联两级展开）
- 原"切换视图"（一级网格 → 二级列表 + 返回按钮）改为**内联展开**：一级分类 3 列网格保持，点击一级（如 🍜 餐饮）在**其下方**展开该分类的二级列表（手风琴：再点收起/切换），不跳转、保持面板；
- 面板标题固定「选择分类」；点二级（如 午餐）→ 保存分类 + 自动关闭面板 + 返回记账表单，显示「🍜 餐饮 / 午餐」；
- 保持一级→二级逻辑与全部原分类数据；未增加最近使用/推荐。

### 三、「我呀」页面滚动结构
- 页面拆分为**固定 Header Banner**（shrink-0：Titia 时序品牌卡/副标题/日期/玉桂狗插画，滚动时保持不动）+ **Scroll Container**（主题中心/数据管理/云同步/AI 识别/应用设置/版本信息，上下滚动、禁止横向）。

### 验证
- 新增 e2e 套件 `scrollfix.mjs`（已注册 run-all.sh）：滚动容器 overflow-x hidden + touch-action pan-y、无横向溢出、横向 touch 滑动 scrollLeft=0、Banner 滚动固定（16→16）、设置区可滚动、各 Tab 页容器一致；
- `bookcheck4` 分类面板断言更新（「选择分类」标题 + 内联展开断言）；
- **`npm run e2e` 全量 18 组全绿**；`tsc --noEmit` 零错误；构建通过；
- 已发布 Version 1.3 并线上冒烟 8/8（Banner 固定、overflow/pan-y、分类面板内联展开、选择显示「餐饮 / 咖啡」、SW 接管）。

### Version 1.3 追加优化：二级分类横向网格（内联横向两级展开）
> 用户反馈竖列二级占用纵向空间大、需上下滑动，不符合快速记账场景。

- 二级分类由竖列列表改为 **3 列横向网格（自动换行）**：展开在对应一级分类下方，与一级网格同宽；点击区域加大（`py-2.5` 居中按钮），长分类自动换行、面板内滚动上限 `max-h-72`，不出现长列表滚动；
- 交互保持：点一级展开/再点切换（手风琴），点其他一级切换展开内容；点二级保存分类 + 关闭面板 + 返回表单显示「🍜 餐饮 / 午餐」；
- `bookcheck4` 新增断言「二级横向排列（grid 3 列）」；**`npm run e2e` 18 组全绿**；线上冒烟 5/5（一级 3 列 / 二级横向网格 3 列 / 切换购物二级 / 选择显示「餐饮 / 午餐」）。

### Version 1.3 追加优化：二级分类横向自适应布局（最终版）
> 用户反馈：二级虽已横向展开，但固定 3 列网格挤压长文字、truncate 截断中文（"收基/收提"），不符合要求。

- 二级容器改为 **flex-wrap 横向自适应**：按钮 `min-width:70px` + 按文字自动撑开 + `whitespace-nowrap`（禁止换行/拆分，中文完整显示，如「亚马逊收入」按钮宽 99px 全文不截断）；
- 去掉首字图标（不再显示"收"字小圆点类前缀），按钮纯文字；
- 样式：圆角 16px（`rounded-btn`）、内间距 12px（`px-3 py-2`）、字号 15px；**选中**蓝底白字（`bg-blue-500 text-white`）、**未选**浅蓝底深色字（`bg-blue-500/15 text-ink`，深浅模式自适应）；
- 区域最大高度 `92px`（约两行按钮），超过后内部滚动；一级 3 列网格布局与交互（点击展开/切换/点二级保存关闭）保持不变；
- `bookcheck4` 断言更新为「flex-wrap + min-width 70px + nowrap + 纯文本」；**`npm run e2e` 18 组全绿**；线上冒烟 4/4（自适应/长文字完整/切换餐饮/选择显示「餐饮 / 咖啡」）。

### Version 1.3 追加修复：记一笔分类选择交互（严格限定范围）
> 用户修复指令：仅修「记一笔」分类选择交互（面板 UI / 展开交互 / 弹窗层级），禁改数据结构、保存逻辑、分类数据、其他页面布局、全局组件样式、导航结构。

- **布局**：一级 3 列网格按行渲染（每行 3 个）；点击一级后**在其所在行下方插入全宽二级分类区块**（浅底圆角卡片，不改变一级布局、不跳转、保持面板）；其他行的一级网格不动；
- **二级按钮**：`min-width:80px` + 左右 `padding:16px` + `whitespace-nowrap`（禁止换行/中文拆分，长分类如「家庭聚餐」「亚马逊收入」完整显示）+ 横向 flex-wrap 自动换行；选中蓝底白字 / 未选浅蓝底深色字；区域最多两行（92px）超出内部滚动；
- **切换逻辑**：手风琴——点其他一级关闭当前、展开新的（同时只展开一个）；
- **羽毛笔遮挡修复**：弹窗（记一笔/分类面板/设置等所有 Sheet/overlay）打开时**隐藏悬浮羽毛笔**（App 层 `!overlay` 条件渲染），关闭后恢复——解决羽毛笔 z-60 盖住弹窗 z-50 的问题；仅改 App 一处渲染条件，未动 Sheet/全局组件；
- `bookcheck4` 断言更新（80px/padding16/弹窗隐藏+恢复/全宽区块）；**`npm run e2e` 18 组全绿**；线上冒烟 9/9（弹窗隐藏羽毛笔/一级 3 列/全宽二级区块/80px 不拆分/切换只展开一个/选择显示/关闭恢复）。

---

## Version 1.4（自动记账 · 一键拾光）

> 发布地址不变：`https://a149a628a3c099573.sh7.agentos-app.net`（verified，线上冒烟 8/8 通过）。
> 严格遵循开发限制：**不改变小账左侧导航**（仍为 首页/账单/资产/分析/分类/导入导出）、不新增一级导航、不改首页/账单/资产/分类模块结构、不创建第二套账单系统——一键拾光是"小账内部辅助记账能力"。

### 自动记账设置入口
- 小账首页右上角新增 ⚙️ 设置入口（`aria-label="自动记账设置"`，位于 "+ 记一笔" 旁）→ 打开「自动记账」设置 Sheet；
- 内容：📸 一键拾光 卡片（说明：截图支付凭证自动识别生成账单 +「设置快捷方式」按钮，含 iOS 快捷方式三步配置说明与可复制的快捷方式链接）+ 自动记账定位说明（辅助能力、复用现有体系、未来扩展列表）。

### 一键拾光（shortcut 识别预览）
- 路由 `#/capture?text=…&amount=…&account=…`（iOS 快捷方式「截屏 → 提取文本 → 打开 URL」调起；`MODULE_TAB` 注册但不新增导航项）；
- 识别：text 走**现有规则库**（瑞幸/星巴克→咖啡、滴滴→打车、猫粮→猫粮…，新增猫粮/美团买菜规则）→ 自动分类；账户包含匹配（快捷方式传"微信支付"→ 命中"微信"账户）；金额从 query 或文本正则提取；
- **预览严格只显示轻量确认**：Titia 识别完成 / 类型：支出 / 分类 / 账户 / [完成]——**不展示金额、商户详情、备注**（e2e 断言无 "18.5"、无商户字样）；
- [完成] → 保存账单（`source:'shortcut'`，复用现有账单/分类/账户/预算/资产统计）→ 回小账；
- 点击预览卡片 → 保存并**打开账单详情编辑页**（金额/分类/账户/时间/备注/附件可改）。

### 账单图片附件
- `TransactionEntity` 新增可选 `mediaIds?: string[]`（media 表 id，截图不写入备注文字）；
- 账单详情（记一笔/编辑表单）新增「图片附件（支付截图）」模块：上传（Canvas 压缩复用 `compressImage`）/ 查看（`MediaImage`）/ 删除 / 替换；
- `purgeOrphanMedia` 纳入账单引用，避免支付截图被当孤儿清理。

### 验证
- 新增 e2e 套件 `capturecheck.mjs`（已注册 run-all.sh）：预览轻量确认/不含金额与商户/完成保存 source=shortcut/点击进编辑含附件区/左侧导航仍 6 项/设置入口与快捷方式说明；
- **`npm run e2e` 全量 19 组全绿**；`tsc --noEmit` 零错误；构建通过；
- 已发布 Version 1.4 并线上冒烟 8/8（预览/识别/不含金额/完成保存/账单入列/设置入口/一键拾光页）。

### Version 1.4 追加：一键拾光改为「剪贴板接力」（不打开网页）
> 用户优化要求：快捷方式不要再打开 Safari 网页 URL（体验像网页、URL 携带数据不安全、后续扩展困难）。
> 技术事实：**iOS PWA 无法注册 URL Scheme（titia://）/ Universal Link / App Intents**（三者均需原生 App），无法被快捷方式直接唤起独立窗口。在平台限制内采用**系统剪贴板接力**方案。

- **新流程**：截图 → OCR（提取文本）→ 文本加前缀 `TITIA_CAPTURE::` → 复制到剪贴板 →（可选通知"打开 Titia 确认"）→ 用户打开桌面 App → App 检测剪贴板 → 识别预览 → 确认保存；
- **App 端**：新增 `services/captureClipboard.ts`——启动时自动读取剪贴板（`TITIA_CAPTURE::` 前缀命中即解析、清空剪贴板、进入 `/capture` 预览）；剪贴板数据优先于 URL query（旧快捷方式仍兼容）；自动记账设置页提供「📥 从剪贴板读取拾光数据」按钮作为无权限/无手势时的兜底；
- **说明更新**：App 内「设置快捷方式」改为剪贴板方案 5 步（截屏 → 提取文本 → 文本加前缀 → 复制到剪贴板 → 通知），不再引导打开 URL；
- **保留**：现有账单/分类/账户/附件体系；URL 通道作为兼容路径；
- 验证：`capturecheck` 18 项全绿（含剪贴板说明与兜底入口）；剪贴板链路专项验证通过（写入 `TITIA_CAPTURE::` → 读取 → 跳转预览 → 分类识别 → 剪贴板清空）；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：剪贴板接收与一键拾光解析（需求 v2 全量落地）
> 需求文档 v2：剪贴板检测 → 数据解析 → 确认页 → 防重复 → 未识别兜底。新增模块：ClipboardListener（captureClipboard.ts 升级）、CaptureParser（captureParser.ts）、RecognitionPreview+SaveHandler（CapturePage 升级）。未改小账导航/账单数据结构/分类/账户/预算。

- **ClipboardListener**：打开 App 检测 `TITIA_CAPTURE::` 剪贴板 → 进入识别流程；**防重复**——内容哈希存 localStorage（`titia.captureDone`，最近 20 条），已处理内容不再进入识别，同时清空剪贴板；
- **CaptureParser**（新增 `services/captureParser.ts`）：从 OCR 文本解析**金额（¥/元/纯数字）、时间（2026-08-05 12:30 / 8月5日 / 12:30）、支付账户（微信/支付宝/花呗/信用卡…）、商户**（去除金额/时间/账户片段）；无法解析出金额与商户 → `confidence:'low'`（未识别）；
- **RecognitionPreview**：预览严格只显示 类型/分类/账户（不含金额/商户/备注）；显式「**完成**」（保存）与「**修改**」（保存并进入账单详情编辑页）双按钮；分类无法匹配默认「**未分类**」；
- **SaveHandler**：创建账单（`source:'shortcut'`，复用现有账单/分类/账户/预算/资产统计）→ 截图附件（剪贴板 JSON `mediaB64` → 压缩存 media → 关联账单）→ 跨容器桥 + 云同步推送 → 标记已处理；
- **未识别兜底（验收）**：OCR 失败时显示「未识别到账单信息」+「✍️ 手动记账」入口（打开记一笔表单）+ 返回小账；
- **防重复（验收）**：重复打开同一内容显示「该笔已处理过」，不生成预览/账单（URL 与剪贴板双路径）；
- 验证：`capturecheck` 24 项全绿（修改按钮/编辑页/附件/防重复/未识别/手动记账/导航不变/剪贴板说明）；**`npm run e2e` 19 组全绿**；线上冒烟 7/7（文本解析分类账户/不含金额/双按钮/防重复/未识别兜底）；已发布。

### Version 1.4 追加：OCR Parser 优化（金额/商户/分类解析修复）
> 用户反馈：流程已通但 OCR 字段解析错误（金额识别为 0、交易对象含"美团"平台、分类受平台干扰）。仅优化 `captureParser.ts` + 规则库，不改快捷指令/剪贴板/保存逻辑/分类/账户体系。

- **金额解析**（优先级）：①"交易详情/支付金额/实付/金额/合计/消费"附近数字（吃掉可选"元"）→ ② ¥/￥ → ③ xx元 → ④ 负号金额（`-10.60`）→ ⑤ 兜底非时间数字（排除 12:30/日期）；**不再取第一个数字**；支付截图一律识别为**支出**；
- **商户解析**：过滤支付平台（微信支付/支付宝/美团/美团App/淘宝/京东支付/饿了么/拼多多…）+ OCR 通用提示词（支付成功/交易成功/消费/收款…）+ 括号分店（`瑞幸咖啡（港深国际中心店）`→`瑞幸咖啡`）+ `-平台`后缀，取首个语义段；
- **分类**：规则匹配改为**依据真实商户（merchant）**而非整段文本/支付平台；补充商户规则（库迪→咖啡、麦当劳/肯德基/汉堡王/华莱士→午餐（现有分类，未新增"快餐"以遵守"不修改分类体系"））；
- **验证**：解析器单测 5/5（瑞幸截图 `交易详情 -10.60 瑞幸咖啡（港深国际中心店）-美团App 15:22 微信支付` → 金额 10.60/商户 瑞幸咖啡/账户 微信/支出）；`capturecheck` 28 项全绿（含 OCR 端到端：保存账单 amount=1060、merchant=瑞幸咖啡、category=咖啡、account=微信）；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：OCR Parser 抗噪声优化（真实微信支付页 OCR 修复）
> 用户真实 OCR 文本含大量 UI 噪声（:!! 이 / 美团美团 / 國團 等945万+人喜欢 / 小程序 / 收单机构 / 交易单号…），导致首段商户取到噪声、分类/账户未命中。修复（仅解析器+规则，不动流程）：

- **分类**：规则匹配改回**原始 OCR 文本**（真实商户关键词可靠命中：原文含"瑞幸"→咖啡；规则库无纯平台规则，不会按平台分类）；
- **商户**：优先取**规则关键词在原文中的上下文**（`瑞幸咖啡（港深国际中心店）`→`瑞幸咖啡`）；无规则时从候选段中选**最长中文段**（真实商户常为较长中文段，滤掉 `:!!`/韩文/符号）；
- **账户**：关键词→账户名**映射表**（`零钱`→微信、`微信支付`→微信、`花呗`→支付宝…）；
- **噪声过滤扩充**：当前状态/支付时间/收单机构/支付方式/交易单号/商户单号/交易服务/小程序/团购/喜欢/对订单有疑惑/发起群收款/等万… + 收单机构（`XX支付技术/有限公司`）过滤；
- **验证**：真实 OCR 文本单测全过（金额 10.60/账户 微信/时间 2026-08-05 09:09/候选含"瑞幸咖啡"）；`capturecheck` 32 项全绿（新增真实 OCR 端到端：保存账单 amount=1060、merchant=瑞幸咖啡、category=咖啡、account=微信、time=09:09）；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：一键拾光确认页升级 + AI 辅助解析 + 密码箱解锁加固
> 两份修复指令（含开发约束）：一键拾光智能账单解析 / 密码箱解锁 Bug。均小范围增量，未动导航/数据结构/公共组件/存储逻辑。

**一键拾光（需求八、九）**
- **确认页显示完整字段**：Titia 识别完成 / 类型：支出 / **金额 ¥xx** / **交易对象** / 分类 / 账户 + 完成/修改（覆盖此前"预览不含金额"的旧规则——以最新指令为准）；
- **AI 辅助解析**：规则/解析无法判断（分类未命中或金额缺失）时调用 `aiRecognize` 纠错——AI 仅识别/建议（分类/商户/金额/账户），结果仍进确认流程、用户可改，**不直接改历史数据/覆盖已有记录**；未配置 AI 时静默降级；
- 规则优先 → AI 建议 → 未分类 的分层分类逻辑。

**密码箱解锁 Bug（排查修复）**
- 本地 CDP 全流程验证：创建 → 锁定 → 正确密码解锁进入列表 → 错误密码提示"主密码错误"（本地无 Bug，流程正常）；
- 针对真机场景加固：① `setup/unlock` 统一 `trim`（解锁先原样后 trim，兼容历史含空格数据）；② 解锁按钮 busy 显示"解锁中…"（PBKDF2 150k 迭代在 iPhone 耗时 1-3s，避免无反馈误判）；③ iOS 输入框 `autoCapitalize/autoCorrect/autoComplete` 关闭；④ unlock 异常 try/catch + toast；
- 验证：`capturecheck` 33 项全绿（含确认页金额/交易对象显示）；密码箱流程回归正常（解锁/错误密码）；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：一键拾光自动触发优化（含开发约束）
> 指令：实现自动触发（不再手动点 📥）；高置信度直接保存、低置信度进人工确认页；保留 📥 备用入口。密码箱 v2 指令与 v1 内容一致（cacheKey 相同），上一轮已修复无需重复改动。

- **自动触发**：App 启动 / visibilitychange（从快捷方式切回）/ **hashchange（进入小账首页等任意页面）** 自动检测剪贴板 `TITIA_CAPTURE::` → 自动读取/解析/进入识别流程，无需手动点击 📥；
- **高置信度直接保存**：金额 + 商户 + 分类（规则/AI 命中）都识别成功 → **自动保存账单**（400ms 后）→ toast「已自动记账：商户 ¥xx」→ 回小账；写入现有账单/分类/账户/预算/资产统计（复用体系，不建临时账单）；
- **低置信度 → 人工确认页**：金额/商户/分类任一缺失 → 确认页（金额/交易对象/分类/账户 + 完成/修改）；
- **📥 备用入口保留**：自动识别失败/主动重读仍可用；
- 验证：`capturecheck` 24 项全绿（高置信度三场景自动保存：瑞幸生椰 ¥18.50、纯 OCR ¥10.60、真实微信页 OCR ¥10.60/时间 09:09；低置信度确认页金额/交易对象/未分类/修改编辑页；防重复；未识别兜底；📥 入口保留）；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：密码箱解锁验证逻辑加固（详细原因 + 兼容读取）
> 指令：排查解锁失败；不删数据、兼容读取旧字段、失败输出详细原因、保持已有密码可解锁。只改验证逻辑，未动账号数据结构。

- **密码保存位置确认**：IndexedDB `vaultMeta`（salt/iterations/verifier），主密码永不落库（PBKDF2+AES-GCM）；代码中从未使用 localStorage 存密码（无 masterPassword/password 历史字段——文档排查模板在此项目无对应历史数据）；
- **兼容读取**：`readVaultMetaCompat`——优先 IndexedDB `vaultMeta`；不存在时检测 localStorage 遗留字段（titia.vault.masterPassword/masterPassword/vaultPassword 等）并 console 记录（明文/哈希无法转换 verifier，仅提示不误判数据丢失）；
- **详细错误原因**：新增 `verifyMasterDetailed` 返回 `{ key, reason }`，区分：META_MISSING（salt 缺失）/ META_VERIFIER（verifier 损坏）/ META_ITER（参数异常）/ EMPTY_PASSWORD / WRONG_PASSWORD（密码不匹配，提示检查大小写与首尾空格）/ VERIFY_DECRYPT（AES 校验异常）——unlock 失败时 console.warn 输出原因，错误 toast 提示"检查大小写与首尾空格"；
- **保持已有密码可解锁**：同一 verifier 校验逻辑，先原样后 trim（兼容历史含空格数据）；
- 验证：完整密码箱流程（创建→添加账号→锁定→错误密码提示→正确解锁→**重启后数据保留且主密码有效**）；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：密码箱「解锁失败，请重试」根因修复（数据损坏不阻断解锁）
> 用户截图显示解锁失败提示为「解锁失败，请重试」（而非「主密码错误」）——该文案是 UnlockView 的 catch 路径，说明 unlock() 抛出了异常。

- **根因**：unlock 验证密码成功后调用 `loadItems(key)` 解密全部账号；若**某条账号密文损坏/旧格式**，`decryptSecret` 抛错 → 整个 unlock 抛异常 → 被上层 catch 误判为「解锁失败」——**即使主密码正确也进不去**；
- **修复**：unlock 内 `loadItems` 包 try/catch——密码验证通过即 `unlocked=true`（保持主密码可访问）；items 解密失败的条目跳过并 console 记录原因；读取 meta 也 try/catch；
- **数据安全**：不删/不改任何数据；损坏条目保留在库（仅跳过展示），正常条目仍解密显示；
- 验证：CDP 实测「创建→添加账号→人为损坏 secret 密文→锁定→正确密码解锁」——**解锁成功进入列表**（损坏条目跳过），不再显示「解锁失败，请重试」；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：一键拾光「预览弹窗确认」流程（含开发约束）
> 指令：自动触发（首开/回前台/进小账首页/用户交互后检测剪贴板）+ 识别后**先弹预览弹窗、用户确认才保存**（取消=不保存回小账；点字段进编辑）。字段必须来自解析结果，禁止写死/测试数据。未改导航/账单结构/分类/账户。

- **自动检测增强**：App 启动 / visibilitychange（回前台）/ hashchange（进小账首页）/ **首次 pointerdown（用户交互后，iOS 剪贴板权限最稳）** 四场景自动检测 `TITIA_CAPTURE::`；
- **预览弹窗确认**（移除"高置信度直接保存"）：识别后弹窗显示 **Titia识别完成 / 金额 / 类型 / 交易对象 / 分类 / 账户 / 备注：自动识别**（全部绑定解析结果，含用户编辑覆盖）；
- **字段点击编辑**：点字段区进入「编辑识别结果」表单（改金额/分类/账户/时间/备注），编辑结果实时回填弹窗，不落库；
- **保存**：创建正式账单（source:'shortcut'）+ 截图附件 + 预算/资产统计（add 内自动）+ 防重复标记 + 云同步；**取消**：不保存、返回小账首页；
- **📥 备用入口保留**（自动失败/主动重读）；
- 验证：`capturecheck` 33 项全绿（预览弹窗六字段/点字段改金额 20→保存 2000/取消不保存/OCR 与真实 OCR 弹窗保存/防重复/未识别/📥 备用）；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：密码箱记录完整性提示（恢复情况透明化）
> 用户询问"之前保存的记录恢复不了吗"。数据从未删除（vaultItems 全在本地库）；能否恢复取决于密文是否完好。

- **逐条解密容错**（loadItems 重构）：单条密文损坏/旧格式不影响其余条目解密展示；
- **持久提示**：store 新增 `damagedCount`，解锁后如有损坏记录，列表页顶部持久显示「有 N 条记录无法解密（密文可能损坏或为旧格式）。数据保留在本地未删除；可到「我呀 → 数据管理」导出备份排查，或重新添加对应账号」；
- **结论**：密文完好的记录解锁后可见（此前"解锁失败"bug 已修）；密文损坏（AES-GCM 不可逆）无法解密恢复——**除非之前导出过备份**（备份含 vaultItems，可导入恢复）；
- 验证：CDP 实测损坏 1 条后解锁——成功进入、损坏条目跳过、持久提示显示"有 1 条记录无法解密"；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：一键拾光自动检测增强（iOS 手势限制下的最大化自动）
> 用户反馈"自动检测没有生效"。根因：**iOS WebKit 强制"用户手势"才能读取剪贴板**（`navigator.clipboard.readText()` 无手势调用被系统直接拒绝）——打开 App 完全无操作无法读取（平台限制，非代码缺陷）。在限制内最大化自动：

- **四类触发全部增强**：① App 启动立即 + 0.6s/2s/5s 延迟重试（权限/激活状态变化后更易成功）；② 回前台（visibilitychange）；③ hashchange（进任意页）；④ **用户点按屏幕任意处（pointerdown/touchend 永久监听）——iOS 手势要求下最可靠的自动触发点**；
- 验证（CDP 模拟）：写入 `TITIA_CAPTURE::` → 打开 App → 点击屏幕 → **自动跳转预览弹窗**（金额/分类正确）+ 剪贴板清空；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：剪贴板自动识别约束框架落地（收敛为唯一入口）
> 指令（约束框架）：此前"任意点击触发/启动自动读取"导致 iOS 每次点击都弹粘贴提示、干扰使用。必须：📥 按钮作为**唯一剪贴板读取入口**；禁止全局/自动/后台读取剪贴板。

- **移除全部全局自动读取**（App.tsx）：删除启动即读、0.6s/2s/5s 重试、visibilitychange、hashchange、pointerdown/touchend 任意点击触发——**打开 App 不再自动/随机读取剪贴板，不再弹粘贴提示**；
- **唯一入口**：小账首页右上角 📥（从剪贴板读取拾光数据）——用户主动点击才读取 → 立即解析；
- **确认弹窗对齐**：标题「**账单确认**」，字段：金额/类型/**商户**/分类/账户/**日期**/备注（全部来自解析结果、全部可编辑、AI/规则结果作默认值）；
- **保存真实落库**：add(source:'shortcut') 写 IndexedDB → 账单列表立即显示 → 重启仍在（复用现有账单/分类/账户/预算/资产）；
- 验证：CDP 实测「写入 TITIA_CAPTURE:: → 不点📥 4s 无任何自动触发（hash 保持 #/book）→ 点 📥 → 读取 → 确认弹窗（金额/分类/日期正确）」；`capturecheck` 34 项全绿（账单确认/商户/日期断言）；**`npm run e2e` 19 组全绿**；已发布。

### Version 1.4 追加：账单导入导出对齐「咔皮记账」xlsx 格式
> 用户提供咔皮记账导出样例（xlsx 双 sheet：收支账单 13 列 + 内部转账 7 列），要求账单导入导出按此格式，只改导入导出、其他不动。

- **导出**：生成咔皮格式 Excel（`XLSX` 库）——「收支账单」sheet（日期/时间/类型/金额/一级分类/二级分类/标签/账户/计入收支/计入预算/所属账本/备注/分摊明细）+「内部转账」sheet（日期/时间/类型/金额/转入账户/转出账户/备注）；分类拆分为一级/二级、收入/支出类型、元金额；
- **导入**：解析咔皮 xlsx 双 sheet——收支账单（类型→支出/收入、金额元→分、二级分类优先→分类、账户直接关联）+ 内部转账（账户互转→转账，余额调整跳过）；**旧 CSV 格式仍兼容**（金额(分)/类型/分类/账户/商户/时间/备注）；
- **验证**：用用户提供的咔皮文件实测导入——**190 条全部正确**（支出 160 / 收入 27 / 转账 3，分类/账户/时间/备注完整），账单列表正常显示；导出无运行时错误、结构复现合法；`bookcheck` 断言更新（导出账单 Excel）；**`npm run e2e` 19 组全绿**；已发布。
