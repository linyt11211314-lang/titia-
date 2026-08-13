// 数据同步架构验证（Local First + Sync Ready）：
// ① Safari 容器写入（经 DataService 桥 localStorage 'titia.pendingTx'）→ PWA 打开自动合并入库
// ② PWA 新增账单 → 保存正常
// ③ 重新打开页面 → 数据不丢失
// ④ 历史数据正常显示与编辑
// ⑤ 已有账单字段含义不变（金额/分类/账户/时间原样）
import { spawn } from 'node:child_process'
import dayjs from 'dayjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9577
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-sync',
  `${BASE}/#/book`], { stdio: 'ignore' })
await sleep(4000)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return {err:String(r.exceptionDetails.exception?.description||'')};return r.result.value}
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)

// 清理小账四表 + 桥（可重复执行）
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    const names=[...db.objectStoreNames];
    if(!names.includes('transactions')){res('no');return}
    const tx=db.transaction(['transactions','rules','accounts','categories','budgets'],'readwrite');
    ['transactions','rules','accounts','categories','budgets'].forEach(n=>tx.objectStore(n).clear());
    tx.oncomplete=()=>res('ok');};})
`)
await ev(`localStorage.removeItem('titia.pendingTx')`)
await ev(`localStorage.removeItem('titia.editTxId')`)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1500)

// ═══ ① Safari 容器新增账单 → 写入跨容器桥（Safari 侧同样经 DataService 写同一 key） ═══
const now = Date.now()
const safariTx = {
  id: 'safari-tx-001', amount: 2680, txType: 'expense', merchant: 'Safari咖啡', category: '咖啡',
  account: '微信', time: dayjs().format('YYYY-MM-DDTHH:mm'), source: 'shortcut',
  createdAt: now, updatedAt: now, deletedAt: null, _dirty: 1, _syncedAt: null,
}
await ev(`localStorage.setItem('titia.pendingTx', ${JSON.stringify(JSON.stringify(safariTx))})`)
check('Safari 写入桥后数据存在（localStorage 待同步）', await ev(`!!localStorage.getItem('titia.pendingTx')`))
// PWA 重新打开（reload 触发 App 启动 mergePendingBills 合并入库）
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1200)
await clickBtn('账单'); await sleep(600)
check('PWA 打开后自动合并 Safari 账单（显示 Safari咖啡）', await bodyHas('Safari咖啡'))
// 桥已消费清空
check('合并后桥已清空（不重复合并）', await ev(`!localStorage.getItem('titia.pendingTx')`))
// 数据库字段原样（金额 2680 分 / 分类 咖啡 / 账户 微信 / source shortcut）
const dbRow = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction('transactions').objectStore('transactions').get('safari-tx-001');tx.onsuccess=()=>{const r=tx.result;res(r?JSON.stringify({amount:r.amount,merchant:r.merchant,category:r.category,account:r.account,source:r.source}):'none')}}})`)
check('合并账单字段含义不变（金额/分类/账户/来源原样）', dbRow==='{"amount":2680,"merchant":"Safari咖啡","category":"咖啡","account":"微信","source":"shortcut"}', String(dbRow))

// ═══ ② PWA 新增账单 → 保存正常 ═══
await clickBtn('首页'); await sleep(500)
await clickBtn('记一笔'); await sleep(700)
await setInput('如 26.8','66.6'); await sleep(100)
await setInput('如 海底捞','PWA超市'); await sleep(100)
await clickBtn('保存'); await sleep(900)
await clickBtn('账单'); await sleep(600)
check('PWA 新增账单保存成功', await bodyHas('PWA超市'))
const pwaRow = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction('transactions').objectStore('transactions').getAll();tx.onsuccess=()=>{const r=(tx.result||[]).find(x=>x.merchant==='PWA超市');res(r?JSON.stringify({amount:r.amount,merchant:r.merchant}):'none')}}})`)
check('PWA 账单已写入 IndexedDB（金额 6660 分）', pwaRow==='{"amount":6660,"merchant":"PWA超市"}', String(pwaRow))

// ═══ ③ 重新打开页面 → 数据不丢失 ═══
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1200)
await clickBtn('账单'); await sleep(600)
check('重新打开后 Safari 账单仍在', await bodyHas('Safari咖啡'))
check('重新打开后 PWA 账单仍在', await bodyHas('PWA超市'))

// ═══ ④ 历史数据正常显示与编辑 ═══
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"],button[data-bill-id]')].find(x=>x.offsetParent!==null&&x.textContent.includes('Safari咖啡'));if(card)card.click();return !!card})()`)
await sleep(700)
await setInput('如 26.8','30'); await sleep(100)
await clickBtn('保存'); await sleep(800)
check('历史账单编辑成功（金额改为 30.00）', await bodyHas('Safari咖啡') && await bodyHas('¥30.00'))
const edited = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction('transactions').objectStore('transactions').get('safari-tx-001');tx.onsuccess=()=>{const r=tx.result;res(r?String(r.amount):'none')}}})`)
check('编辑后字段落库（金额 3000 分）', edited==='3000', String(edited))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
