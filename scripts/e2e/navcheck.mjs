// 日记·关系 两级导航验证：
// 一级 = 左侧侧边导航（📖 日记 / 💙 关系），禁止顶部横向 Tab
// 二级 = 仅关系页，右侧顶部「感动瞬间 / 矛盾复盘」胶囊
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9390
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-nav',
  `${BASE}/#/journal`], { stdio: 'ignore' })
await sleep(3500)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
// 监听控制台日志（抓 JournalPage mount 时的 sub 值）
const consoleLogs=[]
ws.addEventListener('message',(e)=>{try{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled'){const txt=m.params.args.map(a=>a.value??a.description??'').join(' ');consoleLogs.push(txt)}}catch{}})
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails.exception)));return r.result.value}
const allErrs=[]
const injectErr=()=>ev(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));`)
await injectErr()
await send('Runtime.enable',{})

const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)

// 先离开再回来，确保 JournalPage 重新挂载（sub 重置为日记；防止连到残留页面的历史子视图）
await ev(`location.hash='#/home'`); await sleep(300)
await ev(`location.hash='#/journal'`); await sleep(2000)
// ── 一级：左侧常驻侧边导航（📖 日记 / 💙 关系） ──
const nav = await ev(`
  (()=>{
    const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null);
    if(!n) return {none:true};
    const btns=[...n.querySelectorAll('button')].map(b=>b.textContent.trim());
    return {btns, width:n.getBoundingClientRect().width, left:n.getBoundingClientRect().left};
  })()
`)
check('左侧存在侧边导航（nav）', !nav.none, JSON.stringify(nav))
check('侧边导航含「日记」「关系」', (nav.btns||[]).some(b=>b.includes('日记')) && (nav.btns||[]).some(b=>b.includes('关系')), JSON.stringify(nav.btns))
check('侧边导航窄竖排（≈68px 且靠左）', Math.abs((nav.width||0)-68)<4 && (nav.left||0)<70, `width=${Math.round(nav.width||0)} left=${Math.round(nav.left||0)}`)

// ── 顶部禁止横向「我的日记 / 我的关系」Tab ──
const topTabs = await ev(`
  (()=>{
    // 页面顶部区域的横向按钮组：找含「我的日记」「我的关系」并排的按钮
    const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
    const hasDiary=bs.some(b=>b.textContent.trim()==='我的日记');
    const hasRelation=bs.some(b=>b.textContent.trim()==='我的关系');
    return {hasDiary, hasRelation};
  })()
`)
check('顶部无横向「我的日记」Tab', !topTabs.hasDiary)
check('顶部无横向「我的关系」Tab', !topTabs.hasRelation)

// ── 默认右侧是日记内容 ──
check(
  '默认右侧显示日记页',
  await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);return bs.some(b=>b.getAttribute('aria-label')==='写日记')||bs.some(b=>b.textContent.trim().includes('写下第一篇'))||bs.some(b=>b.textContent.trim().includes('还没有日记'))})()`),
)

// ── 切到我的关系：二级入口改为分段控制器（横格排列） ──
await clickBtn('关系'); await sleep(600)
check('切关系后右侧出现二级「感动瞬间/矛盾复盘」', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);return bs.some(b=>b.textContent.trim().includes('感动瞬间'))&&bs.some(b=>b.textContent.trim().includes('矛盾复盘'))})()`))
// 分段控制器样式：两按钮在 rounded-pill 容器内，水平排列（同一行），等宽
const segInfo = await ev(`
  (()=>{
    const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&(b.textContent.trim().includes('感动瞬间')||b.textContent.trim().includes('矛盾复盘')));
    if(bs.length<2) return null;
    const wrap=bs[0].parentElement;
    const isPill=wrap && String(wrap.className).includes('rounded-pill');
    const sameRow=Math.abs(bs[0].getBoundingClientRect().top-bs[1].getBoundingClientRect().top)<4;
    const widths=bs.map(b=>Math.round(b.getBoundingClientRect().width));
    const flex1=bs.every(b=>getComputedStyle(b).flexGrow!=='0' || String(b.className).includes('flex-1'));
    return {isPill,sameRow,widths,flex1,parentClass:wrap?String(wrap.className).slice(0,80):''};
  })()
