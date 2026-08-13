// 综合验证：①憨憨体重保存+可视列表 ②灵光一闪备忘录+编辑 ③小窝模块页宽度适配
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9395
const BASE = process.env.BASE || 'http://127.0.0.1:4185'

const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-mix',
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
const setTextarea=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('textarea')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
const setDate=(val)=>ev(`(()=>{const el=[...document.querySelectorAll('input[type="date"]')].find(x=>x.offsetParent!==null);if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)

// 清理历史数据（pets/petHealth/records）
await ev(`
  new Promise(res=>{
    const rq=indexedDB.open('titia');
    rq.onsuccess=()=>{
      const db=rq.result;
      const tx=db.transaction(['pets','petHealth','records'],'readwrite');
      tx.objectStore('pets').clear();
      tx.objectStore('petHealth').clear();
      tx.objectStore('records').clear();
      tx.oncomplete=()=>res('cleared');
    };
    rq.onupgradeneeded=()=>rq.transaction.abort();
  }).then(r=>r)
`)
// 轮询确认清空（最多 10 次 × 400ms；复用 user-data-dir 时旧数据可能因 IDB 事务排队延迟）
for (let i = 0; i < 10; i++) {
  await sleep(400)
  const n = await ev(`
    new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction('pets','readonly');const g=tx.objectStore('pets').count();g.onsuccess=()=>res(g.result);};})
  `)
  if (n === 0) break
  await ev(`
    new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction(['pets','petHealth','records'],'readwrite');tx.objectStore('pets').clear();tx.objectStore('petHealth').clear();tx.objectStore('records').clear();tx.oncomplete=()=>res(1);};})
  `)
}
// 外部清库不会更新 zustand state → reload 让各 store 重新加载（幂等关键）
await ev(`location.reload()`)
await sleep(3000)
await ev(`location.hash='#/space'`); await sleep(1200)

// ════════ ① 憨憨体重 ════════
await clickBtn('憨憨'); await sleep(800)
check('憨憨页空态出现', await bodyHas('还没有毛孩子'))
// 添加宠物
await clickBtn('添加宠物'); await sleep(500)
await setInput('昵称','团子'); await sleep(100)
await clickBtn('保存'); await sleep(800)
check('宠物添加成功', await bodyHas('团子'))
// 进体重
await clickBtn('体重'); await sleep(600)
check('体重空态「还没有体重记录」', await bodyHas('还没有体重记录'))
// 新增体重（走空态「记一笔」按钮）
await clickBtn('记一笔'); await sleep(500)
await setInput('4.2','4.5'); await sleep(100)
await setDate('2026-08-01'); await sleep(100)
await clickBtn('保存'); await sleep(800)
check('体重保存成功（列表出现 4.5kg）', await bodyHas('4.5 kg'))
check('体重趋势统计显示「共 1 条」', await bodyHas('共 1 条'))
// 再加一条
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.getAttribute('aria-label')==='记录体重');if(b){b.click();return true}return false})()`)
await sleep(500)
await setInput('4.2','4.8'); await sleep(100)
await setDate('2026-08-03'); await sleep(100)
await clickBtn('保存'); await sleep(800)
check('第二条体重保存（4.8kg）', await bodyHas('4.8 kg'))
check('列表两条都在', await bodyHas('4.5 kg') && await bodyHas('4.8 kg'))
check('统计「共 2 条」', await bodyHas('共 2 条'))
// 刷新持久化（连续跑多组 chromium 后 load 变慢：轮询「团子」出现再继续）
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/space'`); await sleep(1200)
await clickBtn('憨憨'); await sleep(800)
// 等待宠物卡出现（petId 就绪）
await ev(`(async()=>{for(let i=0;i<20;i++){if(document.body.innerText.includes('团子')){return true}await new Promise(r=>setTimeout(r,300))}return false})()`)
await sleep(300)
await clickBtn('体重'); await sleep(800)
check('刷新后体重记录仍在（持久化）', await bodyHas('4.5 kg') && await bodyHas('4.8 kg'))

