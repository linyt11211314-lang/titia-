// 倒数日功能验证 v2：
// 1. 小窝侧边导航含「倒数日」入口
// 2. 期待/足迹 iOS 风格切换
// 3. 新增期待事件（公历 DateInput）→ 卡片 + 剩余天数
// 4. 刷新持久化
// 5. 足迹新增 → 已经 X 年 X 个月 X 天
// 6. 农历期待（八月十五）→ 每年换算 + 下一次日期
// 7. 编辑 / 删除（卡片内删除按钮 + 确认）
// 8. 无运行时错误
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9391
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-countdown2',
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
const clickCard=txt=>ev(`(()=>{const el=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
// 文本输入（按 placeholder 匹配）
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
// 原生日期输入（type=date）
const setDate=(val)=>ev(`(()=>{const el=[...document.querySelectorAll('input[type="date"]')].find(x=>x.offsetParent!==null);if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)

// 清理 countdownEvents
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

// ── 1. 小窝侧边导航 ──
await ev(`location.hash='#/space'`); await sleep(1200)
const nav = await ev(`
  (()=>{
    const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null);
    if(!n) return {none:true};
    return {btns:[...n.querySelectorAll('button')].map(b=>b.textContent.trim())};
  })()
`)
check('小窝侧边导航存在', !nav.none)
check('侧边导航含「倒数日」', (nav.btns||[]).some(b=>b.includes('倒数日')), JSON.stringify(nav.btns))

// ── 2. 点击倒数日 → 期待/足迹切换 ──
await clickBtn('倒数日'); await sleep(800)
check('点倒数日后右侧出现期待/足迹切换', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);return bs.some(b=>b.textContent.trim()==='期待')&&bs.some(b=>b.textContent.trim()==='足迹')})()`))
check('默认显示空态「记录那些正在等待的日子」', await bodyHas('记录那些正在等待的日子'))

// ── 3. 新增期待事件（公历） ──
await clickBtn('新增'); await sleep(500)
check('表单弹出（事件名称输入框）', await ev(`!![...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&x.placeholder.includes('妈妈生日'))`))
check('公历模式用原生日期选择器', await ev(`!![...document.querySelectorAll('input[type="date"]')].find(x=>x.offsetParent!==null)`))
await setInput('妈妈生日','妈妈的生日'); await sleep(100)
await setDate('2026-12-25'); await sleep(100)
await setInput('❤️','🎂'); await sleep(100)
await clickBtn('保存'); await sleep(700)
check('新增后卡片出现（妈妈的生日）', await bodyHas('妈妈的生日'))
// 剩余天数：取「N天」文本
const daysTxt = await ev(`(()=>{const el=[...document.querySelectorAll('p')].find(x=>x.offsetParent!==null&&/^\\d+天/.test(x.textContent.trim()));return el?el.textContent.trim():null})()`)
const today = new Date(); const target = new Date(2026,11,25)
const expectDays = Math.max(0, Math.round((target - new Date(today.getFullYear(),today.getMonth(),today.getDate()))/86400000))
check('剩余天数数字正确', daysTxt===`${expectDays}天`, `页面=${daysTxt} 期望=${expectDays}天`)

// ── 4. 持久化：刷新后仍在 ──
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/space'`); await sleep(1200)
await clickBtn('倒数日'); await sleep(800)
check('刷新后卡片仍在（持久化）', await bodyHas('妈妈的生日'))

// ── 5. 足迹：切换 + 空态 + 新增 ──
await clickBtn('足迹'); await sleep(500)
check('足迹空态「保存已经发生的珍贵时间」', await bodyHas('保存已经发生的珍贵时间'))
await clickBtn('添加第一个足迹'); await sleep(500)
check('足迹表单无日期类型选择（强制公历）', !(await ev(`[...document.querySelectorAll('button')].some(x=>x.offsetParent!==null&&x.textContent.trim()==='农历')`)))
await setInput('妈妈生日','领养日'); await sleep(100)
await setDate('2022-05-20'); await sleep(100)
await clickBtn('保存'); await sleep(700)
check('足迹卡片出现（领养日）', await bodyHas('领养日'))
check('足迹显示「已经陪伴」', await bodyHas('已经陪伴'))
check('足迹显示「2022.05.20 开始」', await bodyHas('2022.05.20 开始'))
await clickBtn('期待'); await sleep(400)
check('期待页不含足迹事件', !(await bodyHas('领养日')))
await clickBtn('足迹'); await sleep(400)
check('足迹页不含期待事件', !(await bodyHas('妈妈的生日')))

// ── 6. 农历期待（八月十五） ──
await clickBtn('期待'); await sleep(400)
await clickBtn('新增'); await sleep(500)
await setInput('妈妈生日','中秋'); await sleep(100)
await clickBtn('农历'); await sleep(300)
check('选农历后提示「八月十五」格式', await ev(`!![...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&x.placeholder.includes('八月十五'))`))
check('农历模式无原生日期选择器', !(await ev(`!![...document.querySelectorAll('input[type="date"]')].find(x=>x.offsetParent!==null)`)))
await setInput('八月十五','八月十五'); await sleep(100)
await clickBtn('保存'); await sleep(700)
check('农历事件卡片显示「农历 八月十五」', await bodyHas('八月十五'))
check('农历卡片显示「每年」', await bodyHas('每年'))
// 换算验证：今年中秋（2026-09-25）→ 剩余天数（定位中秋卡片内的天数）
const lunarDays = await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('中秋'));if(!card)return null;const el=[...card.querySelectorAll('p')].find(x=>/^\\d+天/.test(x.textContent.trim()));return el?el.textContent.trim():null})()`)
const midAutumn = new Date(2026,8,25)
const expectLunar = Math.max(0, Math.round((midAutumn - new Date(today.getFullYear(),today.getMonth(),today.getDate()))/86400000))
check('农历换算剩余天数正确', lunarDays===`${expectLunar}天`, `页面=${lunarDays} 期望=${expectLunar}天`)

// ── 7. 编辑 ──
await clickCard('妈妈的生日'); await sleep(500)
check('编辑表单弹出（标题已有值）', await ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&x.value==='妈妈的生日');return !!el})()`))
await clickBtn('保存'); await sleep(600)
check('编辑后仍在（保存不丢）', await bodyHas('妈妈的生日'))

// ── 8. 删除（卡片内删除按钮 + 确认弹窗） ──
await clickCard('中秋'); await sleep(400)
const delClicked = await ev(`(()=>{const el=[...document.querySelectorAll('[role="button"] button, [role="button"] [role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='删除');if(!el)return false;el.click();return true})()`)
if(!delClicked){
  // 卡片内删除按钮（绝对定位在 Card 内，非 role=button 子级）→ 直接点包含「删除」的最近按钮
  await ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='删除'&&x.closest('[role="button"]'));if(!el)return false;el.click();return true})()`)
}
await sleep(500)
check('删除确认弹窗出现', await bodyHas('此操作不可恢复'))
await clickBtn('确认'); await sleep(700)
check('删除后卡片消失', !(await bodyHas('中秋')) && !(await bodyHas('八月十五')))

// ── 9. 运行时错误 ──
try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
console.log('CONSOLE:', JSON.stringify(consoleLogs.slice(0,8)))
chrome.kill(); process.exit(fail.length?1:0)
