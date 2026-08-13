# Titia 时序 · 云同步（Cloudflare R2 版）

## 为什么换 R2（不是坚果云 WebDAV）

坚果云 WebDAV 在 CF Workers 上**出站连接被 Cloudflare 阻断**（5xx 错误，不是 4xx），与 Worker 代码无关。R2 是 **Cloudflare 自家对象存储**，Worker → R2 走** CF 内网**，绝对零阻断问题。

## 架构

```
浏览器 PWA  →  CF Worker  →  CF R2 (内网 binding)
            ←  CORS 头     ←  数据
```

- **App 端不需要任何账号密码**——CF 边缘 + Worker binding 自动鉴权
- **R2 免费层**：10 GB 存储 + 每月 1000 万次读 + 100 万次写——对个人记录绰绰有余

## 部署（约 8 分钟）

### 1. 创建 R2 Bucket

1. 打开 https://dash.cloudflare.com/ → 左侧菜单 **R2** → **Object Storage** → **Create bucket**
2. Bucket 名字：`titia-sync`（或任何你喜欢的）
3. Location：Automatic（推荐）
4. 创建

### 2. 创建/更新 Worker

1. 左侧菜单 → **Workers & Pages** → 点现有 **titia-webdav**（或新建 `titia-r2`）
2. 顶部 tab **Settings** → **Variables** → **R2 bucket bindings**：
   - Variable name: `TITIA_SYNC`（**必须大写下划线**）
   - R2 bucket: 选刚才创建的 `titia-sync`
   - 点 **Deploy**
3. 顶部 tab **Code**（或 Quick edit）→ 用下面 `r2-proxy.js` 的代码**完全替换**默认代码 → **Save and Deploy**

### 3. Worker 代码（`r2-proxy.js`）

```javascript
// Titia 时序 · 云同步 Worker（CF R2 版）
// 浏览器 → Worker → R2 bucket（CF 内网 binding）
// 鉴权由 CF 边缘 + Worker binding 自动处理

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS })
}

function withCors(resp) {
  const h = new Headers(resp.headers)
  for (const [k, v] of Object.entries(CORS)) h.set(k, v)
  return new Response(resp.body, { status: resp.status, headers: h })
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsPreflight()
    if (request.method !== 'GET' && request.method !== 'PUT') {
      return withCors(new Response('method not allowed', { status: 405 }))
    }

    const key = 'titia-sync.json'

    if (request.method === 'GET') {
      const obj = await env.TITIA_SYNC.get(key)
      if (!obj) return withCors(new Response(null, { status: 404 }))
      const text = await obj.text()
      return withCors(new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    }

    // PUT
    try {
      await env.TITIA_SYNC.put(key, request.body, {
        httpMetadata: { contentType: 'application/json' },
      })
      return withCors(new Response(null, { status: 200 }))
    } catch (e) {
      return withCors(new Response(JSON.stringify({ error: String(e?.message || e) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }))
    }
  },
}
```

### 4. 拿到 Worker URL

部署成功后顶部有 URL，格式：
```
https://titia-webdav.YOUR-SUBDOMAIN.workers.dev
```

末尾**带斜杠** —— `https://titia-webdav.xxx.workers.dev/`

### 5. 在 App 里填配置

打开 Titia → 我呀 → 云同步 → 填：

| 字段 | 填什么 |
|---|---|
| **同步地址** | 上面那个 Worker URL（**末尾带斜杠**） |

> ❌ 不再需要账号、应用密码——R2 用 CF 内网 binding 自动鉴权

点 **保存并同步** → 看到 Toast「同步完成」= 通了。

## 验证

- R2 控制台 → `titia-sync` bucket → 应该看到 `titia-sync.json` 文件
- 手机和电脑两端：任一端添加数据 → 立即同步 → 另一端打开 App 时自动拉取合并

## 故障排查

| 症状 | 排查 |
|---|---|
| 保存并同步后 Toast「同步失败：xxxx」 | 看 CF Worker Observability 日志 |
| 401 / 403 | 99% 是 binding 没设好——检查 Step 2 的 Variable name 必须是 `TITIA_SYNC`（大写下划线） |
| 404 | Worker URL 末尾漏了斜杠 |
| 520 | 老的 WebDAV 版残留——确认 Worker 代码已替换为 R2 版 |