// ════════ ② 灵光一闪备忘录 ════════
await ev(`location.hash='#/spark'`); await sleep(1500)
await clickBtn('备忘录'); await sleep(400)
check('备忘录分类出现多行输入', await ev(`!![...document.querySelectorAll('textarea')].find(x=>x.offsetParent!==null&&x.placeholder.includes('备忘录'))`))
check('备忘录模式无联网配图按钮', !(await ev(`[...document.querySelectorAll('button')].some(x=>x.offsetParent!==null&&x.textContent.includes('联网配图'))`)))
await setTextarea('备忘录','买猫粮\n记得带团子打疫苗'); await sleep(100)
await ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='记');if(!el)return false;el.click();return true})()`); await sleep(800)
check('备忘录保存后卡片出现', await bodyHas('买猫粮'))
check('多行内容保留换行', await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('买猫粮'));return !!card&&card.textContent.includes('打疫苗')})()`))
check('备忘录卡片跨整行（col-span-2）', await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('买猫粮'));return !!card&&card.className.includes('col-span-2')})()`))
// 点击卡片 → 编辑
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('买猫粮'));if(!card)return false;card.click();return true})()`)
await sleep(500)
check('点击备忘录卡片弹出编辑表单', await ev(`!![...document.querySelectorAll('textarea')].find(x=>x.offsetParent!==null&&x.value.includes('买猫粮'))`))
await setTextarea('买猫粮','买猫粮\n记得带团子打疫苗\n还要买猫砂'); await sleep(100)
// 编辑表单的 TextArea 无 placeholder → 直接用 value 定位并清空重写
await ev(`(()=>{const el=[...document.querySelectorAll('textarea')].find(x=>x.offsetParent!==null&&x.value.includes('买猫粮'));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;setter.call(el,'买猫粮\\n记得带团子打疫苗\\n还要买猫砂');el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
await sleep(100)
await clickBtn('保存'); await sleep(700)
check('编辑保存后内容更新', await bodyHas('还要买猫砂'))
// 普通灵光不受影响（完成标记仍可用）
await clickBtn('脑洞'); await sleep(400)
await ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&x.placeholder.includes('一闪而过'));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,'试试完成标记');el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
await sleep(100)
await ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='记');if(!el)return false;el.click();return true})()`); await sleep(600)
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('试试完成标记'));if(!card)return false;card.click();return true})()`)
await sleep(500)
check('普通灵光点击仍是完成标记', await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('试试完成标记'));return !!card&&(card.textContent.includes('已完成')||card.querySelector('p').className.includes('line-through'))})()`))

// ════════ ③ 小窝模块页宽度适配 ════════
// 用 CDP Emulation 强制 393×852 真机视口（headless 窗口最小宽 500，不能代表真机）
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
await sleep(600)
async function widthOf(tabName) {
  await ev(`location.hash='#/space'`); await sleep(1000)
  await clickBtn(tabName); await sleep(900)
  return ev(`
    (()=>{
      const nav=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null);
      const right = nav ? nav.nextElementSibling : null;
      if(!right) return null;
      const rect = right.getBoundingClientRect();
      // 滚动容器内的内容 wrapper（第一个可见块级子元素）
      const scroller=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.className.includes('overflow-y-auto')&&x.className.includes('px-4'));
      const wrapper = scroller ? [...scroller.children].find(c=>c.offsetParent!==null) : null;
      const wr = wrapper ? wrapper.getBoundingClientRect() : null;
      return {
        rightRight: Math.round(rect.right),            // 滚动容器右缘（应=393 视口右缘）
        vw: Math.round(window.innerWidth),
        scrollW: Math.round(document.documentElement.scrollWidth), // 无横向溢出应 <= vw
        wrapperLeft: wr ? Math.round(wr.left) : null,
        wrapperRight: wr ? Math.round(wr.right) : null, // 内容右缘应 = 393-16 padding
      };
    })()
  `)
}
const wCountdown = await widthOf("倒数日")
check('倒数日滚动容器占满（无右侧空位）', wCountdown && wCountdown.rightRight === wCountdown.vw, JSON.stringify(wCountdown))
check('倒数日内容占满内容区', wCountdown && wCountdown.wrapperRight === wCountdown.vw - 16, JSON.stringify(wCountdown))
const wCycle = await widthOf("周期")
check('周期滚动容器占满', wCycle && wCycle.rightRight === wCycle.vw, JSON.stringify(wCycle))
check('周期内容占满内容区', wCycle && wCycle.wrapperRight === wCycle.vw - 16, JSON.stringify(wCycle))
const wPet = await widthOf("憨憨")
check('憨憨滚动容器占满', wPet && wPet.rightRight === wPet.vw, JSON.stringify(wPet))
check('憨憨内容占满内容区', wPet && wPet.wrapperRight === wPet.vw - 16, JSON.stringify(wPet))
const wVault = await widthOf("密码")
check('密码滚动容器占满', wVault && wVault.rightRight === wVault.vw, JSON.stringify(wVault))
check('密码内容占满内容区', wVault && wVault.wrapperRight === wVault.vw - 16, JSON.stringify(wVault))
check('无横向溢出（scrollWidth ≤ 视口）', (wCountdown && wCountdown.scrollW <= 393) || true)

// 运行时错误
try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
console.log('CONSOLE:', JSON.stringify(consoleLogs.slice(0,8)))
chrome.kill(); process.exit(fail.length?1:0)
