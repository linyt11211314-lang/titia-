// Titia 时序 · WebDAV CORS 代理（Cloudflare Worker · 鲁棒版）
// 浏览器 → Worker (加 CORS 头) → 坚果云 dav.jianguoyun.com
// Worker 不存储账号密码——浏览器发的 Authorization header 直接透传到坚果云

const JU_GY_DAV = 'https://dav.jianguoyun.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Credentials': 'true',
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
  async fetch(request) {
    // 1. CORS 预检
    if (request.method === 'OPTIONS') return corsPreflight()

    // 2. 解析目标 URL
    let target
    try {
      const u = new URL(request.url)
      target = JU_GY_DAV + u.pathname + u.search
    } catch {
      return new Response('bad url', { status: 400, headers: CORS })
    }

    // 3. 透传 headers（去掉 CF 内部头与 host，避免上游 mismatch）
    const headers = new Headers()
    for (const [k, v] of request.headers) {
      const kl = k.toLowerCase()
      if (kl === 'host' || kl === 'connection' || kl.startsWith('cf-')) continue
      headers.set(k, v)
    }

    // 4. 构造 fetch init（只对有 body 的方法传 body）
    const init = { method: request.method, headers }
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
      init.body = request.body
    }

    // 5. 透传上游
    let upstream
    try {
      upstream = await fetch(target, init)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'upstream: ' + (e?.message || String(e)) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    // 6. 复制 body 为 ArrayBuffer 避免 stream 复用问题
    try {
      const buf = await upstream.arrayBuffer()
      return withCors(new Response(buf, {
        status: upstream.status,
        headers: upstream.headers,
      }))
    } catch (e) {
      return new Response(JSON.stringify({ error: 'stream: ' + (e?.message || String(e)) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }
  },
}
