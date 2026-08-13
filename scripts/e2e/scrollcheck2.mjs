// 倒数日滚动验证：足迹/期待列表都能上下滑动 + 下拉刷新仍工作
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9513
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-scroll-final',
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

// 种数据：12 足迹 + 8 期待
await ev(`
  new Promise(res=>{
    const rq=indexedDB.open('titia');
    rq.onsuccess=()=>{
      const db=rq.result;
      if(![...db.objectStoreNames].includes('countdownEvents')){res('no-table');return}
      const tx=db.transaction('countdownEvents','readwrite');
      const s=tx.objectStore('countdownEvents');
      const now=Date.now();
      for(let i=0;i<12;i++){
        const d=new Date(2020+i,3,15).toISOString().slice(0,10);
        s.put({id:'fps-'+i,kind:'footprint',title:'足迹'+i,category:'family',dateType:'solar',solarDate:d,avatar:'🐱',createdAt:now-i,updatedAt:now-i,deletedAt:null,_dirty:1,_syncedAt:null});
      }
      for(let i=0;i<8;i++){
        const d=new Date(2027,i%12+1,20).toISOString().slice(0,10);
        s.put({id:'exs-'+i,kind:'expected',title:'期待'+i,category:'other',dateType:'solar',solarDate:d,avatar:'✨',createdAt:now-i,updatedAt:now-i,deletedAt:null,_dirty:1,_syncedAt:null});
      }
      tx.oncomplete=()=>res('seeded');
    };
    rq.onupgradeneeded=()=>rq.transaction.abort();
  }).then(r=>r)
`)
await sleep(500)
await ev(`location.hash='#/space'`); await sleep(1500)
await clickBtn('倒数日'); await sleep(1000)

const scroller = await ev(`
  (()=>{const el=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.className.includes('overflow-y-auto')&&x.className.includes('px-4'));
    if(!el)return null;const r=el.getBoundingClientRect();
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),top:Math.round(r.y),clientH:el.clientHeight,scrollH:el.scrollHeight};})()
`)
check('滚动容器有可滚空间（内容 > 视口）', scroller && scroller.scrollH > scroller.clientH + 100, JSON.stringify(scroller))

async function touchScroll(y1,y2){
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:scroller.x,y:y1}]})
  for(let i=1;i<=6;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:scroller.x,y:y1+(y2-y1)*i/6}]});await sleep(50)}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(400)
}
const getTop=()=>ev(`(()=>{const el=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.className.includes('overflow-y-auto')&&x.className.includes('px-4'));return el?el.scrollTop:-1})()`)

// 足迹上滑
await clickBtn('足迹'); await sleep(800)
const fp0=await getTop(); await touchScroll(scroller.y+250,scroller.y-150); const fp1=await getTop()
check('足迹列表可上滑滚动', fp1>fp0+50, `before=${fp0} after=${fp1}`)
// 足迹下滑回顶
await touchScroll(scroller.y-150,scroller.y+300); const fp2=await getTop()
check('足迹列表可下滑回顶', fp2<fp1-50, `after=${fp1} back=${fp2}`)

// 期待上滑
await clickBtn('期待'); await sleep(800)
const ex0=await getTop(); await touchScroll(scroller.y+250,scroller.y-150); const ex1=await getTop()
check('期待列表可上滑滚动', ex1>ex0+50, `before=${ex0} after=${ex1}`)
await touchScroll(scroller.y-150,scroller.y+300); const ex2=await getTop()
check('期待列表可下滑回顶', ex2<ex1-50, `after=${ex1} back=${ex2}`)

// 下拉刷新仍工作（顶部下拉触发指示器）
await touchScroll(scroller.y,scroller.y+160)
const pulling=await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.className.includes('overflow-y-auto')&&x.className.includes('px-4'));if(!el)return false;return el.parentElement.querySelector('[aria-hidden="true"]')!==null})()`)
check('下拉刷新指示器仍触发（顶部下拉）', pulling)

try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
