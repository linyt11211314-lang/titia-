// 灵光一闪羽毛笔：长按调透明度（半环绕进度条）验证
// 场景：长按按钮 500ms → 出现半环绕进度条 + 「透明度 X%」提示；
//       在弧上点按/拖动 → 按钮透明度变化并持久化到 localStorage；
//       再次长按 → 进度条反映保存的透明度。
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9327
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--window-size=393,852', '--user-data-dir=/tmp/cdp-fab', BASE + '/#/',
], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })
await sleep(3000)

const tabs = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
const page = tabs.find((t) => t.type === 'page' && String(t.url).startsWith(BASE))
if (!page) { console.error('找不到页面 tab'); chrome.kill(); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const send = (method, params = {}) => new Promise((resolve) => {
  const myId = ++id
  const onMsg = (e) => { const m = JSON.parse(e.data); if (m.id === myId) { ws.removeEventListener('message', onMsg); resolve(m.result) } }
  ws.addEventListener('message', onMsg)
  ws.send(JSON.stringify({ id: myId, method, params }))
})
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.exception))
  return r.result?.value
}
const pass = [], fail = []
const check = (n, ok, extra = '') => (ok ? pass : fail).push(n + (extra ? ` (${extra})` : ''))
const waitFor = async (expr, timeout = 12000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await ev(expr)) return true
    await sleep(300)
  }
  return false
}

// 清掉透明度配置
await ev(`localStorage.removeItem('titia.fabOpacity')`)
await ev('location.reload()')
await sleep(2800)

// —— 1) 羽毛笔存在且默认不透明 ——
check('羽毛笔按钮存在', await waitFor(`!!document.querySelector('button[aria-label="灵光一闪"]')`))
check('默认透明度 1', await ev(`(() => { const b=document.querySelector('button[aria-label="灵光一闪"]'); return Math.abs((getComputedStyle(b).opacity||1)-1) < 0.01 })()`))

// —— 2) 长按 500ms → 出现半环绕进度条 ——
const fab = await ev(`(() => { const b=document.querySelector('button[aria-label="灵光一闪"]'); const r=b.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) } })()`)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fab.x, y: fab.y, button: 'left', buttons: 1, clickCount: 1 })
await sleep(750)
check('长按出现「透明度 100%」提示', await ev(`document.body.innerText.includes('透明度 100%')`))
check('出现进度弧（svg path）', await ev(`!!document.querySelector('svg path')`))

// —— 3) 在弧上点按（约 50% 位置）→ 透明度变化并持久化 ——
const arcPoint = await ev(`(() => {
  // 弧参数与组件一致：半径 42，圆心=按钮中心，开口朝屏幕中心
  const b = document.querySelector('button[aria-label="灵光一闪"]');
  const r = b.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  const open = Math.atan2(window.innerHeight/2 - cy, window.innerWidth/2 - cx);
  const a0 = open + Math.PI * 0.75;
  const total = Math.PI * 1.5;
  const ang = a0 + total * 0.5; // 50%
  return { x: Math.round(cx + 42 * Math.cos(ang)), y: Math.round(cy + 42 * Math.sin(ang)) };
})()`)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: arcPoint.x, y: arcPoint.y, button: 'left', buttons: 1, clickCount: 1 })
await sleep(200)
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: arcPoint.x, y: arcPoint.y, button: 'left', buttons: 0, clickCount: 1 })
await sleep(400)
const saved = await ev(`Number(localStorage.getItem('titia.fabOpacity'))`)
check('透明度已持久化（0.25~1）', saved >= 0.25 && saved <= 1 && Math.abs(saved - 0.625) < 0.1, `opacity=${saved}`)
check('按钮实际透明度应用', await ev(`(() => { const b=document.querySelector('button[aria-label="灵光一闪"]'); return Math.abs(parseFloat(getComputedStyle(b).opacity) - ${saved}) < 0.05 })()`))

// —— 4) 再次长按 → 进度条反映已保存透明度 ——
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fab.x, y: fab.y, button: 'left', buttons: 1, clickCount: 1 })
await sleep(750)
const pct = Math.round(saved * 100)
check(`再次长按提示「透明度 ${pct}%」`, await ev(`document.body.innerText.includes('透明度 ${pct}%')`))
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fab.x, y: fab.y, button: 'left', buttons: 0, clickCount: 1 })
await sleep(300)

// —— 5) 普通点击仍可进入灵光一闪 ——
await ev(`(() => { const b=document.querySelector('button[aria-label="灵光一闪"]'); const r=b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+5,clientY:r.top+5})); b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:r.left+5,clientY:r.top+5})); return true })()`)
await sleep(800)
check('点击羽毛笔仍进入灵光一闪', await waitFor(`location.hash.includes('/spark')`))

console.log('\n通过:'); pass.forEach(p => console.log('  ✔', p))
if (fail.length) { console.log('\n失败:'); fail.forEach(f => console.log('  ✘', f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
ws.close(); chrome.kill()
process.exit(fail.length ? 1 : 0)
