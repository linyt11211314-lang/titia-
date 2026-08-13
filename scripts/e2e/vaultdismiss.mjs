// 密码箱「无法解密」提示可手动关闭 验证
// 场景：损坏记录 → 解锁后出现提示 → 点击关闭 → 消失且持久化（重进不再打扰）
//       → 损坏数量变化时重新提醒 → 再次可关闭；数据保留在库不删除。
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'

const PORT = 9328
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const MASTER = 'test-pass-123'

const chrome = spawn('chromium', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=393,852', '--user-data-dir=/tmp/cdp-vd', `${BASE}/#/vault`,
], { stdio: 'ignore' })
// 异常路径也清理浏览器进程，避免残留占用端口（历史偶发失败根因）
process.on('exit', () => { try { chrome.kill() } catch { /* 忽略 */ } })
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
  if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.exception))
  return r.result?.value
}

const pass = [], fail = []
const check = (n, ok, extra = '') => (ok ? pass : fail).push(n + (extra ? ` (${extra})` : ''))

// —— 工具：等待元素出现（线上加载慢时避免时序失败） ——
const waitFor = async (selector, timeout = 15000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await ev(`!!document.querySelector(${JSON.stringify(selector)})`)) return true
    await sleep(300)
  }
  throw new Error('等待超时: ' + selector)
}