`)
check('二级为分段控制器（rounded-pill 容器）', segInfo && segInfo.isPill, JSON.stringify(segInfo))
check('二级两段同一行（横格排列）', segInfo && segInfo.sameRow, JSON.stringify(segInfo))
check('二级两段等宽（flex-1 平分）', segInfo && segInfo.widths.length===2 && Math.abs(segInfo.widths[0]-segInfo.widths[1])<5, JSON.stringify(segInfo))
check('二级段有 emoji 图标', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&(b.textContent.includes('感动瞬间')||b.textContent.includes('矛盾复盘')));return bs.length>0&&bs.every(b=>/[💞🔍]/.test(b.textContent))})()`))
// 二级切换 + 列表按 kind 过滤
await clickBtn('矛盾复盘'); await sleep(500)
check('二级切到矛盾复盘后选中态高亮（bg-surface + font-semibold）', await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes('矛盾复盘'));return !!b&&b.className.includes('bg-surface')&&b.className.includes('font-semibold')})()`))
// + 按钮在顶部右对齐（分段控制器上方）
const addBtn = await ev(`
  (()=>{
    const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='新增');
    if(!b) return null;
    return {right:Math.round(b.getBoundingClientRect().right), parent:b.parentElement.className.includes('justify-end')};
  })()
`)
check('+ 按钮存在且右对齐', addBtn && addBtn.parent, JSON.stringify(addBtn))
// 一级导航在二级切换后仍常驻（左侧边栏）
check('切二级后左侧导航仍在', await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.getBoundingClientRect().width<100&&x.getBoundingClientRect().left<70);return !!n})()`))

// ── 列表按 kind 过滤验证 ──
// 直接进 spark 种一条感动、一种矛盾？看 MomentsStore 用 recordRepo：种两条关系记录
await ev(`
  new Promise(res=>{
    const rq=indexedDB.open('titia');
    rq.onsuccess=()=>{
      const db=rq.result;
      const now=Date.now();
      const tx=db.transaction('records','readwrite');
      const s=tx.objectStore('records');
      s.put({id:'m-touched-1',type:'relation_touched',occurredAt:now-1000,createdAt:now-1000,updatedAt:now-1000,deletedAt:null,_dirty:1,_syncedAt:null,title:undefined,content:'感动测试一条',mediaIds:[],refType:null,refId:undefined,payload:{event:'感动测试'},pinned:false});
      s.put({id:'m-conflict-1',type:'relation_conflict',occurredAt:now-500,createdAt:now-500,updatedAt:now-500,deletedAt:null,_dirty:1,_syncedAt:null,title:undefined,content:'矛盾测试一条',mediaIds:[],refType:null,refId:undefined,payload:{event:'矛盾测试'},pinned:false});
      tx.oncomplete=()=>{ setTimeout(()=>location.reload(),100); res(1); };
    };
  })
`)
await sleep(3000); await ev(`location.hash='#/journal'`); await sleep(700)
await clickBtn('关系'); await sleep(600)
// 月份收纳：点分类 → 月份卡片 → 进入该月列表验证过滤
await clickBtn('感动瞬间'); await sleep(400)
await ev(`(()=>{const c=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('条')&&x.textContent.includes('年'));if(c)c.click();return !!c})()`)
await sleep(400)
check('感动瞬间分类只显示感动记录', await bodyHas('感动测试一条') && !(await bodyHas('矛盾测试一条')))
await ev(`document.querySelector('button[aria-label="返回月份列表"]').click()`); await sleep(300)
await clickBtn('矛盾复盘'); await sleep(400)
await ev(`(()=>{const c=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('条')&&x.textContent.includes('年'));if(c)c.click();return !!c})()`)
await sleep(400)
check('矛盾复盘分类只显示矛盾记录', !(await bodyHas('感动测试一条')) && await bodyHas('矛盾测试一条'))
// 空态文案
await ev(`
  new Promise(res=>{
    const rq=indexedDB.open('titia');
    rq.onsuccess=()=>{
      const tx=rq.result.transaction('records','readwrite');
      const s=tx.objectStore('records');
      s.delete('m-touched-1'); s.delete('m-conflict-1');
      tx.oncomplete=()=>{ setTimeout(()=>location.reload(),100); res(1); };
    };
  })
`)
await sleep(3000); await ev(`location.hash='#/journal'`); await sleep(700)
await clickBtn('关系'); await sleep(600)
const empty = await ev(`document.body.innerText.includes('还没有感动瞬间')||document.body.innerText.includes('还没有矛盾复盘')`)
check('空态文案按分类显示', empty)

// ── 运行时错误 ──
try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
console.log('CONSOLE:', JSON.stringify(consoleLogs.slice(0,8)))
chrome.kill(); process.exit(fail.length?1:0)
