// 今日页打卡面板 + 消费卡片 验证（V2.1 打卡逻辑）
// 场景：banner 下方待办上方出现「已使用/连续打卡/今日消费/本月消费」；
//       已使用天数 = 2026-08-03 至今「过去多少天」（日历天数）；
//       连续打卡 = 手动打卡连续天数；打卡按钮点击 +1，变「今日已打卡」禁用；
//       今日/本月消费真实同步 transactions（支出，转账不计）。
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'

const PORT = 9324
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--window-size=393,852', '--user-data-dir=/tmp/cdp-ck', BASE + '/#/',
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
const waitFor = async (expr, timeout = 15000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await ev(expr)) return true
    await sleep(300)
  }
  return false
}

// —— 种数据：打卡集合（昨天起往前 4 天，今天未打）+ 账单 ——
const now = new Date()
const dayStr = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const today = dayStr(0)
const checkinDays = [1, 2, 3, 4].map(dayStr) // 昨天/前天/大前天/大大前天（连续 4 天，今天未打）
// 已使用天数（日历）：2026-08-03 至今
const usageExpected = Math.round((new Date(new Date().setHours(0,0,0,0)).getTime() - new Date('2026-08-03T00:00:00').getTime()) / 86400000) + 1
await ev(`
(async () => {
  localStorage.setItem('titia.appCheckinDays', ${JSON.stringify(JSON.stringify(checkinDays))});
  const req = indexedDB.open('titia');
  const db = await new Promise(r => { req.onsuccess = () => r(req.result) });
  const now = Date.now();
  const base = (id) => ({ id, createdAt: now, updatedAt: now, deletedAt: null, _dirty: 0, _syncedAt: null });
  const clear = s => new Promise(res => { const tx = db.transaction(s,'readwrite'); tx.objectStore(s).clear(); tx.oncomplete=res });
  const put = (s, rows) => new Promise(res => { const tx = db.transaction(s,'readwrite'); rows.forEach(r=>tx.objectStore(s).put(r)); tx.oncomplete=res });
  for (const s of ['transactions','accounts','categories','budgets','shopping','records']) await clear(s);
  await put('transactions', [
    { ...base('tx1'), amount: 2680, txType: 'expense', merchant: '瑞幸', category: '餐饮', account: '招商银行信用卡', time: ${JSON.stringify(today)} + ' 12:30', note: undefined, source: 'manual' },
    { ...base('tx2'), amount: 1500, txType: 'expense', merchant: '滴滴', category: '交通', account: '支付宝', time: ${JSON.stringify(today)} + ' 18:20', note: undefined, source: 'manual' },
    { ...base('tx3'), amount: 10000, txType: 'expense', merchant: '房租', category: '居住', account: '招商银行信用卡', time: ${JSON.stringify(dayStr(3))} + ' 10:00', note: undefined, source: 'manual' },
    { ...base('tx4'), amount: -50000, txType: 'income', merchant: '工资', category: '工资', account: '招商银行信用卡', time: ${JSON.stringify(dayStr(3))} + ' 09:00', note: undefined, source: 'manual' },
    { ...base('tx5'), amount: 500, txType: 'transfer', merchant: '转账', account: '支付宝', transferTo: '招商银行信用卡', time: ${JSON.stringify(today)} + ' 08:00', note: undefined, source: 'manual' },
  ]);
  db.close();
})()`)
await ev('location.reload()')
await sleep(3200)

// —— 1) 面板存在与位置 ——
check('面板含「已使用」', await waitFor(`document.body.innerText.includes('已使用')`))
check('面板含「连续打卡」', await ev(`document.body.innerText.includes('连续打卡')`))
check('面板含「今日消费」', await ev(`document.body.innerText.includes('今日消费')`))
check('面板含「本月消费」', await ev(`document.body.innerText.includes('本月消费')`))
check('打卡文案「真棒！今天又来看我啦～」', await ev(`document.body.innerText.includes('真棒！今天又来看我啦')`))
check('打卡面板在待办上方', await ev(`(() => { const t = document.body.innerText; const i = t.indexOf('已使用'); const j = t.indexOf('待办'); return i >= 0 && j > i })()`))

// —— 2) 已使用天数 = 2026.8.3 至今（日历天数） ——
const usageText = await ev(`(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes('已使用')); return p ? p.parentElement.innerText : '' })()`)
check(`已使用 ${usageExpected} 天（日历天数）`, new RegExp('已使用\\s*' + usageExpected + '\\s*天').test(usageText), usageText)

// —— 3) 连续打卡：今天未打卡 → 从昨天往前 4 天 ——
const streakText = await ev(`(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes('连续打卡')); return p ? p.parentElement.innerText : '' })()`)
check('连续打卡 4 天（昨天起往前）', /连续打卡\s*4\s*天/.test(streakText), streakText)
check('打卡按钮可点（📅 打卡）', await ev(`[...document.querySelectorAll('button')].some(b => b.offsetParent!==null && b.textContent.includes('打卡') && !b.disabled)`))

// —— 4) 点击打卡 → 连续 +1，变「今日已打卡」禁用 ——
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('打卡')&&!x.disabled); if(!b) return false; b.click(); return true })()`)
await sleep(600)
const streakAfter = await ev(`(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes('连续打卡')); return p ? p.parentElement.innerText : '' })()`)
check('点击打卡后连续 5 天（今天+昨起 4 天）', /连续打卡\s*5\s*天/.test(streakAfter), streakAfter)
check('按钮变「今日已打卡」且禁用', await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('今日已打卡')); return !!b && b.disabled })()`))
check('打卡已持久化（localStorage 含今天）', await ev(`JSON.parse(localStorage.getItem('titia.appCheckinDays')||'[]').includes(${JSON.stringify(today)})`))

// —— 5) 今日/本月消费真实同步 ——
const todayExp = await ev(`(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes('今日消费')); return p ? p.parentElement.innerText : '' })()`)
const monthExp = await ev(`(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes('本月消费')); return p ? p.parentElement.innerText : '' })()`)
check('今日消费 ¥41.80', /今日消费\s*¥41\.80/.test(todayExp), todayExp)
check('本月消费 ¥141.80', /本月消费\s*¥141\.80/.test(monthExp), monthExp)

// —— 6) 重进页面仍为「今日已打卡」（不重复计） ——
await ev(`location.reload()`)
await sleep(2800)
const streakReload = await ev(`(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.includes('连续打卡')); return p ? p.parentElement.innerText : '' })()`)
check('重进后连续仍 5 天（去重）', /连续打卡\s*5\s*天/.test(streakReload), streakReload)

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('/tmp/checkin2.png', Buffer.from(shot.data, 'base64'))

console.log('\n通过:'); pass.forEach(p => console.log('  ✔', p))
if (fail.length) { console.log('\n失败:'); fail.forEach(f => console.log('  ✘', f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
ws.close(); chrome.kill()
process.exit(fail.length ? 1 : 0)
