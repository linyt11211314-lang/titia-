// 角色皮肤系统验证：分组展示 / 换色 / 飘云装饰 / 形状覆盖 / 持久化
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync } from 'node:fs'

// 期望值从源码解析，别硬编码——之前对比度调优改了色值，测试就假红了一次
const SRC = readFileSync('/workspace/src/theme/skins.ts', 'utf8')
function expectPrimary(skinId) {
  const seg = SRC.slice(SRC.indexOf(`id: '${skinId}'`))
  return seg.slice(0, seg.indexOf('dark:')).match(/primary:\s*'(#[0-9a-fA-F]{6})'/)[1].toLowerCase()
}
const CIN_PRIMARY = expectPrimary('cinnamon')

const PORT = 9347
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--window-size=393,852', `${BASE}/#/`,
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
const injectErr = () => ev(`window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message)));`)
await injectErr()
await sleep(500)

const pass = [], fail = []
const check = (n, ok, extra = '') => (ok ? pass : fail).push(n + (extra ? ` (${extra})` : ''))

// ── 1. 主题中心可打开（此前 App.tsx 漏渲染 ThemePage，点进去是空白页）
await ev(`location.hash = '#/theme'`)
await sleep(900)
const themeTitle = await ev(`document.body.innerText.includes('主题中心')`)
check('主题中心页可打开（不再空白）', themeTitle)

const groups = await ev(`
  ['基础色','角色皮肤'].map(t => document.body.innerText.includes(t))`)
check('皮肤分「基础色 / 角色皮肤」两组', groups.every(Boolean), String(groups))

const charCount = await ev(`
  ['cinnamon','kuromi','melody','purin','kitty']
    .filter(k => document.querySelector('[data-skin-option="'+k+'"]')).length`)
check('5 套角色皮肤都在列表里', charCount === 5, `${charCount}/5`)

const cinnamonName = await ev(`
  document.querySelector('[data-skin-option="cinnamon"]').innerText.replace(/\\s+/g,' ').trim()`)
check('玉桂狗卡片含名称与配色说明', cinnamonName.includes('玉桂狗') && cinnamonName.includes('云朵'), cinnamonName)

// ── 2. 基础色皮肤下不应有任何装饰
const clickSkin = (k) => ev(`document.querySelector('[data-skin-option="${k}"]').click()`)
await clickSkin('warm')
await sleep(600)
check('基础色皮肤无飘云层', await ev(`!document.querySelector('[data-skin-backdrop]')`))
check('基础色皮肤无 data-motif 标记', await ev(`!document.documentElement.getAttribute('data-motif')`))
const warmRadius = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--radius-card').trim()`)
check('基础色圆角为 24px', warmRadius === '24px', warmRadius)
const warmPrimary = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()`)

// ── 3. 切玉桂狗：颜色 / 装饰 / 形状 三者都要变
await clickSkin('cinnamon')
await sleep(700)
const cinPrimary = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()`)
check('切玉桂狗后主色改变', cinPrimary !== warmPrimary && cinPrimary.toLowerCase() === CIN_PRIMARY, `${warmPrimary} → ${cinPrimary} (期望 ${CIN_PRIMARY})`)
check('切玉桂狗后 data-motif=cloud', (await ev(`document.documentElement.getAttribute('data-motif')`)) === 'cloud')
check('飘云装饰层已出现', await ev(`!!document.querySelector('[data-skin-backdrop="cloud"]')`))

const cloudCount = await ev(`document.querySelectorAll('[data-skin-backdrop] svg').length`)
check('飘云层含多枚图形', cloudCount >= 8, `${cloudCount} 枚`)

// 关键技术点：--radius-* 原本写死在 @theme inline 里会被内联进工具类，
// 改成两层引用后运行时覆盖才有效。这里验真。
const cinRadius = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--radius-card').trim()`)
check('角色皮肤圆角提升到 28px（形状覆盖生效）', cinRadius === '28px', cinRadius)

const realRadius = await ev(`
  (() => {
    const el = document.querySelector('.rounded-card');
    return el ? getComputedStyle(el).borderRadius : 'none';
  })()`)
check('实际元素圆角确已变化', realRadius.startsWith('28px'), realRadius)

// ── 4. 装饰层绝不能拦点击
const pe = await ev(`getComputedStyle(document.querySelector('[data-skin-backdrop]')).pointerEvents`)
check('飘云层 pointer-events: none', pe === 'none')

