// 倒数日时间轴验证：时间轴 tab/月份墙/月历/事件圆点/毛玻璃弹窗/优先级/年份切换
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9555
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-tl',
  `${BASE}/#/space`], { stdio: 'ignore' })
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

// 种数据：足迹 8-3（深圳旅行）、生日 8-15（妈妈生日）、纪念日 12-25（恋爱纪念日）、农历中秋
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    if(![...db.objectStoreNames].includes('countdownEvents')){res('no-table');return}
    const tx=db.transaction('countdownEvents','readwrite');
    const s=tx.objectStore('countdownEvents');
    const now=Date.now();
    s.clear();
    s.put({id:'tl-1',kind:'footprint',title:'深圳旅行',category:'other',dateType:'solar',solarDate:'2026-08-03',avatar:'📍',createdAt:now,updatedAt:now,deletedAt:null,_dirty:1,_syncedAt:null});
    s.put({id:'tl-2',kind:'expected',title:'妈妈生日',category:'family',eventType:'birthday',dateType:'solar',solarDate:'2026-08-15',avatar:'🎂',createdAt:now-1,updatedAt:now-1,deletedAt:null,_dirty:1,_syncedAt:null});
    s.put({id:'tl-3',kind:'expected',title:'恋爱纪念日',category:'partner',eventType:'anniversary',dateType:'solar',solarDate:'2026-12-25',avatar:'💍',createdAt:now-2,updatedAt:now-2,deletedAt:null,_dirty:1,_syncedAt:null});
    s.put({id:'tl-4',kind:'expected',title:'中秋',category:'family',eventType:'other',dateType:'lunar',lunarDate:'八月十五',avatar:'🌕',createdAt:now-3,updatedAt:now-3,deletedAt:null,_dirty:1,_syncedAt:null});
    tx.oncomplete=()=>res('ok');};})
`)
await sleep(500)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/space'`); await sleep(1500)
await clickBtn('倒数日'); await sleep(900)

// ═══ ① 时间轴 tab ═══
check('倒数日出现「时间轴」tab', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);return bs.some(b=>b.textContent.trim()==='时间轴')})()`))
await clickBtn('时间轴'); await sleep(800)
check('时间轴月份墙（12 个月）', await bodyHas('1 月') && await bodyHas('12 月'))
check('默认当年年份显示', await bodyHas(`${new Date().getFullYear()} 年`))
// 8 月有事件圆点（有事件月份显示圆点）
check('8 月卡有事件圆点', await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('8 月'));return !!b&&b.innerHTML.includes('rounded-pill')})()`))
// 农历中秋：9 月应有事件（八月十五→2026-09-25）
const monthHasEvent = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('9 月'));return !!b&&b.innerHTML.includes('rounded-pill')})()`)
check('农历事件换算到当年（9 月有圆点）', monthHasEvent)

// ═══ ② 月历 ═══
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('8 月'));if(b)b.click();return true})()`)
await sleep(800)
check('进入 8 月月历', await bodyHas('8 月') && await bodyHas('日') && await bodyHas('一') && await bodyHas('六'))
// 8-3 足迹、8-15 生日 有圆点（日期格）
check('8-3 事件日期圆点', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim()==='3');return bs.some(b=>b.innerHTML.includes('rounded-pill'))})()`))

// ═══ ③ 点击日期 → 毛玻璃弹窗 ═══
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='3'&&x.closest('.grid'));if(b)b.click();return true})()`)
await sleep(600)
check('弹窗显示日期', await bodyHas('2026 年 8 月 3 日'))
check('弹窗显示事件（深圳旅行·足迹）', await bodyHas('深圳旅行') && await bodyHas('足迹'))
// 关闭（点外）
await ev(`(()=>{const mask=[...document.querySelectorAll('div')].find(x=>x.className.includes('backdrop-blur'));if(mask)mask.click();return true})()`)
await sleep(400)
check('点外关闭弹窗', !(await bodyHas('深圳旅行')))

// ═══ ④ 优先级：同天多事件（足迹 > 纪念日） ═══
// 给 8-15 也加一个足迹（与生日同天）→ 弹窗足迹优先排序
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    const tx=db.transaction('countdownEvents','readwrite');
    tx.objectStore('countdownEvents').put({id:'tl-5',kind:'footprint',title:'搬家纪念',category:'other',dateType:'solar',solarDate:'2026-08-15',avatar:'📦',createdAt:Date.now(),updatedAt:Date.now(),deletedAt:null,_dirty:1,_syncedAt:null});
    tx.oncomplete=()=>res('ok');};})
`)
await sleep(300)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/space'`); await sleep(1500)
await clickBtn('倒数日'); await sleep(900)
await clickBtn('时间轴'); await sleep(700)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('8 月'));if(b)b.click();return true})()`)
await sleep(700)
// 点 15 号
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='15'&&x.closest('.grid'));if(b)b.click();return true})()`)
await sleep(600)
// 弹窗应显示两个事件：足迹(搬家纪念)排在生日(妈妈生日)前
const order = await ev(`(()=>{const d=document.body.innerText;const i1=d.indexOf('搬家纪念'),i2=d.indexOf('妈妈生日');return {i1,i2}})()`)
check('同天多事件：足迹排在生日前（优先级）', order.i1 !== -1 && order.i2 !== -1 && order.i1 < order.i2, JSON.stringify(order))
await ev(`(()=>{const mask=[...document.querySelectorAll('div')].find(x=>x.className.includes('backdrop-blur'));if(mask)mask.click();return true})()`)
await sleep(600)

// ═══ ⑤ 年份切换 ═══
// 当前在月历：先 ‹ 返回月份墙，再 ‹ 切到上一年
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='‹');if(b)b.click();return true})()`)
await sleep(400)
check('返回月份墙', await bodyHas('1 月') && await bodyHas('12 月'))
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='‹');if(b)b.click();return true})()`)
await sleep(400)
check('年份切到上一年', await bodyHas('2025 年'))
// 期待事件（生日）每年重复 → 2025 年 8 月仍有圆点（正确）；足迹一次性 → 2025 年 8-3 无圆点
check('切 2025 后 8 月仍有圆点（生日每年重复）', await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('8 月'));return !!b&&b.innerHTML.includes('rounded-pill')})()`))
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('8 月'));if(b)b.click();return true})()`)
await sleep(700)
check('2025 年 8-3（足迹）无圆点（足迹不重复）', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim()==='3');return bs.length>0&&!bs.some(b=>b.innerHTML.includes('rounded-pill'))})()`))

try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
