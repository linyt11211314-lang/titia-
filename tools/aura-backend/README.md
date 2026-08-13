# Aura 皮肤诊断后端（可选独立部署）

本目录是 **Aura 个人皮肤诊断工具** 的规则引擎独立后端版（Node.js + Express），
规则与前端 `src/services/auraEngine.ts` **完全一致**，仅作为「可部署 API」的交付参考。

> ⚠️ 线上 App（Titia 时序 PWA）目前直接在前端内嵌运行同一套引擎，**无需此服务即可工作**。
> 只有在你想把诊断能力独立成 API（例如多端复用、后续接云端）时才需要部署它。

## 功能
- `POST /api/aura`：接收症状/因素/年龄/肤质，返回五段诊断文本。
- `GET  /api/aura/health`：健康检查。

## 请求示例
```bash
curl -X POST http://localhost:3000/api/aura \
  -H "Content-Type: application/json" \
  -d '{"symptoms":["acne"],"factors":["stayup","sugar","stress"],"ageGroup":"26-30","skinType":"油性"}'
```

请求体字段：
| 字段 | 类型 | 说明 |
|------|------|------|
| symptoms | string[] | 症状 key（见 engine.js 的 AURA_SYMPTOMS） |
| factors  | string[] | 关联因素 key（见 engine.js 的 AURA_FACTOR_GROUPS） |
| ageGroup | string  | 年龄组 key（如 "26-30"） |
| skinType | string  | 肤质（干性/油性/混合性/敏感性） |

返回：
```json
{
  "overview": "诊断分析…",
  "care": "护理方案…",
  "life": "生活方式调整…",
  "doctor": "就医指引…",
  "comfort": "✨ 你的 Aura 安抚区…"
}
```

## 运行
```bash
npm install
npm start          # 默认 :3000，可用 PORT 环境变量覆盖
```

## 设计要点（与前端一致）
- 规则全部内置，无外部数据库 / 实时 API / 爬虫。
- 覆盖所有组合，绝不返回「无匹配结果」；多选项智能组合为综合诊断。
- 所有建议基于皮肤科学共识（屏障修复 / 痤疮机制 / 光老化 / 压力-皮质醇通路）。
- 不推荐具体品牌，不制造焦虑；不确定处在就医指引建议咨询专业医生。

## 扩展预留
- 想换模型/接 AI：把 `server.js` 里的 `generateAura(...)` 换成你的模型调用即可，接口与返回结构不变。
- 想加历史云端存储：在 `POST /api/aura` 里增加写库逻辑（本目录不含数据库依赖，按需引入）。
