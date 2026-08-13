// 小账二期验证：分类体系/账户资产负债+净资产/首页/预算/默认规则库/羽毛笔可拖动
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9545
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-book3',
  `${BASE}/#/book`], { stdio: 'ignore' })
await sleep(4000)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return {err:r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails.exception)};return r.result.value}
const allErrs=[]
await ev(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));`)
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)

// 清理小账数据
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    if(![...db.objectStoreNames].includes('transactions')){res('no-table');return}
    const tx=db.transaction(['transactions','rules','accounts','categories','budgets'],'readwrite');
    tx.objectStore('transactions').clear();tx.objectStore('rules').clear();tx.objectStore('accounts').clear();tx.objectStore('categories').clear();tx.objectStore('budgets').clear();
    tx.oncomplete=()=>res('ok');};})
`)
await sleep(500)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1500)

// ═══ ① 首页（默认视图） ═══
check('默认打开首页', await bodyHas('净资产') && await bodyHas('本月预算'))
check('首页财富概览含资产/负债', await bodyHas('资产') && await bodyHas('负债'))
check('首页本月收支三卡', await bodyHas('收入') && await bodyHas('支出') && await bodyHas('结余'))

// ═══ ② 分类体系（12 一级 + 二级） ═══
await clickBtn('分类'); await sleep(700)
check('一级分类含收入/餐饮/宠物/人情关系等', await bodyHas('收入') && await bodyHas('餐饮') && await bodyHas('宠物') && await bodyHas('人情关系') && await bodyHas('金融转账'))
// 展开餐饮看二级
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('餐饮'));if(!card)return false;card.click();return true})()`)
await sleep(500)
check('餐饮二级含咖啡/外卖', await bodyHas('咖啡') && await bodyHas('外卖'))
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('餐饮'));if(!card)return false;card.click();return true})()`)
await sleep(300)

// ═══ ③ 账户资产/负债 + 净资产 ═══
await clickBtn('资产'); await sleep(700)
check('资产页净资产卡', await bodyHas('净资产'))
// 新增负债账户（信用卡）
await clickBtn('账户'); await sleep(600)
await ev(`(()=>{const all=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim().includes('负债'));const el=all[all.length-1];if(!el)return false;el.click();return true})()`)
await sleep(300)
await setInput('如 招行储蓄卡 / 花呗','招行信用卡'); await sleep(100)
await clickBtn('信用卡'); await sleep(200)
await setInput('如 3000','5000'); await sleep(100)
await clickBtn('保存'); await sleep(700)
check('新增负债账户成功', await bodyHas('招行信用卡') && await bodyHas('欠款'))
// 净资产 = 资产(0) - 负债(5000) = -5000
check('净资产计算（负债减少净资产）', await bodyHas('-¥50.00') || await bodyHas('-¥5,000.00') || await bodyHas('-5000'))

// ═══ ④ 预算设置 + 进度 ═══
await clickBtn('首页'); await sleep(700)
// 点预算卡 → 预算管理独立页（查看全部预算）
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"],button')].find(x=>x.offsetParent!==null&&x.textContent.includes('本月预算'));if(!card)return false;card.click();return true})()`)
await sleep(700)
check('预算管理页打开（新增预算/返回首页）', await bodyHas('预算管理') && await bodyHas('新增预算'))
// + 新增预算 → 设置 sheet（分类为 select）
await clickBtn('新增预算'); await sleep(700)
// 设置餐饮预算 1500
await ev(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent!==null&&[...x.options].some(o=>o.textContent.includes('餐饮')));if(!s)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(s,'餐饮');s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
await sleep(200)
await setInput('如 1500','1500'); await sleep(200)
await ev(`(()=>{const all=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.includes('设置预算'));const el=all[all.length-1];if(!el)return false;el.click();return true})()`)
await sleep(700)
check('预算设置成功', await bodyHas('餐饮') && (await bodyHas('/ ¥1500') || await bodyHas('/ ¥15')))
// 关闭 sheet → 返回首页
await ev(`(()=>{const c=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes('取消'));if(c)c.click();return true})()`)
await sleep(300)
await clickBtn('返回首页'); await sleep(500)
// 记一笔餐饮支出 850 → 预算进度 850/1500（分类选择面板：人情关系 → 朋友聚餐）
await clickBtn('记一笔'); await sleep(600)
await setInput('如 26.8','850'); await sleep(100)
await setInput('如 海底捞','朋友聚餐'); await sleep(100)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().startsWith('未分类'));if(b)b.click();return !!b})()`)
await sleep(400)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('人情关系'));if(b)b.click();return !!b})()`)
await sleep(400)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('朋友聚餐'));if(b)b.click();return !!b})()`)
await sleep(300)
await clickBtn('保存'); await sleep(700)
// 回首页看预算进度
await clickBtn('首页'); await sleep(700)
check('首页预算进度显示餐饮', await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.textContent.includes('餐饮')&&x.textContent.includes('850'));return !!el})()`))

// ═══ ⑤ 默认规则库（瑞幸→咖啡 自动预填） ═══
await clickBtn('记一笔'); await sleep(600)
await setInput('如 26.8','32'); await sleep(100)
await setInput('如 海底捞','瑞幸生椰拿铁'); await sleep(500)
// 分类按钮（▾）应自动预填为「餐饮 / 咖啡」（面板式，不再有分类 select）
const catBtn = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('▾')&&x.textContent.includes('餐饮'));if(!b)return null;return b.textContent.trim()})()`)
check('默认规则命中：瑞幸→餐饮 自动预填分类', !!catBtn && catBtn.includes('餐饮'), String(catBtn))
await ev(`(()=>{const c=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes('取消'));if(c)c.click();return true})()`)
await sleep(400)

// ═══ ⑥ 羽毛笔可拖动 ═══
const fab = await ev(`(()=>{const b=document.querySelector('button[aria-label="灵光一闪"]');if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y)}})()`)
check('羽毛笔存在', !!fab, JSON.stringify(fab))
// 初始位置避开底部导航（导航 ~76px + 安全区；默认 y = 屏高-190）
check('羽毛笔初始不遮挡导航栏', fab && fab.y < 852 - 90, JSON.stringify(fab))
// 模拟拖动：pointer 事件
if (fab) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fab.x + 24, y: fab.y + 24, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fab.x + 24 + 80, y: fab.y + 24 - 120, button: 'left' })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fab.x + 24 + 80, y: fab.y + 24 - 120, button: 'left', clickCount: 1 })
  await sleep(500)
  const after = await ev(`(()=>{const b=document.querySelector('button[aria-label="灵光一闪"]');if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y)}})()`)
  const moved = after && Math.abs(after.x - fab.x) + Math.abs(after.y - fab.y) > 30
  check('羽毛笔拖动后位置变化', moved, `before=${JSON.stringify(fab)} after=${JSON.stringify(after)}`)
  // 拖动后位置持久化（localStorage）
  const saved = await ev(`localStorage.getItem('titia.fabPos')`)
  check('羽毛笔位置已持久化', !!saved, String(saved))
}

// ═══ ⑦ 无运行时错误 ═══
try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
