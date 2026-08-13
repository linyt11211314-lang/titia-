// Supabase 云同步端到端测试：配置 → 同步 → 双向合并
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'

const PORT = 9430
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const SUPABASE = 'http://127.0.0.1:8092'
const SUPABASE_FILE = '/tmp/mock-supabase/sync.json'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.test'

const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-sb',
  '--incognito','--disable-application-cache','--disable-cache',
  `${BASE}/#/mine`], { stdio: 'ignore' })
await sleep(4000)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);const ed=x.exceptionDetails;const v=x.result&&x.result.value!==undefined?x.result.value:(x.result&&x.result.result&&x.result.result.value);res({value:v,exceptionDetails:ed})}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r&&r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.exception&&JSON.stringify(r.exceptionDetails.exception)||r.exceptionDetails));return r?r.value:undefined}
const clickText=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button,[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const setVal=(sel,v)=>ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'no-el';try{const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;const d=Object.getOwnPropertyDescriptor(proto,'value');d.set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return el.value}catch(e){return 'ERR:'+e.message}})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const cloudHas=async(content)=>existsSync(SUPABASE_FILE) && readFileSync(SUPABASE_FILE,'utf8').includes(content)

try { unlinkSync(SUPABASE_FILE) } catch {}
await ev(`
  new Promise(res=>{
    const rq=indexedDB.open('titia');
    rq.onsuccess=()=>{
      const db=rq.result;
      const clear=s=>new Promise(r=>{const tx=db.transaction(s,'readwrite');tx.objectStore(s).clear();tx.oncomplete=r});
      Promise.all(['records','shopping','settings'].map(clear)).then(()=>res(1));
    };
  })
`)
await ev(`location.reload()`); await sleep(3000); await ev(`location.hash='#/mine'`); await sleep(800)

await clickText('云同步'); await sleep(800)
const fullHtml = await ev(`document.body.innerHTML.length`)
console.log('body html length:', fullHtml)
const inputsRaw = await ev(`document.querySelectorAll("input").length`)
console.log('inputs count:', inputsRaw)
const formsRaw = await ev(`document.querySelectorAll("form").length`)
console.log('forms count:', formsRaw)
const sheetRaw = await ev(`document.querySelectorAll("[role=dialog]").length`)
console.log('sheet count:', sheetRaw)
const allInputs = await ev(`JSON.stringify(Array.from(document.querySelectorAll("input,textarea")).map(i=>({p:i.placeholder||"",t:i.tagName})))`)
console.log('allInputs:', allInputs)
console.log('inputs count:', inputsRaw)
const rawTest = await send('Runtime.evaluate', {expression: '1+1', returnByValue: true, awaitPromise: true})
console.log('rawTest:', JSON.stringify(rawTest))
const inputsList = await ev(`JSON.stringify(Array.from(document.querySelectorAll("input")).filter(i=>i.offsetParent!==null).map(i=>(i.placeholder||"").slice(0,30)))`)
console.log('inputs:', inputsList, typeof inputsList)
const r1 = await setVal('input[placeholder*="supabase"]', SUPABASE)
const r2 = await setVal('input[placeholder*="eyJhbGci"]', ANON_KEY)
await sleep(300)
console.log('setVal URL:', r1, '| anonKey:', r2)
await clickText('保存并同步'); await sleep(2000)
const cfg = await ev(`localStorage.getItem('titia.supabase.config')`)
check('配置已保存到 localStorage', !!cfg && cfg.includes('8092'), String(cfg).slice(0,60))
check('保存并同步后云端出现备份文件', existsSync(SUPABASE_FILE), existsSync(SUPABASE_FILE)?readFileSync(SUPABASE_FILE,'utf8').length+' B':'无')

await ev(`location.hash='#/journal'`); await sleep(800)
await ev(`document.querySelector('[aria-label="写日记"]').click()`); await sleep(500)
await setVal('textarea[placeholder="写点什么…"]', '桌面端 Supabase 日记')
await clickText('保存'); await sleep(600)
await ev(`location.hash='#/mine'`); await sleep(800)
await clickText('云同步'); await sleep(600)
await clickText('立即同步'); await sleep(2000)
check('桌面数据已上传云端（含日记）', await cloudHas('桌面端 Supabase 日记'))

const cloud = JSON.parse(readFileSync(SUPABASE_FILE,'utf8'))
const now = Date.now()
cloud.data.tables.shopping = [
  { id:'phone-shop-1', name:'手机端买的湿厕纸', status:'pending', bought:false, order:now,
    createdAt:now, updatedAt:now+1000, deletedAt:null, _dirty:1, _syncedAt:null },
]
writeFileSync(SUPABASE_FILE, JSON.stringify(cloud, null, 2))

await clickText('立即同步'); await sleep(2000)
await ev(`location.hash='#/shopping'`); await sleep(800)
check('手机端数据已拉到桌面（购物清单出现）', await bodyHas('手机端买的湿厕纸'))

await ev(`(()=>{const span=[...document.querySelectorAll('span')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='手机端买的湿厕纸');if(!span)return 0;span.closest('div[class*="rounded-card"]').click();return 1})()`)
await sleep(500)
await ev(`location.hash='#/mine'`); await sleep(800)
await clickText('云同步'); await sleep(400)
await clickText('立即同步'); await sleep(2000)
const cloud2 = JSON.parse(readFileSync(SUPABASE_FILE,'utf8'))
const shopRow = (cloud2.data.tables.shopping||[]).find(r=>r.id==='phone-shop-1')
check('双向收敛：桌面端标记已买 → 云端同步为 completed', !!shopRow && shopRow.status==='completed', JSON.stringify(shopRow||{}))

const cloud3 = JSON.parse(readFileSync(SUPABASE_FILE,'utf8'))
const diaryCloud = (cloud3.data.tables.records||[]).some(r=>String(r.content||'').includes('桌面端 Supabase 日记'))
check('桌面日记在云端合并后仍保留', diaryCloud)
await ev(`location.hash='#/journal'`); await sleep(800)
check('桌面日记本地仍在', await bodyHas('桌面端 Supabase 日记'))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
