// 本轮回归验证：Banner恢复/羽毛笔层级/资产同步/分类面板/预算页/时间轴弹窗信息
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9570
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-book4',
  `${BASE}/#/mine`], { stdio: 'ignore' })
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
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)

// 清理小账数据（保留 banners 验证前先测）
await ev(`location.hash='#/mine'`); await sleep(1500)

// ═══ ① 我呀 Banner 恢复 ═══
const banner = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.querySelector('img[src*="cut-4"]')&&x.getBoundingClientRect().height<=200);if(!el)return null;const r=el.getBoundingClientRect();return {h:Math.round(r.height), img:true}})()`)
check('Banner 恢复高度 152 + 玉桂狗插画', banner && banner.h>=148 && banner.h<=200 && banner.img, JSON.stringify(banner))
check('Banner 三行文字（主标题/副标题/日期）', await bodyHas('Titia 时序') && await bodyHas('让时间留下痕迹') && await bodyHas('2026 年 8 月 3 日'))

// ═══ ② 羽毛笔：z-index 高于 TabBar + 不遮挡 ═══
const fab = await ev(`(()=>{const b=document.querySelector('button[aria-label="灵光一闪"]');if(!b)return null;const z=getComputedStyle(b).zIndex;const tabbar=document.querySelector('nav.absolute.bottom-0');const tz=tabbar?getComputedStyle(tabbar).zIndex:null;const r=b.getBoundingClientRect();return {z, tz, y:Math.round(r.y)}})()`)
check('羽毛笔 z-index 高于 TabBar', fab && Number(fab.z) > Number(fab.tz), JSON.stringify(fab))
check('羽毛笔不被底部导航遮挡（y 在导航上方）', fab && fab.y < 852 - 80, JSON.stringify(fab))

// ═══ ③ 资产同步：记账驱动账户余额 ═══
await ev(`location.hash='#/book'`); await sleep(1500)
// 设支付宝余额 1000（点账户卡片 → 详情页 → 编辑）
await clickBtn('资产'); await sleep(700)
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('支付宝'));if(card)card.click();return !!card})()`)
await sleep(700)
await clickBtn('编辑'); await sleep(600)
await setInput('如 3000','1000'); await sleep(400)
await clickBtn('保存'); await sleep(700)
check('支付宝余额设置 1000', await bodyHas('¥1000.00'))
// 返回资产列表，后续余额变化在列表卡片上断言
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='‹');if(b)b.click();return !!b})()`)
await sleep(500)
// 记支出 200（支付宝）
await clickBtn('首页'); await sleep(600)
await clickBtn('记一笔'); await sleep(600)
await setInput('如 26.8','200'); await sleep(100)
await setInput('如 海底捞','早餐'); await sleep(100)
await ev(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent!==null&&[...x.options].some(o=>o.textContent.includes('支付宝')));if(!s)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(s,'支付宝');s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
await sleep(300)
await clickBtn('保存'); await sleep(800)
// 资产页余额应 800
await clickBtn('资产'); await sleep(700)
check('支出后支付宝余额 800（1000-200）', await bodyHas('¥800.00'))
// 记收入 500（支付宝）
await clickBtn('首页'); await sleep(600)
await clickBtn('记一笔'); await sleep(600)
await ev(`(()=>{const all=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim()==='收入');const el=all[all.length-1];if(el)el.click();return !!el})()`)
await sleep(300)
await setInput('如 26.8','500'); await sleep(100)
await setInput('如 海底捞','工资'); await sleep(100)
await ev(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent!==null&&[...x.options].some(o=>o.textContent.includes('支付宝')));if(!s)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(s,'支付宝');s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
await sleep(300)
await clickBtn('保存'); await sleep(800)
await clickBtn('资产'); await sleep(700)
check('收入后支付宝余额 1300（800+500）', await bodyHas('¥1300.00'))

// ═══ ④ 分类选择面板（一级网格 → 全宽二级区块） ═══
await clickBtn('首页'); await sleep(600)
await clickBtn('记一笔'); await sleep(600)
// 弹窗（记一笔 Sheet）打开时：羽毛笔必须隐藏，不遮挡弹窗内容
check('记一笔弹窗打开时羽毛笔隐藏', await ev(`!document.querySelector('button[aria-label="灵光一闪"]')`))
await setInput('如 26.8','32'); await sleep(100)
await setInput('如 海底捞','拿铁'); await sleep(100)
// 点分类按钮（显示"未分类"）
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().startsWith('未分类'));if(b)b.click();return !!b})()`)
await sleep(500)
check('分类面板出现一级网格（餐饮）', await bodyHas('选择分类') && await bodyHas('餐饮'))
// 点餐饮 → 在其所在行下方插入全宽二级区块（保持面板、不跳转）
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('餐饮')&&!x.textContent.includes('/'));if(b)b.click();return !!b})()`)
await sleep(500)
check('餐饮展开全宽二级区块（午餐/咖啡）', await bodyHas('午餐') && await bodyHas('咖啡'))
// 二级按钮：flex-wrap 横向自适应 + min-width 80px + 左右 padding 16px + 文字不拆分（nowrap）
const subRow = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='午餐'&&x.closest('.flex'));if(!b)return null;const p=b.parentElement;const cs=getComputedStyle(p);const bs=getComputedStyle(b);return {display:cs.display, wrap:cs.flexWrap, maxH:cs.maxHeight, minW:bs.minWidth, px:bs.paddingLeft, nowrap:bs.whiteSpace, txt:b.textContent.trim()}})()`)
check('二级横向自适应（flex-wrap+min-width 80px+padding16+不拆分）', subRow && subRow.display==='flex' && subRow.wrap==='wrap' && subRow.minW==='80px' && subRow.px==='16px' && subRow.nowrap==='nowrap' && subRow.txt==='午餐', JSON.stringify(subRow))
// 选咖啡
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().endsWith('咖啡'));if(b)b.click();return !!b})()`)
await sleep(500)
check('选择后显示「餐饮 / 咖啡」', await bodyHas('餐饮 / 咖啡') || await bodyHas('🍜 餐饮 / 咖啡'))
// 关闭弹窗后羽毛笔恢复
await ev(`(()=>{const c=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes('取消'));if(c)c.click();return true})()`)
await sleep(500)
check('关闭弹窗后羽毛笔恢复显示', await ev(`!!document.querySelector('button[aria-label="灵光一闪"]')`))

// ═══ ⑤ 预算：首页 6 行 + 查看全部预算页 ═══
await ev(`(()=>{const c=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes('取消'));if(c)c.click();return true})()`)
await sleep(400)
await clickBtn('首页'); await sleep(600)
check('首页预算卡显示「查看全部预算」', await bodyHas('查看全部预算'))
// 点进预算页
await ev(`(()=>{const els=[...document.querySelectorAll('button,[role="button"]')].filter(x=>x.offsetParent!==null&&x.textContent.includes('查看全部预算'));if(els.length)els[0].click();return true})()`)
await sleep(700)
check('预算管理页出现（返回首页/新增预算）', await bodyHas('预算管理') && await bodyHas('返回首页'))

// ═══ ⑥ 时间轴弹窗完整信息（人物） ═══
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    if(![...db.objectStoreNames].includes('countdownEvents')){res('no');return}
    const tx=db.transaction('countdownEvents','readwrite');
    const s=tx.objectStore('countdownEvents');
    s.put({id:'tl-ck',kind:'expected',title:'妈妈生日',category:'family',eventType:'birthday',relation:'妈妈',dateType:'solar',solarDate:'2026-08-20',avatar:'🎂',createdAt:Date.now(),updatedAt:Date.now(),deletedAt:null,_dirty:1,_syncedAt:null});
    tx.oncomplete=()=>res('ok');};})
`)
await sleep(300)
await ev(`location.hash='#/space'`); await sleep(1500)
await clickBtn('倒数日'); await sleep(900)
await clickBtn('时间轴'); await sleep(700)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('8 月'));if(b)b.click();return true})()`)
await sleep(700)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='20'&&x.closest('.grid'));if(b)b.click();return true})()`)
await sleep(600)
check('时间轴弹窗显示人物（妈妈）', await bodyHas('人物：妈妈'))
check('时间轴弹窗显示类型与日期', await bodyHas('类型：生日') && await bodyHas('2026-08-20'))

// ═══ ⑦ 羽毛笔轻触（tap）→ 打开灵光一闪（用户反馈的"轻触"行为；拖动已由 bookcheck3 覆盖） ═══
await ev(`location.hash='#/mine'`); await sleep(1200)
// headless 最小窗口 500 宽：mount 时 innerWidth=500 会把羽毛笔算到视口外（x>393）；
// 先写入视口内坐标并 reload（产品在真机 393 视口下位置正常，此为测试时序修正）
await ev(`localStorage.setItem('titia.fabPos', JSON.stringify({ x: 300, y: 500 }))`)
await ev(`location.reload()`); await sleep(2500)
const fabT = await ev(`(()=>{const b=document.querySelector('button[aria-label="灵光一闪"]');if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y)}})()`)
if (fabT) {
  // 同位置按下+松开（无移动）→ 真实轻触路径（onPointerUp 无拖动 → navigate /spark）
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fabT.x + 24, y: fabT.y + 24, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fabT.x + 24, y: fabT.y + 24, button: 'left', clickCount: 1 })
  await sleep(900)
}
check('羽毛笔轻触打开灵光一闪', await ev(`location.hash`) === '#/spark', `hash=${await ev(`location.hash`)} fabT=${JSON.stringify(fabT)}`)

try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
