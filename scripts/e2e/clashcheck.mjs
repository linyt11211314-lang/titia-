// 撞色皮肤验证：第三组展示 / 硬朗形状 / 无装饰 / 撞色关系 / 文字不破版
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9355
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852',`${BASE}/#/`], { stdio: 'ignore' })
await sleep(3500)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception));return r.result.value}
const injectErr=()=>ev(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));`)
await injectErr(); await sleep(500)

const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickSkin=k=>ev(`document.querySelector('[data-skin-option="${k}"]').click()`)

const CLASH = ['klein','peacock','magenta','grape','jade']

await ev(`location.hash='#/theme'`); await sleep(1000)

// ── 1. 第三组存在且齐全
check('主题中心出现「撞色」分组', await ev(`document.body.innerText.includes('撞色')`))
const n = await ev(`${JSON.stringify(CLASH)}.filter(k=>document.querySelector('[data-skin-option="'+k+'"]')).length`)
check('5 套撞色皮肤都在列表里', n === 5, `${n}/5`)
check('三组俱全（基础色/角色皮肤/撞色）',
  await ev(`['基础色','角色皮肤','撞色'].every(t=>document.body.innerText.includes(t))`))

// ── 2. 撞色卡片用「两色紧贴」预览，且长名称不破版
const kleinTxt = await ev(`document.querySelector('[data-skin-option="klein"]').innerText.replace(/\\s+/g,' ').trim()`)
check('撞色卡片显示完整名称', kleinTxt.includes('克莱因蓝') && kleinTxt.includes('熔岩橙'), kleinTxt)

const seam = await ev(`
  (() => {
    const el = document.querySelector('[data-skin-option="klein"]');
    const wrap = el.querySelector('.overflow-hidden');
    if (!wrap) return 'no-seam-block';
    const kids = [...wrap.children];
    if (kids.length !== 2) return 'kids=' + kids.length;
    const a = kids[0].getBoundingClientRect(), b = kids[1].getBoundingClientRect();
    return Math.abs(a.right - b.left) < 0.6 ? 'seamless' : 'gap=' + (b.left - a.right).toFixed(2);
  })()`)
check('撞色预览两色紧贴无缝', seam === 'seamless', seam)

const noOverflow = await ev(`
  (() => {
    const el = document.querySelector('[data-skin-option="klein"]');
    return el.scrollWidth <= el.clientWidth + 1;
  })()`)
check('长名称未撑破卡片', noOverflow)

// ── 3. 撞色 = primary 与 accent 色相真的远离
const hueGap = await ev(`
  (() => {
    const hex2hue = (h) => {
      const r=parseInt(h.slice(1,3),16)/255,g=parseInt(h.slice(3,5),16)/255,b=parseInt(h.slice(5,7),16)/255;
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
      if(!d) return 0;
      let x = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4;
      return (x*60+360)%360;
    };
    const S = window.__SKINS_FOR_TEST;
    return null;
  })()`)

// 直接读运行时 CSS 变量来判断（切到每套皮肤后取值）
const gaps = {}
for (const k of CLASH) {
  await clickSkin(k); await sleep(420)
  const g = await ev(`
    (() => {
      const cs = getComputedStyle(document.documentElement);
      const toHue = (v) => {
        const m = v.trim().match(/^#([0-9a-f]{6})$/i);
        if (!m) return -1;
        const r=parseInt(m[1].slice(0,2),16)/255,g=parseInt(m[1].slice(2,4),16)/255,b=parseInt(m[1].slice(4,6),16)/255;
        const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
        if(!d) return 0;
        let x = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4;
        return (x*60+360)%360;
      };
      const p = toHue(cs.getPropertyValue('--color-primary'));
      const a = toHue(cs.getPropertyValue('--color-accent'));
      let diff = Math.abs(p - a);
      if (diff > 180) diff = 360 - diff;
      return Math.round(diff);
    })()`)
  gaps[k] = g
  check(`「${k}」主色与撞色色相相隔够远`, g >= 90, `${g}°`)
  await ev(`location.hash='#/theme'`); await sleep(300)
}

// ── 4. 硬朗形状：圆角要比基础色更小
await clickSkin('klein'); await sleep(500)
const clashRadius = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--radius-card').trim()`)
check('撞色圆角收紧到 14px', clashRadius === '14px', clashRadius)
const realR = await ev(`
  (()=>{const el=document.querySelector('.rounded-card');return el?getComputedStyle(el).borderRadius:'none'})()`)
check('实际元素圆角确已收紧', realR.startsWith('14px'), realR)

// 三组形状各不相同 —— 这正是形状系统存在的意义
await ev(`location.hash='#/theme'`); await sleep(400)
await clickSkin('cinnamon'); await sleep(400)
const charR = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--radius-card').trim()`)
await ev(`location.hash='#/theme'`); await sleep(400)
await clickSkin('warm'); await sleep(400)
const baseR = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--radius-card').trim()`)
check('三组形状各异（软萌/中性/硬朗）',
  charR === '28px' && baseR === '24px' && clashRadius === '14px',
  `${charR} / ${baseR} / ${clashRadius}`)

// ── 5. 撞色不带装饰（保持利落）
await ev(`location.hash='#/theme'`); await sleep(400)
await clickSkin('peacock'); await sleep(500)
check('撞色皮肤无飘浮装饰层', await ev(`!document.querySelector('[data-skin-backdrop]')`))
check('撞色皮肤无 data-motif', await ev(`!document.documentElement.getAttribute('data-motif')`))

// 空态也应干净
await ev(`(async()=>{const q=indexedDB.open('titia');const db=await new Promise(r=>{q.onsuccess=()=>r(q.result)});
  await new Promise(res=>{const tx=db.transaction('shopping','readwrite');tx.objectStore('shopping').clear();tx.oncomplete=res});db.close()})()`)
await ev(`location.hash='#/shopping'`); await sleep(900)
const emptyClean = await ev(`
  (()=>{const p=[...document.querySelectorAll('p')].find(x=>x.textContent==='清单还是空的');
    if(!p) return 'no-empty';
    const prev=p.previousElementSibling;
    return prev && prev.querySelector('svg') ? 'has-motif' : 'clean'})()`)
check('撞色皮肤空态无点缀', emptyClean === 'clean', emptyClean)

// ── 6. 换色真实生效 + 持久化
const kleinPrimary = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()`)
await ev(`location.hash='#/theme'`); await sleep(400)
await clickSkin('klein'); await sleep(500)
const p2 = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()`)
check('切换撞色皮肤主色真的变', p2.toLowerCase() === '#2436b8' && p2 !== kleinPrimary, `${kleinPrimary} → ${p2}`)

await ev(`location.reload()`); await sleep(3200); await injectErr()
check('刷新后撞色皮肤保持', (await ev(`document.documentElement.getAttribute('data-theme')`)) === 'klein')

// ── 7. 深色模式
await ev(`location.hash='#/theme'`); await sleep(800)
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='深色').click()`); await sleep(600)
const dbg = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()`)
check('撞色深色模式底色切换', dbg.toLowerCase() === '#0b0d1a', dbg)
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='浅色').click()`); await sleep(400)

const errs = await ev(`window.__errs`)
check('无运行时错误', errs.length===0, errs.join(';'))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔ '+p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘ '+f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
console.log('色相间隔:', JSON.stringify(gaps))
ws.close(); chrome.kill(); process.exit(fail.length?1:0)