// —— 工具：React 受控输入 ——
const setInput = (selector, value) => ev(`
  (() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('找不到输入框: ' + ${JSON.stringify(selector)});
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
const clickBtn = (text) => ev(`
  (() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(text)});
    if (!b) throw new Error('找不到按钮: ' + ${JSON.stringify(text)});
    b.click();
  })()`)
const clickByLabel = (label) => ev(`
  (() => {
    const b = document.querySelector('button[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']') ?? document.querySelector('button[aria-label="${label}"]');
    if (!b) throw new Error('找不到按钮 aria-label: ' + ${JSON.stringify(label)});
    b.click();
  })()`)

// —— 工具：操作 IndexedDB ——
const dbPut = (store, row) => ev(`
  (async () => {
    const req = indexedDB.open('titia');
    const db = await new Promise(r => { req.onsuccess = () => r(req.result); req.onerror = () => r(null) });
    if (!db) throw new Error('无法打开 titia 库');
    const now = Date.now();
    const base = Object.assign({ createdAt: now, updatedAt: now, deletedAt: null, _dirty: 0, _syncedAt: null }, ${JSON.stringify(row)});
    await new Promise(res => { const tx = db.transaction(${JSON.stringify(store)}, 'readwrite'); tx.objectStore(${JSON.stringify(store)}).put(base); tx.oncomplete = res });
    db.close();
    return true;
  })()`)
const dbCount = (store) => ev(`
  (async () => {
    const req = indexedDB.open('titia');
    const db = await new Promise(r => { req.onsuccess = () => r(req.result) });
    const n = await new Promise(res => { const q = db.transaction(${JSON.stringify(store)}, 'readonly').objectStore(${JSON.stringify(store)}).count(); q.onsuccess = () => res(q.result) });
    db.close();
    return n;
  })()`)

// —— 1) 首次进入：创建密码箱 ——
await waitFor('input[placeholder="设置主密码"]')
check('首次显示「设置主密码」', await ev(`document.body.innerText.includes('设置主密码')`))
await setInput('input[placeholder="设置主密码"]', MASTER)
await setInput('input[placeholder="确认主密码"]', MASTER)
await clickBtn('创建密码箱')
await sleep(1200)
check('创建后进入内容页', await ev(`document.body.innerText.includes('已加密保存 · 仅本机')`))

// —— 2) 添加一条正常账号 ——
await ev(`document.querySelector('button[aria-label="添加账号"]')?.click() ?? [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='添加第一个').click()`)
await sleep(700)
await setInput('input[placeholder="如 微信 / Gmail / 银行卡"]', '测试账号')
await setInput('input[placeholder="输入密码"]', 'pwd-abc-001')
await clickBtn('保存')
await sleep(1000)
check('正常账号添加成功', await ev(`document.body.innerText.includes('测试账号')`))
check('此时无损坏提示', await ev(`!document.body.innerText.includes('无法解密')`))

// —— 3) 种入 1 条损坏记录 → 重载 → 解锁 → 提示出现 ——
await dbPut('vaultItems', { id: 'bad1', name: '损坏A', account: 'x', secret: { iv: 'bad', cipher: 'bad' }, note: null })
await ev(`location.reload()`)
await waitFor('input[placeholder="主密码"]')
check('重载后需解锁', await ev(`document.body.innerText.includes('解锁密码箱')`))
await setInput('input[placeholder="主密码"]', MASTER)
await clickBtn('解锁')
await sleep(1200)
check('提示「有 1 条记录无法解密」出现', await ev(`document.body.innerText.includes('有 1 条记录无法解密')`))
check('正常账号仍在', await ev(`document.body.innerText.includes('测试账号')`))
check('关闭按钮存在', await ev(`!!document.querySelector('button[aria-label="关闭提示"]')`))

// —— 4) 点击关闭 → 提示消失，数据保留 ——
await clickByLabel('关闭提示')
await sleep(500)
check('点击关闭后提示消失', await ev(`!document.body.innerText.includes('无法解密')`))
check('账号列表不受影响', await ev(`document.body.innerText.includes('测试账号')`))
check('损坏数据仍保留在库', (await dbCount('vaultItems')) === 2)

// —— 5) 重载 + 解锁：同数量不再打扰（持久化） ——
await ev(`location.reload()`)
await waitFor('input[placeholder="主密码"]')
await setInput('input[placeholder="主密码"]', MASTER)
await clickBtn('解锁')
await sleep(1200)
check('重进后提示不再出现（已关闭持久化）', await ev(`!document.body.innerText.includes('无法解密')`))

// —— 6) 再种 1 条损坏记录（数量变化）→ 重载解锁 → 重新提醒 ——
await dbPut('vaultItems', { id: 'bad2', name: '损坏B', account: 'y', secret: { iv: 'bad2', cipher: 'bad2' }, note: null })
await ev(`location.reload()`)
await waitFor('input[placeholder="主密码"]')
await setInput('input[placeholder="主密码"]', MASTER)
await clickBtn('解锁')
await sleep(1200)
check('损坏数量变化后重新提醒（有 2 条）', await ev(`document.body.innerText.includes('有 2 条记录无法解密')`))
await clickByLabel('关闭提示')
await sleep(400)
check('再次关闭成功', await ev(`!document.body.innerText.includes('无法解密')`))

// —— 7) 清理损坏记录后，正常功能不受影响 ——
await ev(`
  (async () => {
    const req = indexedDB.open('titia');
    const db = await new Promise(r => { req.onsuccess = () => r(req.result) });
    await new Promise(res => { const tx = db.transaction('vaultItems','readwrite'); tx.objectStore('vaultItems').delete('bad1'); tx.objectStore('vaultItems').delete('bad2'); tx.oncomplete = res });
    db.close();
  })()`)
await ev(`location.reload()`)
await waitFor('input[placeholder="主密码"]')
await setInput('input[placeholder="主密码"]', MASTER)
await clickBtn('解锁')
await sleep(1000)
check('清理损坏后无提示', await ev(`!document.body.innerText.includes('无法解密')`))
check('正常账号仍可查看', await ev(`document.body.innerText.includes('测试账号')`))

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('/tmp/vault-dismiss.png', Buffer.from(shot.data, 'base64'))

const errs = await ev(`(window.__errs||[]).join(' | ')`)
console.log('\n通过:'); pass.forEach(p => console.log('  ✔', p))
if (fail.length) { console.log('\n失败:'); fail.forEach(f => console.log('  ✘', f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
if (errs) console.log('运行时错误:', errs)

ws.close(); chrome.kill()
process.exit(fail.length ? 1 : 0)
