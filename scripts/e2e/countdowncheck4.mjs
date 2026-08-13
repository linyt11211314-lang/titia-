// 倒数日 v4 验证：①sticky 吸顶 ②期待筛选（生日/纪念日/其他） ③农历年份选择
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9405
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-cd4-final',
  `${BASE}/#/space`], { stdio: 'ignore' })
await sleep(5000)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails.exception)));return r.result.value}
const allErrs=[]
await ev(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));`)
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
const setSelect=(idx,val)=>ev(`(()=>{const el=[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null)[${idx}];if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(el,${JSON.stringify(String(val))});el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)

// 清理
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    if(![...db.objectStoreNames].includes('countdownEvents')){res('no-table');return}
    const tx=db.transaction('countdownEvents','readwrite');tx.objectStore('countdownEvents').clear();tx.oncomplete=()=>res('ok');};})
`)
await sleep(500)

await ev(`location.hash='#/space'`); await sleep(1500)
await clickBtn('倒数日'); await sleep(1000)

// ═══ ③ 农历年份选择 ═══
await clickBtn('新增'); await sleep(600)
await setInput('妈妈生日','中秋家宴'); await sleep(100)
await clickBtn('农历'); await sleep(400)
const selCount = await ev(`[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null).length`)
check('农历模式出现年份/月/日选择器（3 个）', selCount===3, `selects=${selCount}`)
const yearSel = await ev(`(()=>{const s=[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null)[0];return s?[...s.options].map(o=>o.textContent.trim()):[]})()`)
check('年份选择含「每年」+具体年份', yearSel[0]==='每年' && yearSel.some(o=>o.includes('2028')), JSON.stringify(yearSel.slice(0,4)))
// 选 2028 年 + 八月十五
await setSelect(0,'2028'); await sleep(150)
await setSelect(1,'8'); await sleep(150)
await setSelect(2,'15'); await sleep(150)
await clickBtn('保存'); await sleep(800)
check('农历带年份卡片显示「2028 年起」', await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('中秋家宴'));return !!card&&card.textContent.includes('2028 年起')})()`))
// 2028-10-03 距离今天的剩余天数
const today=new Date(); const t2028=new Date(2028,9,3)
const expect2028=Math.max(0,Math.round((t2028-new Date(today.getFullYear(),today.getMonth(),today.getDate()))/86400000))
const days2028=await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('中秋家宴'));if(!card)return null;const el=[...card.querySelectorAll('p')].find(x=>/^\\d+天/.test(x.textContent.trim()));return el?el.textContent.trim():null})()`)
check('2028 农历换算天数正确', days2028===`${expect2028}天`, `页面=${days2028} 期望=${expect2028}天(2028-10-03)`)

// ═══ ② 期待筛选 ═══
// 种 3 条不同类型期待
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    const tx=db.transaction('countdownEvents','readwrite');const s=tx.objectStore('countdownEvents');const now=Date.now();
    s.put({id:'et-1',kind:'expected',title:'妈妈生日',category:'family',eventType:'birthday',dateType:'solar',solarDate:'2026-12-25',avatar:'🎂',createdAt:now,updatedAt:now,deletedAt:null,_dirty:1,_syncedAt:null});
    s.put({id:'et-2',kind:'expected',title:'结婚纪念日',category:'partner',eventType:'anniversary',dateType:'solar',solarDate:'2027-02-14',avatar:'💍',createdAt:now-1,updatedAt:now-1,deletedAt:null,_dirty:1,_syncedAt:null});
    s.put({id:'et-3',kind:'expected',title:'去北极',category:'other',eventType:'other',dateType:'solar',solarDate:'2028-06-01',avatar:'✨',createdAt:now-2,updatedAt:now-2,deletedAt:null,_dirty:1,_syncedAt:null});
    tx.oncomplete=()=>res('ok');};})
`)
await sleep(400)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/space'`); await sleep(1200)
await clickBtn('倒数日'); await sleep(900)
check('期待筛选 chips 出现（全部/生日/纪念日/其他）', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);return bs.some(b=>b.textContent.trim()==='全部')&&bs.some(b=>b.textContent.trim().includes('生日'))&&bs.some(b=>b.textContent.trim().includes('纪念日'))&&bs.some(b=>b.textContent.trim()==='其他')})()`))
check('全部时三张卡都在', await bodyHas('妈妈生日') && await bodyHas('结婚纪念日') && await bodyHas('去北极'))
// 筛选生日
await clickBtn('生日'); await sleep(500)
check('筛选生日只显示生日卡', await bodyHas('妈妈生日') && !(await bodyHas('结婚纪念日')) && !(await bodyHas('去北极')))
// 筛选纪念日
await clickBtn('纪念日'); await sleep(500)
check('筛选纪念日只显示纪念日卡', !(await bodyHas('妈妈生日')) && await bodyHas('结婚纪念日') && !(await bodyHas('去北极')))
// 筛选其他
await clickBtn('其他'); await sleep(500)
check('筛选其他只显示其他卡', !(await bodyHas('妈妈生日')) && !(await bodyHas('结婚纪念日')) && await bodyHas('去北极'))
// 足迹 tab 无筛选 chips
await clickBtn('足迹'); await sleep(500)
check('足迹 tab 无筛选 chips', !(await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);return bs.some(b=>b.textContent.trim()==='全部')})()`)))
await clickBtn('期待'); await sleep(500)

