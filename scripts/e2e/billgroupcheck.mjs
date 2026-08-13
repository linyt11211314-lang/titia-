// 账单按日分组/日期汇总/指标卡固定 + 双指下拉多选 + 购物清单修改 验证
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'

const PORT = 9326
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--window-size=393,852', '--user-data-dir=/tmp/cdp-bg', BASE + '/#/book',
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
const clickNav = async (txt) => {
  const ok = await ev(`(() => { const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('${txt}')); if(!n) return false; const b=[...n.querySelectorAll('button')].find(x=>x.textContent.trim().includes('${txt}')); if(!b) return false; b.click(); return true })()`)
  if (!ok) throw new Error('找不到导航: ' + txt)
}

// —— 种数据：账户 + 账单（同日 2 支出+1 收入；另日 1 支出；转账 1）+ 购物项 ——
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const yest = new Date(now.getTime() - 86400000)
const yestS = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`
await ev(`
(async () => {
  const req = indexedDB.open('titia');
  const db = await new Promise(r => { req.onsuccess = () => r(req.result) });
  const now = Date.now();
  const base = (id, dt=0) => ({ id, createdAt: now+dt, updatedAt: now, deletedAt: null, _dirty: 0, _syncedAt: null });
  const clear = s => new Promise(res => { const tx = db.transaction(s,'readwrite'); tx.objectStore(s).clear(); tx.oncomplete=res });
  const put = (s, rows) => new Promise(res => { const tx = db.transaction(s,'readwrite'); rows.forEach(r=>tx.objectStore(s).put(r)); tx.oncomplete=res });
  for (const s of ['transactions','accounts','shopping','records']) await clear(s);
  await put('accounts', [
    { ...base('a1'), name:'招商银行信用卡', type:'信用卡', kind:'asset', balance: 100000, bankName:'招商银行', cardTail:'8888', creditLimit: 5000000 },
    { ...base('a2'), name:'支付宝', type:'余额', kind:'asset', balance: 200000 },
    { ...base('a3'), name:'现金', type:'现金', kind:'asset', balance: 50000 },
  ]);
  await put('transactions', [
    { ...base('t1'), amount: 2680, txType:'expense', merchant:'瑞幸', category:'餐饮', account:'招商银行信用卡', time: ${JSON.stringify(today)} + ' 12:30', note:'拿铁', source:'manual' },
    { ...base('t2'), amount: 1500, txType:'expense', merchant:'滴滴', category:'交通', account:'支付宝', time: ${JSON.stringify(today)} + ' 18:20', note:undefined, source:'manual' },
    { ...base('t3'), amount: -50000, txType:'income', merchant:'工资', category:'工资', account:'招商银行信用卡', time: ${JSON.stringify(today)} + ' 09:00', note:undefined, source:'manual' },
    { ...base('t4'), amount: 10000, txType:'expense', merchant:'超市', category:'购物', account:'现金', time: ${JSON.stringify(yestS)} + ' 10:00', note:undefined, source:'manual' },
    { ...base('t5'), amount: 500, txType:'transfer', merchant:'转账', account:'支付宝', transferTo:'招商银行信用卡', time: ${JSON.stringify(yestS)} + ' 08:00', note:undefined, source:'manual' },
  ]);
  await put('shopping', [{ ...base('s1'), name:'猫粮', status:'pending', bought:false, order: now }]);
  db.close();
})()`)
await ev('location.reload()')
await sleep(3200)

// —— 1) 账单页：按日分组 + 日期栏汇总 ——
await clickNav('账单'); await sleep(800)
check('账单页打开', await waitFor(`document.body.innerText.includes('本月支出')`))
// 今天组：支出 26.80+15.00=41.80 · 收入 500；昨天组：支出 100（转账不计）
const todayGroup = await ev(`(() => {
  const ps = [...document.querySelectorAll('p')];
  const p = ps.find(x => x.textContent.includes('支出 -¥41.80') && x.textContent.includes('收入 +¥500.00'));
  return !!p;
})()`)
check('今天日期栏汇总（支出 -41.80 / 收入 +500.00）', todayGroup)
check('昨天日期栏汇总（支出 -¥100.00）', await ev(`document.body.innerText.includes('支出 -¥100.00')`))
// 同一天账单在同一卡片内（滴滴/瑞幸/工资 都在今天组，bills 按时间倒序：滴滴→瑞幸→工资），不同日期分组
check('同日账单同一卡片（滴滴/瑞幸/工资）', await ev(`(() => {
  const text = document.body.innerText;
  const i1 = text.indexOf('滴滴');
  const i2 = text.indexOf('瑞幸', i1);
  const i3 = text.indexOf('工资', i2);
  return i1 >= 0 && i2 > i1 && i3 > i2;
})()`))
check('日期栏显示星期', await ev(`document.body.innerText.includes('周')`))

// —— 2) 顶部指标卡固定（sticky：滚动两次不同距离，位置一致） ——
const stickyCheck = await ev(`(async () => {
  const scroller = [...document.querySelectorAll('div')].find(x => x.offsetParent!==null && x.className.includes('overflow-y-auto') && x.className.includes('px-4'));
  if (!scroller) return 'no-scroller';
  const card = [...document.querySelectorAll('p')].find(x => x.textContent.includes('本月支出'));
  if (!card) return 'no-card';
  scroller.scrollTop = 0;
  await new Promise(r => setTimeout(r, 200));
  const top0 = card.getBoundingClientRect().top;
  scroller.scrollTop = 200;
  await new Promise(r => setTimeout(r, 300));
  const topA = card.getBoundingClientRect().top;
  scroller.scrollTop = 450;
  await new Promise(r => setTimeout(r, 300));
  const topB = card.getBoundingClientRect().top;
  return (Math.abs(topA - topB) < 2 && topA < 120) ? 'sticky-ok' : 'top0=' + top0 + ' a=' + topA + ' b=' + topB;
})()`)
check('顶部指标卡固定（sticky）', stickyCheck === 'sticky-ok', stickyCheck)

// —— 3) 双指下拉多选（CDP 触摸模拟） ——
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
// 滚回顶部，取前两条账单（瑞幸/滴滴）的屏幕坐标
const rows = await ev(`(() => {
  const el = document.querySelector('[data-bill-id]');
  if (!el) return null;
  const scroller = [...document.querySelectorAll('div')].find(x => x.offsetParent!==null && x.className.includes('overflow-y-auto') && x.className.includes('px-4'));
  if (scroller) scroller.scrollTop = 0;
  const r1 = document.querySelector('[data-bill-id]').getBoundingClientRect();
  return { y1: Math.round(r1.top + r1.height/2), x: Math.round(r1.left + r1.width/2) };
})()`)
if (rows) {
  const y2 = Math.min(rows.y1 + 160, 760)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { x: rows.x, y: rows.y1, id: 0, radiusX: 2, radiusY: 2, force: 1 },
    { x: rows.x + 30, y: rows.y1 + 30, id: 1, radiusX: 2, radiusY: 2, force: 1 },
  ] })
  await sleep(100)
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
    { x: rows.x, y: y2, id: 0, radiusX: 2, radiusY: 2, force: 1 },
    { x: rows.x + 30, y: y2 + 30, id: 1, radiusX: 2, radiusY: 2, force: 1 },
  ] })
  await sleep(150)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(600)
}
check('双指下拉进入编辑模式并选中多笔', await ev(`(() => {
  const m = document.body.innerText.match(/已选 (\\d+) 笔/);
  return m && Number(m[1]) >= 2;
})()`), await ev(`(document.body.innerText.match(/已选 (\\d+) 笔/)||[])[0]`))
// 退出编辑模式
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='完成'); if(b) b.click(); return !!b })()`)
await sleep(400)

