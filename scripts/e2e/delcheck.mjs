// 小账账单删除能力验证（需求六/七/八）：
// ① 删除支出账单 → 账户余额恢复（回滚）
// ② 删除收入账单 → 账户余额扣除
// ③ 批量删除（编辑/管理模式多选 → 删除选中）→ 余额同步恢复
// ④ 删除一键拾光账单 → 关联图片附件同步清理（无孤立图片）
import { spawn } from 'node:child_process'
import dayjs from 'dayjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9539
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-delchk',
  `${BASE}/#/book`], { stdio: 'ignore' })
await sleep(5000)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return {err:r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails.exception)};return r.result.value}
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const clickBtnIn=txt=>ev(`(()=>{const all=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));const el=all[all.length-1];if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
const setAcc=(name)=>ev(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent!==null&&[...x.options].some(o=>o.textContent.includes(${JSON.stringify(name)})));if(!s)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(s,${JSON.stringify(name)});s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
const accBalance=(name)=>ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('accounts').objectStore('accounts').getAll();t.onsuccess=()=>{const a=(t.result||[]).find(x=>x.name===${JSON.stringify(name)});res(a?a.balance:'none')}}})`)
// 点账单卡片上的「删除」按钮（账单行现为原生 button[data-bill-id]，兼容 Card role="button"）
const delBtn=(name)=>ev(`(()=>{const card=[...document.querySelectorAll('[role="button"],button[data-bill-id]')].find(x=>x.offsetParent!==null&&x.textContent.includes(${JSON.stringify(name)}));if(!card)return false;const btn=[...card.querySelectorAll('button')].find(b=>b.offsetParent!==null&&b.textContent.trim()==='删除');if(btn){btn.click();return true}return false})()`)

// 清理四表（可重复执行）
await ev(`localStorage.removeItem('titia.pendingTx')`)
await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;if(![...db.objectStoreNames].includes('transactions')){res('no');return}const tx=db.transaction(['transactions','rules','accounts','categories','budgets','media'],'readwrite');['transactions','rules','accounts','categories','budgets','media'].forEach(n=>{try{tx.objectStore(n).clear()}catch{}});tx.oncomplete=()=>res('ok')}})`)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1500)

// ═══ ① 准备：设支付宝余额 1000 + 记支出 200 / 收入 500 ═══
await clickBtn('资产'); await sleep(700)
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('支付宝'));if(card)card.click();return !!card})()`)
await sleep(700)
await clickBtn('编辑'); await sleep(600)
await setInput('如 3000','1000'); await sleep(300)
await clickBtn('保存'); await sleep(800)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='‹');if(b)b.click();return !!b})()`)
await sleep(400)
// 支出 200（支付宝）
await clickBtn('首页'); await sleep(500)
await clickBtn('记一笔'); await sleep(600)
await setInput('如 26.8','200'); await sleep(100)
await setInput('如 海底捞','回滚测试早餐'); await sleep(100)
await setAcc('支付宝'); await sleep(200)
await clickBtn('保存'); await sleep(800)
// 收入 500（支付宝）
await clickBtn('记一笔'); await sleep(600)
await clickBtnIn('收入'); await sleep(200)
await setInput('如 26.8','500'); await sleep(100)
await setInput('如 海底捞','回滚测试工资'); await sleep(100)
await setAcc('支付宝'); await sleep(200)
await clickBtn('保存'); await sleep(800)
check('准备：支出+收入后支付宝余额 1300', (await accBalance('支付宝'))===130000, String(await accBalance('支付宝')))

// ═══ ② 单笔删除：删除支出 → 余额恢复 1500（1300+200） ═══
await clickBtn('账单'); await sleep(600)
await delBtn('回滚测试早餐'); await sleep(700)
check('单笔删除确认弹窗', await bodyHas('删除账单'))
await clickBtn('确认'); await sleep(1000)
check('删除支出后余额恢复 1500', (await accBalance('支付宝'))===150000, String(await accBalance('支付宝')))
check('删除后账单消失', !(await bodyHas('回滚测试早餐')))

// ═══ ③ 单笔删除收入 → 余额扣除（1500-500=1000） ═══
await delBtn('回滚测试工资'); await sleep(700)
await clickBtn('确认'); await sleep(1000)
check('删除收入后余额扣除（恢复 1000）', (await accBalance('支付宝'))===100000, String(await accBalance('支付宝')))

// ═══ ④ 批量删除：记 3 笔 → 编辑模式多选 → 删除选中 → 余额恢复 ═══
await clickBtn('首页'); await sleep(500)
for (const [amt, name] of [['30','批量早餐'],['45','批量咖啡'],['60','批量外卖']]) {
  await clickBtn('记一笔'); await sleep(600)
  await setInput('如 26.8', amt); await sleep(100)
  await setInput('如 海底捞', name); await sleep(100)
  await setAcc('支付宝'); await sleep(200)
  await clickBtn('保存'); await sleep(800)
}
check('批量准备：3 笔支出后余额 865（1000-135）', (await accBalance('支付宝'))===86500, String(await accBalance('支付宝')))
await clickBtn('账单'); await sleep(600)
check('账单页出现「编辑」入口', await bodyHas('编辑'))
await clickBtn('编辑'); await sleep(500)
check('管理模式出现「删除选中」', await bodyHas('删除选中'))
await clickBtn('全选'); await sleep(300)
check('全选 3 笔', await bodyHas('已选 3 笔'))
await clickBtn('删除选中'); await sleep(700)
check('批量删除确认弹窗', await bodyHas('删除选中账单'))
await clickBtn('确认'); await sleep(1200)
check('批量删除后余额恢复 1000', (await accBalance('支付宝'))===100000, String(await accBalance('支付宝')))
check('批量删除后回到正常模式（记一笔可用）', await bodyHas('记一笔'))
check('批量删除后账单已清（无批量早餐）', !(await bodyHas('批量早餐')))

// ═══ ⑤ 附件清理（需求八）：一键拾光账单带附件 → 删除 → 附件同步软删 ═══
// 直接构造：账单 + 关联 media 行（模拟一键拾光保存的截图附件）
await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction(['transactions','media'],'readwrite');const now=Date.now();tx.objectStore('transactions').put({id:'attach-tx-1',amount:8800,txType:'expense',merchant:'附件测试账单',category:'午餐',account:'微信',time:'2026-08-06T12:00',source:'shortcut',mediaIds:['attach-media-1'],createdAt:now,updatedAt:now,deletedAt:null,_dirty:1,_syncedAt:null});tx.objectStore('media').put({id:'attach-media-1',blob:new Blob(['x']),thumb:new Blob(['x']),mime:'image/png',width:10,height:10,size:1,createdAt:now,updatedAt:now,deletedAt:null,_dirty:1,_syncedAt:null});tx.oncomplete=()=>res('ok')}})`)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1200)
await clickBtn('账单'); await sleep(600)
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"],button[data-bill-id]')].find(x=>x.offsetParent!==null&&x.textContent.includes('附件测试账单'));if(!card)return false;const btn=[...card.querySelectorAll('button')].find(b=>b.offsetParent!==null&&b.textContent.trim()==='删除');if(btn)btn.click();return !!btn})()`)
await sleep(700)
await clickBtn('确认'); await sleep(900)
const mediaRow = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('media').objectStore('media').get('attach-media-1');t.onsuccess=()=>{const r=t.result;res(r?JSON.stringify({deletedAt:r.deletedAt}):'none')}}})`)
check('删除账单后附件已软删（无孤立图片）', mediaRow==='none'||(JSON.parse(mediaRow).deletedAt>0), String(mediaRow))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
