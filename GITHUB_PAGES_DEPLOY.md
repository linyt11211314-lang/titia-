# Titia 部署到 GitHub Pages（稳定镜像）

把纯静态的 Titia 发布到 GitHub Pages，作为比 CloudStudio 更稳的线上入口，
从根本上规避 `12803 无效地址` 这类网关 400 白屏。

> 当前已落地的韧性措施：
> - **A 离线缓存 SW**（`src/sw.js`）：network-first + 预缓存回退，已访问用户即使网关 400 也能从缓存打开。
> - **C 健康监控**：每小时探测入口，故障只记录、不自动换链（自动化 `automation-1786613598959`）。
> - **B 稳定镜像（本文件）**：GitHub Pages 部署配置 + 数据迁移指南。

---

## 一、为什么能解决白屏

GitHub Pages 是 GitHub 官方静态托管，基本不会像 CloudStudio 网关那样间歇抽风。
Titia 是 hash 路由纯前端，无需服务端渲染，完美适配 Pages。

线上将有两个入口：
- `70c149`（CloudStudio，保留作备用/调试）
- `https://<用户名>.github.io/<仓库名>/`（稳定主入口，推荐日常使用）

两个入口 **IndexedDB 数据互不互通**（按 origin 隔离），所以切换前务必迁移数据。

---

## 二、部署步骤

### 1. 准备 GitHub 仓库
- 在 GitHub 新建一个仓库（公开/私有均可，Pages 公开仓库免费；私有仓库需 GitHub Pro 才能用 Pages，或用公开仓库）。
- 仓库名假设为 `titia`（下文以此为例，自动适配）。

### 2. 推送代码
把本 `titia-project` 仓库推到你的 GitHub 仓库 `main` 分支（需包含 `.github/workflows/deploy.yml`）：

```bash
git remote add origin git@github.com:<用户名>/titia.git
git push -u origin main
```

> 若你不想把整个开发仓库推上去，也可以只推送 `dist/` 产物，但用 Actions 自动构建更省心，推荐整仓推送。

### 3. 开启 Pages（GitHub Actions 模式）
- 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
- 无需配置分支/路径，工作流会自动处理。

### 4. 运行部署
- push 到 `main` 会自动触发；也可在 **Actions → Deploy Titia to GitHub Pages → Run workflow** 手动触发。
- 完成后访问 `https://<用户名>.github.io/titia/`。

### 5. 自定义域名（可选）
若你有自己的域名（如 `titia.example.com`）：
- 在仓库 **Settings → Pages → Custom domain** 填入并配置 DNS（CNAME 记录指向 `<用户名>.github.io`）。
- 把 `.github/workflows/deploy.yml` 里的 `BASE_PATH: /${{ github.event.repository.name }}/` 改为 `BASE_PATH: /`。
- 重新运行 workflow。

---

## 三、数据迁移（关键！换 origin 会清空 IndexedDB）

GitHub Pages 是**新的 origin**，打开时本地 IndexedDB 是空的。请用 Titia 自带备份恢复：

1. **旧站导出**（在 70c149 上操作）：
   - 打开 Titia →「我呀」→「备份与恢复」→「导出备份」，下载得到一个 JSON 文件。
2. **新站导入**（在 GitHub Pages 上操作）：
   - 打开 `https://<用户名>.github.io/titia/` →「我呀」→「备份与恢复」→「导入备份」，选择刚才的 JSON。
   - 导入后 App 会自动 reload，打卡/记账/日记/物集/睡眠等数据全部回来。

> 提示：迁移完成、确认新站数据齐全后，旧站 70c149 可继续保留作备用，或仅作开发预览。

---

## 四、缓存戳与更新

- 每次发版需改 `index.html` 与 `vite.config.ts` 里的 `?v=20260811ae` 戳（见项目记忆「发版约定」）。
- SW 已配置 network-first：新版本发布后，用户再次访问会自动拉取最新 HTML，无需手动清缓存。
- GitHub Pages 有 CDN 缓存（通常几十秒~几分钟），发布后稍等片刻即可见新版。

---

## 五、回滚/排查

- 若 Pages 打不开：检查 Actions 构建日志；确认 `BASE_PATH` 与仓库名匹配。
- 若资源 404：多半是 `BASE_PATH` 不对（自定义域名需设为 `/`）。
- 若 SW 报错：浏览器 DevTools → Application → Service Workers → 取消勾选 / 点 "Unregister" 后刷新。