// ═══ ① sticky 吸顶 ═══
// 种足量期待让列表可滚，滚动后标题应固定
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    const tx=db.transaction('countdownEvents','readwrite');const s=tx.objectStore('countdownEvents');const now=Date.now();
    for(let i=0;i<15;i++){
      s.put({id:'st-'+i,kind:'expected',title:'期待'+i,category:'other',eventType:'other',dateType:'solar',solarDate:'2027-'+String(i%12+1).padStart(2,'0')+'-20',avatar:'✨',createdAt:now-i,updatedAt:now-i,deletedAt:null,_dirty:1,_syncedAt:null});
    }
    tx.oncomplete=()=>res('ok');};})
`)
await sleep(400)
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/space'`); await sleep(1200)
await clickBtn('倒数日'); await sleep(900)
// 记录标题位置
const h2Top0 = await ev(`(()=>{const el=[...document.querySelectorAll('h2')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='倒数日');return el?Math.round(el.getBoundingClientRect().top):null})()`)
// 触摸滚动容器
const scroller = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.className.includes('overflow-y-auto')&&x.className.includes('px-4'));if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
async function touchScroll(y1,y2){
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:scroller.x,y:y1}]})
  for(let i=1;i<=6;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:scroller.x,y:y1+(y2-y1)*i/6}]});await sleep(50)}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(500)
}
await touchScroll(scroller.y+250, scroller.y-200)
const scrollTopAfter = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.className.includes('overflow-y-auto')&&x.className.includes('px-4'));return el?el.scrollTop:-1})()`)
check('滚动确实发生（scrollTop > 0）', scrollTopAfter>50, `scrollTop=${scrollTopAfter}`)
const h2Top1 = await ev(`(()=>{const el=[...document.querySelectorAll('h2')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='倒数日');return el?Math.round(el.getBoundingClientRect().top):null})()`)
check('滚动后标题保持原位（sticky 吸顶）', h2Top0!==null && h2Top1!==null && Math.abs(h2Top0-h2Top1)<=2, `before=${h2Top0} after=${h2Top1}`)
const filterTop1 = await ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='全部');return el?Math.round(el.getBoundingClientRect().top):null})()`)
check('滚动后筛选 chips 仍固定可见', filterTop1!==null && filterTop1<150 && filterTop1>0, `filterTop=${filterTop1}`)

try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
