# 天气功能 · 部署与配置说明

首页 Banner 右上角的天气模块，点击后从底部滑出半屏天气详情（当前天气 / 逐小时 / 7 天 / 空气质量 / 紫外线 / 切换城市）。

数据源：**和风天气 QWeather 免费 API**。

---

## 一、注册和风天气并获取 API Key

1. 打开注册页：<https://id.qweather.com/#/login>
2. 注册并登录控制台：<https://console.qweather.com/>
3. 创建项目 → 创建「应用」→ 选择 **Web 端**（浏览器调用必须选 Web 端，否则无 CORS 授权）。
4. 在应用下创建「KEY」，复制生成的 **API Key**（形如 `a1b2c3d4e5f6...`）。
5. 免费版每天 1000 次调用，个人使用足够。

> 注意：和风天气的「KEY」区分端类型。**本项目是纯前端直接调用，务必用 Web 端 KEY**，否则浏览器请求会被 CORS 拦截（代码已内置 allorigins 代理兜底，但直连更稳更快）。

---

## 二、填入配置（两处变量）

打开 `src/services/weather.ts` 顶部：

```ts
export const QWEATHER_API_KEY = 'your_api_key_here'   // ← 替换为你的 API Key
export const QWEATHER_API_HOST = 'https://devapi.qweather.com'  // ← 免费版用这个；若申请到专属域名则替换
```

- `QWEATHER_API_KEY`：第一步拿到的 Key。
- `QWEATHER_API_HOST`：
  - 免费版默认 `https://devapi.qweather.com`
  - 若控制台分配了**专属域名**（如 `https://xxxxxx.qweatherapi.com`），填专属域名（更稳定、额度更高）。

改完这两行后重新构建部署即可，无需改动其他代码。

---

## 三、行为说明

| 项目 | 说明 |
| --- | --- |
| 定位 | 优先用浏览器 `geolocation` 授权定位；拒绝授权则默认显示「深圳」 |
| 城市切换 | 详情页底部「切换城市」→ 输入城市名 → 保存并覆盖默认定位，下次优先使用（存 localStorage） |
| 缓存 | 按城市缓存 **15 分钟**（`localStorage`），15 分钟内不重复请求；切换城市立即刷新 |
| 跨域 | 直连失败自动走 `api.allorigins.win` 代理兜底 |
| 加载/错误 | 加载显示骨架屏；失败显示「点击重试」；无网络提示检查连接 |
| 图标 | 使用 emoji（☀️🌤️⛅☁️🌧️❄️🌫️⛈️），与 App 现有风格一致 |

---

## 四、构建与部署

```bash
npm ci
npm run build
# 产物在 dist/，按现有部署流程发布到 70c149（同链接，链接不变）
```

每次发版缓存戳（`index.html` 的 `?v=` 与 `vite.config.ts` 的 `start_url`）会随可见 UI 变更 bump，iOS 重装视为全新 web clip，避免旧缓存。

---

## 五、免费版接口清单（本功能调用）

- Geo 城市搜索：`/geo/v2/city/lookup`
- 实时天气：`/v7/weather/now`
- 24 小时：`/v7/weather/24h`
- 7 天：`/v7/weather/7d`
- 空气质量：`/v7/airquality/now`
- 紫外线指数：`/v7/indices/1d?type=5`

> 一次详情加载约 5 次请求（含 Geo）。免费版 1000 次/天，配合 15 分钟缓存足够日常使用。
