// 倒数日 v3 验证：农历选择器 + 公历每年自动顺延
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9392
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-cd3',
  `${BASE}/#/space`], { stdio: 'ignore' })
await sleep(3500)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
const consoleLogs=[]
ws.addEventListener('message',(e)=>{try{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled'){const txt=m.params.args.map(a=>a.value??a.description??'').join(' ');consoleLogs.push(txt)}}catch{}})
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails.exception)));return r.result.value}
const allErrs=[]
await ev(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));`)
await send('Runtime.enable',{})

const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
const setDate=(val)=>ev(`(()=>{const el=[...document.querySelectorAll('input[type="date"]')].find(x=>x.offsetParent!==null);if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
const setSelect=(idx,val)=>ev(`(()=>{const el=[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null)[${idx}];if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(el,${JSON.stringify(String(val))});el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
const cardDays=(title)=>ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes(${JSON.stringify(title)}));if(!card)return null;const el=[...card.querySelectorAll('p')].find(x=>/^\\d+天/.test(x.textContent.trim()));return el?el.textContent.trim():null})()`)

// 清理
await ev(`
  new Promise(res=>{
    const rq=indexedDB.open('titia');
    rq.onsuccess=()=>{
      const db=rq.result;
      if(![...db.objectStoreNames].includes('countdownEvents')){res('no-table');return}
      const tx=db.transaction('countdownEvents','readwrite');
      tx.objectStore('countdownEvents').clear();
      tx.oncomplete=()=>res('cleared');
    };
    rq.onupgradeneeded=()=>rq.transaction.abort();
  }).then(r=>r)
`)
await sleep(400)

await ev(`location.hash='#/space'`); await sleep(1200)
await clickBtn('倒数日'); await sleep(800)

// ── 1. 农历选择器：八月十五 ──
await clickBtn('新增'); await sleep(500)
await setInput('妈妈生日','中秋'); await sleep(100)
await clickBtn('农历'); await sleep(300)
const selCount = await ev(`[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null).length`)
check('农历模式出现年/月/日选择器（3 个 select）', selCount===3, `selects=${selCount}`)
check('农历月默认八月', await ev(`(()=>{const el=[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null)[1];return el&&el.value==='8'})()`))
await setSelect(2, '15'); await sleep(200) // 日选十五（index 2 = 日）
await clickBtn('保存'); await sleep(700)
check('农历事件卡片显示「农历 八月十五」', await bodyHas('八月十五'))
const lunarDays = await cardDays('中秋')
const today = new Date(); const mid = new Date(2026,8,25)
const expectLunar = Math.max(0, Math.round((mid - new Date(today.getFullYear(),today.getMonth(),today.getDate()))/86400000))
check('农历换算剩余天数正确', lunarDays===`${expectLunar}天`, `页面=${lunarDays} 期望=${expectLunar}天`)
check('农历卡片显示下一次日期', await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('中秋'));return !!card&&card.textContent.includes('下一次 2026-09-25')})()`))

// ── 2. 公历每年自动顺延：选过去的日期 → 自动算到下一年 ──
await clickBtn('新增'); await sleep(500)
await setInput('妈妈生日','结婚纪念日'); await sleep(100)
await setDate('2025-01-01'); await sleep(200) // 过去日期
await clickBtn('保存'); await sleep(700)
check('卡片出现（结婚纪念日）', await bodyHas('结婚纪念日'))
const rollDays = await cardDays('结婚纪念日')
const rollTarget = new Date(2027,0,1) // 2025-01-01 已过 → 顺延 2026-01-01 仍已过 → 2027-01-01
const expectRoll = Math.max(0, Math.round((rollTarget - new Date(today.getFullYear(),today.getMonth(),today.getDate()))/86400000))
check('过期公历自动顺延到最近未来日期', rollDays===`${expectRoll}天`, `页面=${rollDays} 期望=${expectRoll}天(2027-01-01)`)
check('卡片显示「下一次 2027-01-01」', await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('结婚纪念日'));return !!card&&card.textContent.includes('下一次 2027-01-01')})()`))

// ── 3. 编辑农历事件：选择器回填 ──
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('中秋'));if(!card)return false;card.click();return true})()`)
await sleep(500)
check('编辑农历事件回填月=八月 日=十五', await ev(`(()=>{const s=[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null);return s.length===3&&s[1].value==='8'&&s[2].value==='15'})()`))
await clickBtn('保存'); await sleep(600)

// ── 4. 无运行时错误 ──
try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
console.log('CONSOLE:', JSON.stringify(consoleLogs.slice(0,8)))
chrome.kill(); process.exit(fail.length?1:0)
