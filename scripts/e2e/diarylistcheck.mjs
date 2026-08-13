// 时光页（日记/关系）：分段控制器 + 月份收纳 + 心情筛选 + 详情 + 多图预览 验证
// 场景：顶部居中分段控制器（日记|关系）；列表按月收纳（月份卡片 → 点击进入该月列表）；
//       图片点击全屏预览，多图可左右滑动切换，下滑可收起。
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'

const PORT = 9325
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, '--window-size=393,852', '--user-data-dir=/tmp/cdp-dl', BASE + '/#/journal',
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
const clickTxt = (txt) => ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes(${JSON.stringify(txt)})); if(!b) return false; b.click(); return true })()`)

// —— 种数据：3 条日记（同月不同天；1 条带 2 张图）+ 1 条关系 ——
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
await ev(`
(async () => {
  const req = indexedDB.open('titia');
  const db = await new Promise(r => { req.onsuccess = () => r(req.result) });
  const now = Date.now();
  const base = (id, dt=0) => ({ id, createdAt: now+dt, updatedAt: now, deletedAt: null, _dirty: 0, _syncedAt: null });
  const clear = s => new Promise(res => { const tx = db.transaction(s,'readwrite'); tx.objectStore(s).clear(); tx.oncomplete=res });
  const put = (s, rows) => new Promise(res => { const tx = db.transaction(s,'readwrite'); rows.forEach(r=>tx.objectStore(s).put(r)); tx.oncomplete=res });
  for (const s of ['records','media']) await clear(s);
  const bin = atob('${PNG}');
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/png' });
  await put('media', [
    { ...base('m1'), blob, thumb: blob, mime: 'image/png', width: 1, height: 1, size: blob.size },
    { ...base('m2'), blob, thumb: blob, mime: 'image/png', width: 1, height: 1, size: blob.size },
  ]);
  const d1 = new Date(); d1.setDate(d1.getDate()-1);
  const d2 = new Date(); d2.setDate(d2.getDate()-2);
  const d3 = new Date(); d3.setDate(d3.getDate()-35);
  await put('records', [
    { ...base('r1',1), type:'diary', occurredAt: d1.getTime(), title:'开心的一天', content:'和朋友吃了火锅，好满足。', mediaIds:['m1','m2'], refType:null, refId:undefined, payload:{ mood:'😊', weather:'☀️' }, pinned:false },
    { ...base('r2',2), type:'diary', occurredAt: d2.getTime(), title:'有点低落', content:'项目没通过，难受。', mediaIds:[], refType:null, refId:undefined, payload:{ mood:'😢' }, pinned:false },
    { ...base('r3',3), type:'diary', occurredAt: d3.getTime(), title:'', content:'散步三公里。', mediaIds:[], refType:null, refId:undefined, payload:{ mood:'😌', weather:'⛅' }, pinned:false },
    { ...base('r4',4), type:'relation_touched', occurredAt: d1.getTime(), title:undefined, content:'TA 准备了惊喜', mediaIds:[], refType:null, refId:undefined, payload:{ person:'对象', event:'TA 准备了惊喜', whyMoved:'记得我爱吃的东西' }, pinned:false },
  ]);
  db.close();
})()`)
await ev('location.reload()')
await sleep(3200)

// —— 1) 左侧常驻侧边导航（日记 | 关系） ——
check('左侧侧边导航含「日记」「关系」', await waitFor(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.getBoundingClientRect().width<100&&x.getBoundingClientRect().left<70);return !!n&&n.textContent.includes('日记')&&n.textContent.includes('关系')})()`))
check('顶部无横向分段控制器', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);const segs=bs.filter(b=>b.textContent.trim()==='日记'||b.textContent.trim()==='关系');return segs.length===0||(segs.length>0&&segs[0].parentElement&&!String(segs[0].parentElement.className).includes('rounded-pill'))})()`))

// —— 2) 日记月份收纳：月份卡片出现（当前月 2 条） ——
check('月份卡片出现（当前月）', await waitFor(`document.body.innerText.includes('年 M 月') || document.body.innerText.includes('月')`))
const monthCard = await ev(`(() => {
  const cs=[...document.querySelectorAll('[role="button"]')].filter(x=>x.offsetParent!==null);
  return cs.some(c=>c.textContent.includes('条') && c.textContent.includes('年'));
})()`)
check('月份卡片显示「N 条」', monthCard)
check('月份列表页不显示心情筛选（筛选在月份内）', await ev(`![...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()==='😢')`))

// —— 3) 点击当前月份卡片 → 该月记录列表 ——
const curMonth = await ev(`(() => { const d=new Date(); return d.getFullYear()+' 年 '+(d.getMonth()+1)+' 月' })()`)
await ev(`(() => { const c=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes(${JSON.stringify(curMonth)})); if(!c) return false; c.click(); return true })()`)
await sleep(600)
check('进入当前月子视图（该月记录）', await waitFor(`document.body.innerText.includes('开心的一天') && document.body.innerText.includes('有点低落')`))
check('有返回按钮', await ev(`!!document.querySelector('button[aria-label="返回月份列表"]')`))

// —— 4) 点击记录行 → 详情 Sheet ——
await ev(`(() => { const b=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('开心的一天')); if(!b) return false; b.click(); return true })()`)
await sleep(700)
check('详情 Sheet 打开（编辑/删除按钮）', await ev(`[...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()==='编辑') && [...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()==='删除')`))

// —— 5) 多图预览：打开后显示 1/2，可左右滑动到 2/2 ——
await ev(`document.querySelector('button[aria-label="查看图片"]').click()`)
await sleep(700)
check('预览打开（全屏遮罩）', await ev(`!!document.querySelector('[role="dialog"][aria-label="图片预览"]')`))
check('多图页码提示（1 / 2）', await ev(`document.body.innerText.includes('1 / 2')`))
// 左滑（下一张）：CDP 触摸模拟
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
const dlgRect = await ev(`(() => { const r = document.querySelector('[role="dialog"][aria-label="图片预览"]').getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2) } })()`)
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: dlgRect.x, y: dlgRect.y, id: 0, radiusX: 2, radiusY: 2, force: 1 }] })
await sleep(80)
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: dlgRect.x - 110, y: dlgRect.y, id: 0, radiusX: 2, radiusY: 2, force: 1 }] })
await sleep(80)
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await sleep(500)
check('左滑切到第 2 张（2 / 2）', await ev(`document.body.innerText.includes('2 / 2')`))
// 下滑收起（跟手超过阈值）
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: dlgRect.x, y: dlgRect.y, id: 0, radiusX: 2, radiusY: 2, force: 1 }] })
await sleep(80)
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: dlgRect.x, y: dlgRect.y + 170, id: 0, radiusX: 2, radiusY: 2, force: 1 }] })
await sleep(80)
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await sleep(500)
check('下滑收起预览', await ev(`!document.querySelector('[role="dialog"][aria-label="图片预览"]')`))
check('退出预览后仍在详情', await ev(`document.body.innerText.includes('和朋友吃了火锅')`))
// 关闭详情
await clickTxt('取消'); await sleep(500)
// 返回月份列表
await ev(`document.querySelector('button[aria-label="返回月份列表"]').click()`)
await sleep(500)
check('返回月份列表', await ev(`!document.body.innerText.includes('返回月份列表')`))

// —— 6) 心情筛选：分段控制器置于月份列表内 ——
// 重新进入当前月
await ev(`(() => { const c=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes(${JSON.stringify(curMonth)})); if(!c) return false; c.click(); return true })()`)
await sleep(600)
check('月份子视图内心情分段控制器存在（全部/😊/😢/😌）', await ev(`['全部','😊','😢','😌'].every(t => [...document.querySelectorAll('button')].some(b=>b.offsetParent!==null&&b.textContent.trim()===t))`))
await clickTxt('😢'); await sleep(500)
check('筛选 😢 只显示低落日记', await ev(`document.body.innerText.includes('有点低落') && !document.body.innerText.includes('开心的一天')`))
await clickTxt('全部'); await sleep(400)
check('切回全部恢复显示', await ev(`document.body.innerText.includes('开心的一天')`))
// 返回月份列表
await ev(`document.querySelector('button[aria-label="返回月份列表"]').click()`)
await sleep(400)

// —— 7) 切关系（左侧导航）→ 月份收纳 → 点击月份 → 记录 ——
await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('关系'));const b=[...n.querySelectorAll('button')].find(x=>x.textContent.includes('关系'));if(!b)return false;b.click();return true})()`)
await sleep(800)
check('关系月份卡片出现', await waitFor(`document.body.innerText.includes('TA 准备了惊喜') || [...document.querySelectorAll('[role="button"]')].some(c=>c.offsetParent!==null&&c.textContent.includes('条'))`))
await ev(`(() => { const c=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('条')&&x.textContent.includes('年')); if(!c) return false; c.click(); return true })()`)
await sleep(600)
check('关系该月记录列表显示', await waitFor(`document.body.innerText.includes('TA 准备了惊喜')`))

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('/tmp/diary-month.png', Buffer.from(shot.data, 'base64'))

console.log('\n通过:'); pass.forEach(p => console.log('  ✔', p))
if (fail.length) { console.log('\n失败:'); fail.forEach(f => console.log('  ✘', f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
ws.close(); chrome.kill()
process.exit(fail.length ? 1 : 0)