// —— 4) 购物清单修改（小窝 → 购物 → 改 → 今日同步） ——
await ev(`location.hash='#/space'`); await sleep(1500)
check('小窝购物清单出现', await waitFor(`document.body.innerText.includes('猫粮')`))
check('有「改」按钮', await ev(`[...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()==='改')`))
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='改'); if(!b) return false; b.click(); return true })()`)
await sleep(600)
await ev(`
(() => {
  const inp = document.querySelector('input[placeholder="想买点什么"]');
  if (!inp) return false;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(inp, '猫粮升级装');
  inp.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
})()`)
await sleep(200)
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='保存'); if(!b) return false; b.click(); return true })()`)
await sleep(800)
check('修改后名称更新（小窝）', await ev(`document.body.innerText.includes('猫粮升级装')`))
// 今日页同步
await ev(`location.hash='#/'`); await sleep(1800)
check('今日页购物清单同步新名称', await waitFor(`document.body.innerText.includes('猫粮升级装')`))

// —— 5) 记一笔分类：点击二级分类后自动收起面板 ——
await ev(`location.hash='#/book'`); await sleep(1500)
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('记一笔')); if(!b) return false; b.click(); return true })()`)
await sleep(800)
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('未分类')&&x.className.includes('titia-input')); if(!b) return false; b.click(); return true })()`)
await sleep(500)
check('分类面板打开', await ev(`document.body.innerText.includes('选择分类')`))
// 点一级「餐饮」（有二级）→ 展开二级
await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('餐饮')&&x.className.includes('rounded-card')); if(!b) return false; b.click(); return true })()`)
await sleep(400)
check('一级展开二级', await ev(`document.body.innerText.includes('外卖') || document.body.innerText.includes('奶茶')`))
// 点二级（任一可见的二级分类按钮）→ 应自动收起
const subClicked = await ev(`(() => {
  // 二级按钮：在展开区域内、非一级（不含「餐饮」图标行的最后一个）
  const all=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null);
  const subs=all.filter(x=>x.className.includes('rounded-btn')&&x.className.includes('px-4'));
  const b=subs[0];
  if(!b) return false;
  b.click();
  return true;
})()`)
await sleep(500)
check('点击二级分类后自动收起面板', subClicked && await ev(`!document.body.innerText.includes('选择分类')`))

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('/tmp/bill-group.png', Buffer.from(shot.data, 'base64'))

console.log('\n通过:'); pass.forEach(p => console.log('  ✔', p))
if (fail.length) { console.log('\n失败:'); fail.forEach(f => console.log('  ✘', f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
ws.close(); chrome.kill()
process.exit(fail.length ? 1 : 0)
