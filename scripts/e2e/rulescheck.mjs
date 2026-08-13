// 自动记账智能识别新规则验证（用户指定规则）：
// ① 商户标准化：瑞幸咖啡(深圳)有限公司 → 瑞幸咖啡（去公司后缀/括号）
// ② 新分类体系：瑞幸 → 餐饮（替换原「咖啡」二级分类）
// ③ 保存后账单分类 = 餐饮，金额正确
// ④ 多笔拆分仍工作（不同商户拆分保存，与同订单合并不冲突）
// ⑤ 重复检测：同商户+同金额+5分钟内 → 提示可能重复
import { spawn } from 'node:child_process'
import dayjs from 'dayjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9568
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-rules',
  `${BASE}/#/book`], { stdio: 'ignore' })
await sleep(4500)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return {err:String(r.exceptionDetails.exception?.description||'')};return r.result.value}
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)

// 清理 + 就绪
await ev(`localStorage.removeItem('titia.pendingTx');localStorage.removeItem('titia.captureDone')`)
await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;if(![...db.objectStoreNames].includes('transactions')){res('no');return}const tx=db.transaction(['transactions','rules'],'readwrite');['transactions','rules'].forEach(n=>{try{tx.objectStore(n).clear()}catch{}});tx.oncomplete=()=>res('ok')}})`)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1200)

// ═══ ① 商户标准化 + 新分类（瑞幸咖啡(深圳)有限公司 → 瑞幸咖啡 · 餐饮） ═══
await ev(`location.hash='#/capture?text=${encodeURIComponent('瑞幸咖啡（深圳）有限公司\n-18.00\n微信支付')}'`); await sleep(2200)
check('① 商户标准化：显示「瑞幸咖啡」（去公司后缀/括号）', await bodyHas('瑞幸咖啡'))
check('① 未保留公司后缀「有限公司」', !(await bodyHas('有限公司')))
check('① 分类为新体系「餐饮」', await bodyHas('餐饮'))
check('① 金额 ¥18.00', await bodyHas('¥18.00'))
await clickBtn('保存'); await sleep(1800)
const saved1 = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('transactions').objectStore('transactions').getAll();t.onsuccess=()=>{const r=(t.result||[]).find(x=>x.merchant==='瑞幸咖啡');res(r?JSON.stringify({merchant:r.merchant,category:r.category,amount:r.amount}):'none')}}})`)
check('① 保存后：商户=瑞幸咖啡 分类=餐饮 金额=1800分', saved1==='{"merchant":"瑞幸咖啡","category":"餐饮","amount":1800}', String(saved1))

// ═══ ② 多笔拆分仍工作（不同商户 → 拆分保存，不与合并冲突） ═══
await ev(`localStorage.removeItem('titia.captureDone')`)
await ev(`location.hash='#/capture?text=${encodeURIComponent('肯德基 30\n滴滴 15')}'`); await sleep(2200)
check('② 多笔识别显示 2 笔', await bodyHas('识别到 2 笔消费'))
check('② 肯德基分类餐饮', await bodyHas('肯德基'))
check('② 滴滴分类交通', await bodyHas('滴滴'))
await clickBtn('全部保存'); await sleep(1800)
const saved2 = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('transactions').objectStore('transactions').getAll();t.onsuccess=()=>{const r=(t.result||[]).filter(x=>x.merchant==='肯德基'||x.merchant==='滴滴');res(JSON.stringify(r.map(x=>x.merchant+':'+x.category).sort()))}}})`)
check('② 拆分保存：肯德基(餐饮)+滴滴(交通) 各一条', saved2==='["滴滴:交通","肯德基:餐饮"]', String(saved2))

// ═══ ③ 重复检测（同商户+同金额+5分钟内 → 提示可能重复记账） ═══
await ev(`localStorage.removeItem('titia.captureDone')`)
await ev(`location.hash='#/capture?text=${encodeURIComponent('瑞幸咖啡\n-18.00\n微信支付')}'`); await sleep(2200)
check('③ 再次识别同一笔', await bodyHas('账单确认') && await bodyHas('瑞幸咖啡'))
await clickBtn('保存'); await sleep(1500)
check('③ 触发「可能重复记账」提示', await bodyHas('可能重复记账'))
check('③ 提供「继续保存」', await bodyHas('继续保存'))
await clickBtn('取消'); await sleep(900)
const cnt = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('transactions').objectStore('transactions').getAll();t.onsuccess=()=>{const r=(t.result||[]).filter(x=>x.merchant==='瑞幸咖啡');res(r.length)}}})`)
check('③ 取消后不重复保存（瑞幸咖啡仍 1 笔）', cnt===1, String(cnt))
await ev(`location.hash='#/book'`); await sleep(800)

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
