// 底部 TabBar 顺序验证：首页 / 空间 / [+] / 日记·关系 / 我的
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9341
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=393,852', `${BASE}/#/home`,
], { stdio: 'ignore' })
await sleep(3500)

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

await ev(`window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message)));`)
await sleep(600)

const pass = [], fail = []
const check = (n, ok, extra = '') => (ok ? pass : fail).push(n + (extra ? ` (${extra})` : ''))

// 底部 TabBar = 定位在底部、含药丸容器的那个 nav（排除空间页 border-r 侧栏）
const BAR = `document.querySelector('nav.absolute.bottom-0')`

// 1. 顺序（5 个 Tab，中间为小账）
const order = await ev(`[...${BAR}.querySelectorAll('button')].map(b => b.textContent.trim())`)
check('Tab 顺序为 今日/小窝/小账/时光/我呀',
  JSON.stringify(order) === JSON.stringify(['今日', '小窝', '小账', '时光', '我呀']),
  order.join(' | '))

// 2. 小账与其他 tab 统一样式（不放大不突出）
check('小账 tab 统一样式（无放大主色药丸）',
  await ev(`(()=>{const b=[...${BAR}.querySelectorAll('button')].find(x=>x.textContent.trim()==='小账');return !!b&&!b.className.includes('bg-primary')&&b.className.includes('w-[60px]')})()`))

// 3. 逐个点击，验证跳对页面
const clickTab = (label) => ev(`
  (() => {
    const b = [...${BAR}.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(label)});
    if (!b) throw new Error('无此 tab: ' + ${JSON.stringify(label)});
    b.click();
  })()`)

for (const [label, hash, marker] of [
  ['小账', '#/book', null],
  ['小窝', '#/space', 'nav.border-r'],
  ['时光', '#/journal', null],
  ['我呀', '#/mine', null],
  ['今日', '#/', null],
]) {
  await clickTab(label)
  await sleep(700)
  const h = await ev(`location.hash`)
  check(`点「${label}」→ ${hash}`, h === hash, h)
  if (marker) {
    const has = await ev(`!!document.querySelector('${marker}')`)
    check(`点「${label}」渲染对应页面`, has)
  }
}

// 4. 高亮跟随（当前在首页）
const activeLabel = await ev(`
  (() => {
    const on = [...${BAR}.querySelectorAll('button')].filter(b => {
      const sq = b.querySelector('span');
      return sq && sq.className.includes('bg-primary-soft');
    });
    return on.map(b => b.textContent.trim());
  })()`)
check('选中态唯一且正确（今日）',
  activeLabel.length === 1 && activeLabel[0] === '今日', activeLabel.join(','))

// 5. 进模块页后 TabBar 隐藏（下滑）
await ev(`location.hash = '#/shopping'`)
await sleep(800)
const hidden = await ev(`(${BAR}).style.transform`)
check('进模块页 TabBar 下滑隐藏', hidden.includes('160%'), hidden)
await ev(`history.back()`)
await sleep(700)

const errs = await ev(`window.__errs`)
check('无运行时错误', errs.length === 0, errs.join(';'))

console.log('\n通过:')
pass.forEach((p) => console.log('  ✔ ' + p))
if (fail.length) { console.log('\n失败:'); fail.forEach((f) => console.log('  ✘ ' + f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)

ws.close(); chrome.kill()
process.exit(fail.length ? 1 : 0)