const topAtCenter = await ev(`
  (() => {
    const el = document.elementFromPoint(196, 300);
    return el ? !el.closest('[data-skin-backdrop]') : false;
  })()`)
check('页面中心命中的是内容而非装饰层', topAtCenter)

// ── 5. 每套角色皮肤的 motif 各不相同
await ev(`location.hash = '#/theme'`)
await sleep(600)
const motifMap = {}
for (const [k, want] of [['kuromi', 'star'], ['melody', 'flower'], ['purin', 'paw'], ['kitty', 'bow']]) {
  await clickSkin(k)
  await sleep(450)
  const got = await ev(`document.documentElement.getAttribute('data-motif')`)
  motifMap[k] = got
  check(`「${k}」装饰图形为 ${want}`, got === want, got)
}

// ── 6. 空态点缀（购物清单清空后应出现 motif）
await clickSkin('cinnamon')
await sleep(400)
await ev(`
(async () => {
  const req = indexedDB.open('titia');
  const db = await new Promise(r => { req.onsuccess = () => r(req.result) });
  await new Promise(res => { const tx = db.transaction('shopping','readwrite'); tx.objectStore('shopping').clear(); tx.oncomplete=res });
  db.close();
})()`)
await ev(`location.hash = '#/shopping'`)
await sleep(900)
const emptyMotif = await ev(`
  (() => {
    const p = [...document.querySelectorAll('p')].find(x => x.textContent === '清单还是空的');
    if (!p) return 'no-empty';
    const prev = p.previousElementSibling;
    return prev && prev.querySelector('svg') ? 'has-motif' : 'no-motif';
  })()`)
check('空态出现 motif 点缀', emptyMotif === 'has-motif', emptyMotif)

// 模块页也要有飘云（模块页自带 bg-bg 会盖住底层）
check('模块页内飘云层同样存在', await ev(`document.querySelectorAll('[data-skin-backdrop]').length >= 1`))

// 反向验证：切回基础色，同一个空态必须干干净净
await ev(`location.hash = '#/theme'`); await sleep(700)
await clickSkin('warm'); await sleep(400)
await ev(`location.hash = '#/shopping'`); await sleep(900)
const emptyPlain = await ev(`
  (() => {
    const p = [...document.querySelectorAll('p')].find(x => x.textContent === '清单还是空的');
    if (!p) return 'no-empty';
    const prev = p.previousElementSibling;
    return prev && prev.querySelector('svg') ? 'has-motif' : 'clean';
  })()`)
check('基础色皮肤下空态无点缀（克制）', emptyPlain === 'clean', emptyPlain)
await ev(`location.hash = '#/theme'`); await sleep(600)
await clickSkin('cinnamon'); await sleep(400)

// ── 7. 刷新后持久化
await ev(`location.hash = '#/'`)
await sleep(400)
await ev(`location.reload()`)
await sleep(3000)
await injectErr()
const afterReload = await ev(`document.documentElement.getAttribute('data-theme')`)
check('刷新后皮肤保持玉桂狗', afterReload === 'cinnamon', afterReload)
check('刷新后飘云层仍在', await ev(`!!document.querySelector('[data-skin-backdrop]')`))

// ── 8. 深色模式下装饰更淡
await ev(`location.hash = '#/theme'`)
await sleep(700)
const lightOp = await ev(`parseFloat(document.querySelector('[data-skin-backdrop] span').style.opacity)`)
await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '深色').click()`)
await sleep(700)
const darkOp = await ev(`parseFloat(document.querySelector('[data-skin-backdrop] span').style.opacity)`)
check('深色模式装饰透明度更低', darkOp < lightOp, `${lightOp} → ${darkOp}`)
const darkBg = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()`)
check('深色模式底色已切换', darkBg.toLowerCase() === '#0e1820', darkBg)

// 复原
await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '浅色').click()`)
await sleep(400)

const errs = await ev(`window.__errs`)
check('无运行时错误', errs.length === 0, errs.join(';'))

console.log('\n通过:')
pass.forEach((p) => console.log('  ✔ ' + p))
if (fail.length) { console.log('\n失败:'); fail.forEach((f) => console.log('  ✘ ' + f)) }
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)

ws.close(); chrome.kill()
process.exit(fail.length ? 1 : 0)
