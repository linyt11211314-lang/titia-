// Aura 后端接口（独立可部署，Node + Express）
// 与前端内嵌的规则引擎同源；线上 App 目前用前端引擎，此服务仅作为可选独立 API 交付。
// 接口：POST /api/aura  body: { symptoms: string[], factors: string[], ageGroup: string, skinType: string }
// 返回：{ overview, care, life, doctor, comfort }

const express = require('express')
const { generateAura } = require('./engine')

const app = express()
app.use(express.json())

// 允许跨域（前端静态 PWA 调用时需要）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.post('/api/aura', (req, res) => {
  try {
    const { symptoms = [], factors = [], ageGroup = '', skinType = '' } = req.body || {}
    const result = generateAura({ symptoms, factors, ageGroup, skinType })
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: 'invalid input' })
  }
})

app.get('/api/aura/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Aura backend listening on :${PORT}`))
