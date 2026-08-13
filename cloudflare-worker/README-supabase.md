# Titia 时序 · 云同步（Supabase 版）

## 为什么选 Supabase

| 方案 | 成本 | 注册 | 复杂度 |
|---|---|---|---|
| ~~坚果云 WebDAV + CF Worker 代理~~ | 0 | 已注册 | ❌ CF 边缘出站被 5xx 阻断 |
| ~~CF R2 私有存储~~ | 0 | 需绑卡 | 需 Worker 部署 |
| **Supabase Postgres REST** | 0 | 邮箱注册 | **直接 fetch，自带 CORS，无需 Worker 代理** |

## 架构

```
浏览器 PWA  →  Supabase REST API (官方 CORS)
  ↑              ↑
  透传 Authorization: Bearer <anon-key>
```

- App 直接 fetch Supabase（无需 Worker 代理）
- 自带 CORS 头，浏览器不会拦截
- 免费层 500 MB 数据库 + 5 GB 带宽 + 5 万月活
- **不绑卡**（除非超额，免费层永远不超额）

## 部署（约 5 分钟）

### 1. 注册 Supabase + 创建项目

1. 打开 https://supabase.com/ → 邮箱注册
2. 控制台 → **New Project**：
   - Name: `titia`
   - Database Password: 设置一个**强密码**（**记下来**！）
   - Region: Singapore（最近中国大陆）
3. 等待项目创建完成（约 1 分钟）

### 2. 创建同步表

进入 **SQL Editor**，运行：

```sql
create table if not exists sync (
  id int primary key,
  data jsonb,
  updated_at timestamptz default now()
);
insert into sync (id, data) values (1, '{}'::jsonb)
  on conflict (id) do nothing;
```

### 3. 关闭 RLS 简化（单用户场景）

**Table Editor** → `sync` 表 → **RLS disabled**（默认 anon key 无法 INSERT/UPDATE 启用 RLS 的表）

或 SQL：
```sql
alter table sync enable row level security;
create policy "allow_all" on sync for all using (true) with check (true);
```

### 4. 拿到 URL + Anon Key

**Project Settings** → **API**：
- **Project URL**: `https://xxxxxx.supabase.co`
- **anon public** key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx...`（一长串 JWT）

### 5. 在 App 填配置

打开 Titia → 我呀 → 云同步 → 填：
- **Supabase Project URL**: 上面那个 URL
- **Anon Public Key**: 上面那个 anon key

点「保存并同步」→ 看到 Toast「同步完成」= 通了。

## 验证

打开 **Supabase 控制台** → **Table Editor** → `sync` 表 → 应看到一行（id=1），`data` 列包含 JSON：
- `tables.records[]` 等表数据
- `exportedAt` 时间戳

手机和电脑两端：任一端添加数据 → 立即同步 → 另一端打开 App 时自动拉取合并。

## 故障排查

| 症状 | 排查 |
|---|---|
| 保存并同步后 Toast「同步失败：xxx」 | 看 Toast 消息：401 → anon key 错；404 → 表不存在；42702 → PostgREST schema 错 |
| 401 Unauthorized | anon key 不对 → 重置复制 Project Settings → API |
| 404 Not Found | 没建表 → 跑 Step 2 的 SQL；或 RLS 阻断 → 检查权限 |
| 同步完成但桌面没数据 | 桌面端测试 App 是否初次拉取 → 看 Console 日志 |
| 手机添加数据后电脑无变化 | 等几秒（启动时自动同步）；或 App 内点"立即同步" |

## 安全说明

- **anon key** 是"公开匿名"key，浏览器可以直接暴露，**安全设计**是只允许 SELECT/INSERT 受 RLS 限制的表
- 对个人单用户场景，**直接关 RLS 最简单**（Step 3 提示）
- 严格场景应**只允许自己使用** — 可以加 RLS 限制（按 IP 或 token 等）
