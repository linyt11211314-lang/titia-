// V3.1 布局修复验证：body 不带动底部导航滚动 / 各页指标卡吸顶 / 分析页固定范围 / 封面底部
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'

const PORT = 9332
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
try { fs.rmSync('/tmp/cdp-v31', { recursive: true, force: true }) } catch {}
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars','--remote-debugging-port='+PORT,'--window-size=390,844','--user-data-dir=/tmp/cdp-v31', BASE + '/#/book'], { stdio: 'ignore' })
process.on('exit', () => { try { chrome.kill() } catch {} })
await sleep(3000)
const tabs = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
const page = tabs.find((t) => t.type === 'page' && String(t.url).startsWith(BASE))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const send = (m, p = {}) => new Promise((res) => { const i = ++id; const h = (e) => { const x = JSON.parse(e.data); if (x.id === i) { ws.removeEventListener('message', h); res(x.result) } }; ws.addEventListener('message', h); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'EXC: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.exception); return r.result.value }
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

await ev(`(async () => {
  const req = indexedDB.open('titia');
  const db = await new Promise(r => { req.onsuccess = () => r(req.result) });
  const now = Date.now();
  const base = (id, dt=0) => ({ id, createdAt: now+dt, updatedAt: now, deletedAt: null, _dirty: 0, _syncedAt: null });
  const clear = s => new Promise(res => { const tx = db.transaction(s,'readwrite'); tx.objectStore(s).clear(); tx.oncomplete=res });
  const put = (s, rows) => new Promise(res => { const tx = db.transaction(s,'readwrite'); rows.forEach(r=>tx.objectStore(s).put(r)); tx.oncomplete=res });
  for (const s of ['transactions','accounts','shopping','countdownEvents','pets']) await clear(s);
  await put('accounts', [
    { ...base('a1'), name:'招商银行信用卡', type:'信用卡', kind:'asset', balance: 100000, bankName:'招商银行', cardTail:'8888', creditLimit: 5000000 },
    { ...base('a2'), name:'支付宝', type:'余额', kind:'asset', balance: 200000 },
    { ...base('a3'), name:'现金', type:'现金', kind:'asset', balance: 50000 },
  ]);
  const txs = [];
  for (let i=0;i<40;i++) txs.push({ ...base('t'+i,i), amount: 1000+i, txType:'expense', merchant:'商户'+i, category:'餐饮', account:'招商银行信用卡', time: new Date(Date.now()-i*3600000).toISOString().slice(0,16).replace('T',' '), source:'manual' });
  await put('transactions', txs);
  await put('shopping', [ { ...base('s1'), name:'猫粮', status:'pending', bought:false, order: now } ]);
  await put('countdownEvents', [{ ...base('c1'), title:'中秋', kind:'countdown', dateType:'lunar', lunarMonth:8, lunarDay:15, year:'none' }]);
  await put('pets', [{ ...base('p1'), name:'橘座', breed:'橘猫', gender:'boy', birthday:'2024-01-01', order:0 }]);
  db.close();
})()`)
await ev('location.reload()'); await sleep(4000)

// ── 1) body 不滚动（全局 overflow hidden，所有滚动在 App 内部容器） ──
// 切到账单 view（40 条交易列表可滚动）
await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('账单'));const b=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('账单'));if(b)b.click();return !!b})()`)
await sleep(900)
const bodyNoScroll = await ev(`(()=>{
  const sc = [...document.querySelectorAll('div')].find(d => d.offsetParent!==null && getComputedStyle(d).overflowY==='auto' && d.scrollHeight > d.clientHeight && d.getBoundingClientRect().width > 250);
  if (!sc) return 'no-scroller';
  const bs = document.body;
  const bodyOk = bs.scrollHeight <= window.innerHeight;
  sc.scrollTop = 600;
  return new Promise(r => setTimeout(() => {
    r({ bodyOk, scrolled: sc.scrollTop > 100, bodyScrollH: bs.scrollHeight, winH: window.innerHeight });
  }, 300));
})()`)
check('body 不滚动且内容在内部容器滚动', bodyNoScroll && bodyNoScroll.bodyOk && bodyNoScroll.scrolled, JSON.stringify(bodyNoScroll))

// ── 2) 小账首页：标题+净资产卡 sticky 吸顶 ──
await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('首页'));const b=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('首页'));if(b)b.click();return !!b})()`)
await sleep(800)
const homeSticky = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(d=>d.offsetParent!==null&&d.className.includes('sticky')&&d.textContent.includes('小账')&&d.textContent.includes('净资产'));return !!el})()`)
check('小账首页标题+净资产卡 sticky 吸顶', homeSticky)

// ── 3) 账单页：指标卡 sticky 吸顶（无 -mt-4 裁顶） ──
await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('账单'));const b=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('账单'));if(b)b.click();return !!b})()`)
await sleep(800)
const billSticky = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(d=>d.offsetParent!==null&&d.className.includes('sticky')&&d.className.includes('top-0')&&d.textContent.includes('本月支出'));return !!el && !el.className.includes('-mt-4')})()`)
check('账单页指标卡 sticky 吸顶（无裁顶负边距）', billSticky)

// ── 4) 资产页：净资产 sticky 吸顶 ──
await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('资产'));const b=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('资产'));if(b)b.click();return !!b})()`)
await sleep(800)
const assetSticky = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(d=>d.offsetParent!==null&&d.className.includes('sticky')&&d.textContent.includes('净资产'));return !!el && !el.className.includes('-mt-4')})()`)
check('资产页净资产 sticky 吸顶', assetSticky)

// ── 5) 分析页：sticky 只含月份+三卡+消费趋势（不含分类占比/月度报告） ──
await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('分析'));const b=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('分析'));if(b)b.click();return !!b})()`)
await sleep(800)
const anaSticky = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(d=>d.offsetParent!==null&&d.className.includes('sticky')&&d.className.includes('top-0')&&d.textContent.includes('消费趋势'));if(!el)return null;const t=el.textContent;return {hasTrend:t.includes('消费趋势'),hasDonut:t.includes('分类占比'),hasReport:t.includes('月度报告')}})()`)
check('分析页 sticky 含消费趋势', anaSticky && anaSticky.hasTrend, JSON.stringify(anaSticky))
check('分析页 sticky 不含分类占比/月度报告（可滚动）', anaSticky && !anaSticky.hasDonut && !anaSticky.hasReport, JSON.stringify(anaSticky))

// ── 6) 憨憨封面在页面底部（删除宠物按钮之后） ──
await ev(`location.hash='#/space'`); await sleep(2000)
await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('憨憨'));const b=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('憨憨'));if(b)b.click();return !!b})()`)
await sleep(1000)
const coverPos = await ev(`(()=>{
  const del=[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&b.textContent.trim()==='删除宠物');
  const sec=[...document.querySelectorAll('section')].find(s=>s.offsetParent!==null&&s.textContent.includes('相册封面'));
  if(!del||!sec) return null;
  return { delTop: Math.round(del.getBoundingClientRect().top), secTop: Math.round(sec.getBoundingClientRect().top), below: sec.getBoundingClientRect().top > del.getBoundingClientRect().top };
})()`)
check('憨憨封面在底部（删除按钮之后）', coverPos && coverPos.below, JSON.stringify(coverPos))

// ── 7) 倒数日 sticky 吸顶 ──
await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('倒数日'));const b=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('倒数日'));if(b)b.click();return !!b})()`)
await sleep(800)
const cdSticky = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(d=>d.offsetParent!==null&&d.className.includes('sticky')&&d.textContent.includes('期待')&&d.textContent.includes('足迹'));return !!el})()`)
check('倒数日页 sticky 吸顶', cdSticky)

console.log('\n通过:'); pass.forEach(p => console.log('  ✔', p))
if (fail.length) { console.log('\n失败:'); fail.forEach(f => console.log('  ✘', f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
ws.close(); chrome.kill()
process.exit(fail.length ? 1 : 0)
