// 跨容器自动刷新验证（Safari ↔ PWA UI 刷新机制）
// 双页面（同 profile 同 origin）：页面 A 模拟 Safari 容器，页面 B 模拟 PWA 容器。
// 场景：
//   ① A(Safari)新增账单 → B(PWA)storage 事件自动合并刷新，无需手动 reload
//   ② PWA 前台切换（focus / visibilitychange）→ 自动重读 IndexedDB
//   ③ 反向：B(PWA)新增账单 → A(Safari)storage 事件自动出现
// 说明：桌面浏览器 IndexedDB 同源共享，①③的桥用于模拟 iOS 容器隔离场景；
//       ②直接向 IndexedDB 写数据（绕过桥，避免两页竞争消费桥），验证前台切换刷新。
import { spawn } from 'node:child_process'
import dayjs from 'dayjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9588
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-cross',
  `${BASE}/#/book`], { stdio: 'ignore' })
await sleep(4500)

// ── 创建页面 B（同 profile 同 origin，模拟 PWA 容器） ──
const { id: targetB } = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/#/book')}`, { method: 'PUT' })).json()
await sleep(1500)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const pageA = tabs.find(t => t.type === 'page' && t.id !== targetB)
const pageB = tabs.find(t => t.type === 'page' && t.id === targetB)
if (!pageA || !pageB) { console.error('页面创建失败', JSON.stringify(tabs.map(t => ({ id: t.id, type: t.type })))); process.exit(1) }

async function makeSend(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  return (m, p = {}) => new Promise(res => {
    const i = ++id
    const h = e => { const x = JSON.parse(e.data); if (x.id === i) { ws.removeEventListener('message', h); res(x.result) } }
    ws.addEventListener('message', h)
    ws.send(JSON.stringify({ id: i, method: m, params: p }))
  })
}
const sendA = await makeSend(pageA.webSocketDebuggerUrl)
const sendB = await makeSend(pageB.webSocketDebuggerUrl)
const ev = (send, e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }).then(r => r?.result?.value)
const pass = [], fail = []
const check = (n, ok, extra = '') => (ok ? pass : fail).push(n + (extra ? ` (${extra})` : ''))
const clickBtn = (send, txt) => ev(send, `(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas = (send, t) => ev(send, `document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput = (send, ph, val) => ev(send, `(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
// 就绪轮询：等待页面出现指定文本（线上加载慢，用轮询替代固定等待）
async function waitReady(send, text, tries = 24) {
  for (let i = 0; i < tries; i++) {
    if (await bodyHas(send, text)) return true
    await sleep(500)
  }
  return false
}
// 向 IndexedDB 直接插入一笔账单（模拟其他容器写入共享库，绕过跨页竞争）
const idbPut = (send, tx) => ev(send, `new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('transactions','readwrite');t.objectStore('transactions').put(${JSON.stringify(tx)});t.oncomplete=()=>res('ok')}})`)
// 构造一笔完整账单
const makeTx = (id, merchant, amount, category, account) => ({
  id, amount, txType: 'expense', merchant, category, account,
  time: dayjs().format('YYYY-MM-DDTHH:mm'), source: 'manual',
  createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null, _dirty: 1, _syncedAt: null,
})

await sendA('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
await sendB('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })

// ── 清理（IndexedDB/localStorage 同源共享，清一次） ──
await ev(sendA, `localStorage.removeItem('titia.pendingTx');localStorage.removeItem('titia.editTxId')`)
await ev(sendA, `new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;if(![...db.objectStoreNames].includes('transactions')){res('no');return}const tx=db.transaction(['transactions','rules','accounts','categories','budgets'],'readwrite');['transactions','rules','accounts','categories','budgets'].forEach(n=>tx.objectStore(n).clear());tx.oncomplete=()=>res('ok')}})`)
await ev(sendA, `location.reload()`); await ev(sendB, `location.reload()`)
// 等待两页就绪并切到账单视图
const readyA = await waitReady(sendA, '记一笔')
const readyB = await waitReady(sendB, '记一笔')
check('页面 A 就绪（Safari 容器）', readyA)
check('页面 B 就绪（PWA 容器）', readyB)
await clickBtn(sendA, '账单'); await clickBtn(sendB, '账单')
const billsA = await waitReady(sendA, '本月支出')
const billsB = await waitReady(sendB, '本月支出')
check('页面 A 已切到账单视图', billsA)
check('页面 B 已切到账单视图', billsB)

// ═══ ① Safari(A) 新增账单 → PWA(B) storage 事件自动出现（不 reload） ═══
const tx1 = makeTx('cross-safari-1', 'Safari新账单', 1580, '咖啡', '微信')
tx1.source = 'shortcut'
await ev(sendA, `localStorage.setItem('titia.pendingTx', ${JSON.stringify(JSON.stringify(tx1))})`)
const shown1 = await waitReady(sendB, 'Safari新账单')
check('① Safari 新增后 PWA 无需刷新自动出现（storage 事件）', shown1)
// 桥消费晚于 UI 渲染（reloadAll 中 load 先、mergePendingTx 后），轮询等待桥清空
let consumed = false
for (let i = 0; i < 12; i++) {
  if (await ev(sendA, `!localStorage.getItem('titia.pendingTx')`)) { consumed = true; break }
  await sleep(500)
}
check('① PWA 端桥已消费（不重复合并）', consumed)

// ═══ ② PWA(B) 前台切换（focus）→ 自动重读 IndexedDB ═══
await idbPut(sendB, makeTx('cross-front-2', '前台新账单', 3200, '午餐', '支付宝'))
await ev(sendB, `window.dispatchEvent(new Event('focus'))`)
const shown2 = await waitReady(sendB, '前台新账单')
check('② PWA 前台切换自动重读（focus 事件）', shown2)

// ═══ ②.5 PWA(B) 前台切换（visibilitychange）→ 自动重读 ═══
await idbPut(sendB, makeTx('cross-front-3', '回前台账单', 900, '水果', '现金'))
await ev(sendB, `document.dispatchEvent(new Event('visibilitychange'))`)
const shown3 = await waitReady(sendB, '回前台账单')
check('② PWA 前台切换自动重读（visibilitychange 事件）', shown3)

// ═══ ③ 反向：PWA(B) 新增账单 → Safari(A) storage 事件自动出现 ═══
await clickBtn(sendB, '首页'); await sleep(500)
await clickBtn(sendB, '记一笔'); await waitReady(sendB, '金额')
await setInput(sendB, '如 26.8', '42'); await sleep(300)
await setInput(sendB, '如 海底捞', 'PWA新记录'); await sleep(300)
await clickBtn(sendB, '保存')
const shown4 = await waitReady(sendA, 'PWA新记录', 30)
check('③ PWA 新增后 Safari 无需刷新自动出现（反向 storage 事件）', shown4)
// 反向数据一致性：A 端账单视图直接可见（IndexedDB 共享，经 storage→reloadAll 刷新）
const shown5 = await waitReady(sendA, '账单') && await waitReady(sendA, 'PWA新记录', 30)
check('③ Safari 账单视图显示 PWA 新记录（两容器数据一致）', shown5)

console.log('\n通过:'); pass.forEach(p => console.log('  ✔', p))
if (fail.length) { console.log('\n失败:'); fail.forEach(f => console.log('  ✘', f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length ? 1 : 0)
