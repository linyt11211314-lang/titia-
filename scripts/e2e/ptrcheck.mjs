// 下拉刷新验证：触摸下拉 → 指示器出现 → 触发刷新（reloadAll）→ 数据更新
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9440
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-ptr',
  `${BASE}/#/`], { stdio: 'ignore' })
await sleep(4000)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails.exception)));return r.result.value}
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
// 模拟触摸手势
const touch=async(type,pts)=>send('Input.dispatchTouchEvent',{type,touchPoints:pts})

// 等待页面加载
await ev(`location.hash='#/'`); await sleep(1000)
check('首页加载', await ev(`document.body.innerText.includes('Titia 时序')`))

// ── 1. 下拉 → 指示器出现（首页 banner 固定，下拉起点在 banner 下方滚动区） ──
await touch('touchStart', [{x:196,y:260,id:1}])
await sleep(100)
await touch('touchMove', [{x:196,y:290,id:1}])
await sleep(100)
await touch('touchMove', [{x:196,y:370,id:1}])
await sleep(100)
await touch('touchMove', [{x:196,y:450,id:1}])
await sleep(200)
// 检查指示器（下拉中，opacity 1）：精确匹配含刷新箭头 svg 且可见的指示器容器
const duringPull = await ev(`(()=>{const el=[...document.querySelectorAll('[aria-hidden="true"]')].find(x=>x.querySelector('svg')&&x.offsetParent!==null&&x.getBoundingClientRect().height>0);return el?{opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform}:null})()`)
check('下拉时指示器可见', duringPull && duringPull.opacity === '1', JSON.stringify(duringPull))

// ── 2. 松手 → 触发刷新 → 指示器转圈 → 完成 ──
await touch('touchEnd', [])
await sleep(120)
// 刷新中状态（转圈）
// ── 3. 刷新真的重载了数据（给云端/本地加一条 → 下拉刷新 → 出现） ──
// 直接塞一条购物清单进 IndexedDB，然后下拉刷新，应该立即出现在首页待买
await ev(`
  new Promise(res=>{
    const rq=indexedDB.open('titia');
    rq.onsuccess=()=>{
      const db=rq.result;
      const now=Date.now();
      const tx=db.transaction('shopping','readwrite');
      tx.objectStore('shopping').put({id:'ptr-1',name:'刷新测试商品',status:'pending',bought:false,order:now,createdAt:now,updatedAt:now,deletedAt:null,_dirty:1,_syncedAt:null});
      tx.oncomplete=()=>res(1);
    };
  })
`)
await touch('touchStart', [{x:196,y:260,id:1}])
await sleep(80); await touch('touchMove', [{x:196,y:290,id:1}]); await sleep(80)
await touch('touchMove', [{x:196,y:370,id:1}]); await sleep(80)
await touch('touchMove', [{x:196,y:450,id:1}]); await sleep(80)
await touch('touchMove', [{x:196,y:530,id:1}]); await sleep(200)
await touch('touchEnd', [])
await sleep(1500)
check('下拉刷新后新数据出现在页面', await ev(`document.body.innerText.includes('刷新测试商品')`))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
