// Titia 时序 · 云同步 Worker（CF R2 版）
// 浏览器 → Worker (走 CF 内网 binding) → R2 bucket
// 无需 app 端传任何账号密码：CF 边缘 + Worker binding 自动鉴权
// 绑定：R2 bucket "titia-sync"，binding 名 TITIA_SYNC

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
