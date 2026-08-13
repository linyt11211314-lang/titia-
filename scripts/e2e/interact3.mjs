// 空间页 v5 验证：左侧导航栏常驻 + 右侧内嵌完整模块页（非预览、无跳转）
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'

const PORT = 9336
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=393,852', '--user-data-dir=/tmp/cdp-i3', `${BASE}/#/space`,
], { stdio: 'ignore' })
await sleep(3000)

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))

let id = 0
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const myId = ++id
    const onMsg = (e) => {
      const m = JSON.parse(e.data)
      if (m.id === myId) { ws.removeEventListener('message', onMsg); resolve(m.result) }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception))
  return r.result.value
}

const pass = [], fail = []
const check = (n, ok, extra = '') => (ok ? pass : fail).push(n + (extra ? ` (${extra})` : ''))

const RAIL = `document.querySelector('nav.border-r')`
const clickRail = (label) => ev(`
  (() => {
    const b = [...${RAIL}.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(label)}));
    if (!b) throw new Error('侧栏无: ' + ${JSON.stringify(label)});
    b.click();
  })()`)

// 等待页面导航完成（线上加载慢时避免在 about:blank 上下文操作 IndexedDB）
{
  const t0 = Date.now()
  let ready = false
  while (Date.now() - t0 < 25000) {
    ready = await ev(`location.href.startsWith(${JSON.stringify(BASE)}) && document.readyState === 'complete'`)
    if (ready) break
    await sleep(300)
  }
  if (!ready) throw new Error('页面就绪等待超时: ' + BASE)
  await sleep(800)
}

// 清库 + 种数据
await ev(`
(async () => {
  const req = indexedDB.open('titia');
  const db = await new Promise(r => { req.onsuccess = () => r(req.result) });
  const now = Date.now();
  const base = (id, dt=0) => ({ id, createdAt: now+dt, updatedAt: now, deletedAt: null, _dirty: 0, _syncedAt: null });
  const clear = s => new Promise(res => { const tx = db.transaction(s,'readwrite'); tx.objectStore(s).clear(); tx.oncomplete=res });
  const put = (s, rows) => new Promise(res => { const tx = db.transaction(s,'readwrite'); rows.forEach(r=>tx.objectStore(s).put(r)); tx.oncomplete=res });
  for (const s of ['pets','cycles','shopping','petHealth','vaultMeta','vaultItems']) await clear(s);
  await put('pets', [{ ...base('p1'), name:'橘座', breed:'橘猫', gender:'boy', birthday:'2023-04-01', order:0 }]);
  await put('cycles', [{ ...base('c1'), startDate:'2026-07-05', endDate:'2026-07-10' }]);
  await put('shopping', [{ ...base('s1'), name:'猫粮', bought:false, order: now }]);
  db.close();
})()`)
await ev(`location.hash='#/space'; location.reload()`)
await sleep(2800)
await ev(`window.__errs=[]; addEventListener('error',e=>__errs.push(e.message)); addEventListener('unhandledrejection',e=>__errs.push('rej:'+e.reason));`)

// 1) 侧栏 4 项
check('侧栏 4 项存在', await ev(`
  ['购物','周期','憨憨','密码'].every(t => ${RAIL}.textContent.includes(t))`),
  await ev(`[...${RAIL}.querySelectorAll('button')].map(b=>b.textContent.trim()).join('|')`))

// 2) 默认显示购物完整页（有输入框 + 想买分组，而非速用预览）
check('默认内嵌购物完整页', await ev(`
  !!document.querySelector('input[placeholder="想买点什么…"]') && document.body.innerText.includes('想买')`))

// 3) 逐个切换：hash 不变（不跳转）+ 侧栏仍在 + 右侧是完整模块页
const cases = [
  ['周期', ['本次周期', '预计下次', '日', '一']],
  ['憨憨', ['我的憨憨', '橘座']],
  ['密码', ['密码箱', '设置主密码']],
  ['购物', ['购物清单', '想买']],
]
for (const [label, expects] of cases) {
  await clickRail(label)
  await sleep(700)
  const hash = await ev(`location.hash`)
  const txt = await ev(`document.body.innerText`)
  const railStill = await ev(`!!${RAIL} && ${RAIL}.getBoundingClientRect().width > 0`)
  check(`切「${label}」不跳转（hash 保持 #/space）`, hash === '#/space', hash)
  check(`切「${label}」侧栏仍常驻`, railStill)
  check(`切「${label}」右侧为完整模块页`, expects.every((e) => txt.includes(e)),
    expects.filter((e) => !txt.includes(e)).join(',') || 'ok')
}

// 4) 选中态高亮
await clickRail('憨憨'); await sleep(600)
check('侧栏有选中态标记', await ev(`
  [...${RAIL}.querySelectorAll('button')].some(b => b.getAttribute('aria-current') === 'page' && b.textContent.includes('憨憨'))`))

// 5) 内嵌页操作可用：憨憨「编辑」按钮存在（原 NavBar right 未丢失）
check('内嵌保留原 NavBar 操作（憨憨-编辑）', await ev(`
  [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '编辑')`))

// 6) 内嵌页无重复 NavBar（不应出现返回键）
check('内嵌页无重复 NavBar 返回键', await ev(`
  !document.querySelector('nav.border-r')?.parentElement?.parentElement?.querySelector('header button[aria-label="返回"]')`))

// 7) 周期内嵌「记录」按钮可用 → 打开 Sheet
await clickRail('周期'); await sleep(600)
check('内嵌保留原 NavBar 操作（周期-记录）', await ev(`
  [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '记录')`))
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='记录').click()`)
await sleep(600)
check('周期-记录可打开表单', await ev(`document.body.innerText.includes('本次开始日期')`))
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='取消')?.click()`)
await sleep(400)

// 8) 购物内嵌可真实新增
await clickRail('购物'); await sleep(600)
await ev(`
(() => {
  const inp = document.querySelector('input[placeholder="想买点什么…"]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(inp, '猫罐头'); inp.dispatchEvent(new Event('input',{bubbles:true}));
})()`)
await sleep(200)
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='加').click()`)
await sleep(800)
check('内嵌购物可真实新增', await ev(`document.body.innerText.includes('猫罐头')`))

// 9) 切走再切回，数据仍在（store 是全局的）
await clickRail('密码'); await sleep(500)
await clickRail('购物'); await sleep(700)
check('切走切回数据保持', await ev(`document.body.innerText.includes('猫罐头')`))

// 10) 右侧滚动时侧栏保持可见
check('右侧滚动侧栏常驻', await ev(`
  (() => {
    const nav = ${RAIL};
    const right = nav.nextElementSibling;
    right.scrollTop = 9999;
    const r = nav.getBoundingClientRect();
    return r.width > 0 && r.top < window.innerHeight;
  })()`))

// 11) 无速用区残留
check('无「速用区」残留文案', await ev(`
  !document.body.innerText.includes('左边直接进，右边直接用') && !document.body.innerText.includes('常用的都在这儿')`))

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('/tmp/space-v5.png', Buffer.from(shot.data, 'base64'))

const errs = await ev(`(window.__errs||[]).join(' | ')`)
console.log('\n通过:'); pass.forEach(p => console.log('  ✔', p))
if (fail.length) { console.log('\n失败:'); fail.forEach(f => console.log('  ✘', f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
if (errs) console.log('运行时错误:', errs)

ws.close(); chrome.kill()
