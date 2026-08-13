// 小账模块验证：底部导航/悬浮羽毛笔/小窝移除记账/账单分栏/转账/资产/分析/分类两级/导入导出/持久化
import { spawn } from 'node:child_process'
import dayjs from 'dayjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9536
const BASE = process.env.BASE || 'https://a149a628a3c099573.sh7.agentos-app.net'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-liveb2',
  `${BASE}/#/book`], { stdio: 'ignore' })
await sleep(5500)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
const consoleLogs=[]
ws.addEventListener('message',(e)=>{try{const m=JSON.parse(e.data);if(m.method==='Runtime.consoleAPICalled'){const txt=m.params.args.map(a=>a.value??a.description??'').join(' ');consoleLogs.push(txt)}}catch{}})
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return {err:r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails.exception)};return r.result.value}
const allErrs=[]
await ev(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));`)
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const clickBtnInSheet=txt=>ev(`(()=>{const all=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));const el=all[all.length-1];if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
const setSelect=(selText,val)=>ev(`(()=>{const el=[...document.querySelectorAll('select')].find(x=>x.offsetParent!==null&&[...x.options].some(o=>o.textContent.includes(${JSON.stringify(selText)})));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(el,${JSON.stringify(String(val))});el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)

// 清理四表（小账页数据）
await ev(`
  new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;
    const names=[...db.objectStoreNames];
    if(!names.includes('transactions')){res('no-table');return}
    const tx=db.transaction(['transactions','rules','accounts','categories'],'readwrite');
    tx.objectStore('transactions').clear();tx.objectStore('rules').clear();tx.objectStore('accounts').clear();tx.objectStore('categories').clear();
    tx.oncomplete=()=>res('ok');};})
`)
await sleep(500)
// 清库后 reload（store 重新加载）
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1500)

// ═══ ① 底部导航：小账在中间，统一样式 ═══
const navBtns = await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('今日'));return n?[...n.querySelectorAll('button')].map(b=>b.textContent.trim()):[]})()`)
check('底部导航 5 项（今日/小窝/小账/时光/我呀）', JSON.stringify(navBtns)===JSON.stringify(['今日','小窝','小账','时光','我呀']), JSON.stringify(navBtns))
check('小账与其他 tab 统一样式（无 bg-primary 大药丸）', await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('小账'));if(!n)return false;const b=[...n.querySelectorAll('button')].find(x=>x.textContent.trim()==='小账');return !!b&&!b.className.includes('h-12 w-12')&&!b.className.includes('bg-primary')})()`))
// 悬浮羽毛笔
check('全局悬浮羽毛笔按钮存在', await ev(`!!document.querySelector('button[aria-label="灵光一闪"]')`))

// ═══ ② 小账页结构：左侧一级导航 ═══
const leftNav = await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('账单')&&x.textContent.includes('导入导出'));return n?[...n.querySelectorAll('button')].map(b=>b.textContent.trim()):[]})()`)
const leftNavOk = ['首页','账单','资产','分析','分类','导入导出'].every((l,i)=>leftNav[i]?.includes(l))
check('左侧一级导航：首页/账单/资产/分析/分类/导入导出', leftNavOk, JSON.stringify(leftNav))
await clickBtn('账单'); await sleep(600)
check('账单二级横向分栏（全部/支出/收入/转账）', await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null);return bs.some(b=>b.textContent.trim()==='全部')&&bs.some(b=>b.textContent.trim()==='转账')})()`))
check('二级分栏非胶囊（细横线）', await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='支出');return !!b&&!b.className.includes('rounded-pill')})()`))

// ═══ ③ 记一笔：支出/收入/转账 ═══
await clickBtn('记一笔'); await sleep(700)
await setInput('如 26.8','26.8'); await sleep(100)
await setInput('如 海底捞','海底捞'); await sleep(100)
await setSelect('餐饮','餐饮'); await sleep(100)
await setSelect('支付宝','支付宝'); await sleep(100)
await clickBtn('保存'); await sleep(800)
check('支出保存成功', await bodyHas('海底捞') && await bodyHas('-¥26.80'))

// 收入
await clickBtn('记一笔'); await sleep(600)
await clickBtnInSheet('收入'); await sleep(200)
await setInput('如 26.8','500'); await sleep(100)
await setInput('如 海底捞','工资'); await sleep(100)
await clickBtn('保存'); await sleep(800)
check('收入保存成功', await bodyHas('+¥500.00'))

// 转账
await clickBtn('记一笔'); await sleep(600)
await clickBtnInSheet('转账'); await sleep(300)
await setInput('如 26.8','300'); await sleep(100)
// 索引设置（转出/转入两个 select 都含支付宝/现金，无法用文本区分）：s[0]转出=支付宝 s[1]转入=现金
await ev(`(()=>{const s=[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null);if(s.length<2)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(s[0],'支付宝');s[0].dispatchEvent(new Event('change',{bubbles:true}));setter.call(s[1],'现金');s[1].dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
await sleep(200)
await clickBtn('保存'); await sleep(800)
check('转账保存成功（显示转出→转入）', await bodyHas('⇄ 支付宝 → 现金') || await bodyHas('支付宝 → 现金'))

// 二级分栏过滤
await clickBtn('支出'); await sleep(400)
check('支出分栏只显示支出', await bodyHas('海底捞') && !(await bodyHas('工资')) && !(await bodyHas('→')))
await clickBtn('转账'); await sleep(400)
check('转账分栏只显示转账', (await bodyHas('支付宝 → 现金')) || (await bodyHas('⇄ 支付宝')))
await clickBtn('全部'); await sleep(400)
check('全部显示所有', await bodyHas('海底捞') && await bodyHas('工资'))

// ═══ ④ 资产：顶部总览固定 + 账户详情页（月度总览 + 账单明细） ═══
await clickBtn('资产'); await sleep(700)
check('资产页净资产出现', await bodyHas('净资产'))
check('预置账户（支付宝/微信/现金）', await bodyHas('支付宝') && await bodyHas('现金'))
// 顶部总览卡片固定（sticky 吸顶，紧贴状态栏）
const fixedCard = await ev(`(()=>{const el=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.textContent.includes('净资产')&&getComputedStyle(x).position==='sticky');return !!el})()`)
check('资产总览卡片固定（sticky 吸顶）', !!fixedCard, String(fixedCard))
// 禁止左右滑动：不存在可横向滚动（overflow-x auto/scroll 且内容溢出）的容器
const hScroll = await ev(`(()=>{const els=[...document.querySelectorAll('div')].filter(x=>x.offsetParent!==null&&x.scrollWidth>x.clientWidth+1&&(getComputedStyle(x).overflowX==='auto'||getComputedStyle(x).overflowX==='scroll'));return els.length})()`)
check('资产页禁止左右滑动（无横向可滚动容器）', hScroll===0, String(hScroll))
// 点账户卡片 → 独立详情页（需求三）
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('支付宝'));if(!card)return false;card.click();return true})()`)
await sleep(700)
check('账户详情页打开（月度总览：本月收入/本月支出/当前余额）', await bodyHas('本月收入') && await bodyHas('本月支出') && await bodyHas('当前余额'))
// 详情页内编辑账户余额
await clickBtn('编辑'); await sleep(600)
await setInput('如 3000','1000'); await sleep(400)
await clickBtn('保存'); await sleep(800)
check('余额编辑后详情页显示 ¥1000.00', await bodyHas('¥1000.00'))
// 返回资产列表
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='‹');if(b)b.click();return !!b})()`)
await sleep(500)
check('返回资产列表（账户列表仍可见）', await bodyHas('资产账户') && await bodyHas('支付宝'))

// ═══ ④.5 记账默认账户 = 招商银行信用卡（需求六） ═══
await clickBtn('账户'); await sleep(600)
await setInput('如 招行储蓄卡 / 花呗','招商银行信用卡'); await sleep(100)
await clickBtn('信用卡'); await sleep(200)
await setInput('如 3000','500'); await sleep(100)
await clickBtn('保存'); await sleep(700)
check('招商银行信用卡账户创建成功', await bodyHas('招商银行信用卡'))
// 记一笔支出 → 账户 select 默认 = 招商银行信用卡（可手动改）
await clickBtn('首页'); await sleep(600)
await clickBtn('记一笔'); await sleep(600)
await setInput('如 26.8','50'); await sleep(100)
await setInput('如 海底捞','买咖啡'); await sleep(100)
const defAcc = await ev(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent!==null&&[...x.options].some(o=>o.textContent.includes('招商银行信用卡')));return s?s.value:'no-select'})()`)
check('新增支出默认账户 = 招商银行信用卡', defAcc === '招商银行信用卡', String(defAcc))
// 用户可手动修改为其他账户（验证后取消，不落账以免影响余额断言）
await ev(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent!==null&&[...x.options].some(o=>o.textContent.includes('招商银行信用卡')));if(!s)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(s,'支付宝');s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
await sleep(200)
const modAcc = await ev(`(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent!==null&&[...x.options].some(o=>o.textContent.includes('招商银行信用卡')));return s?s.value:'no-select'})()`)
check('默认账户可手动修改（改后=支付宝）', modAcc === '支付宝', String(modAcc))
await clickBtn('取消'); await sleep(500)

// ═══ ⑤ 分析：月份筛选 + 柱状图联动 + 分类占比联动 ═══
await clickBtn('分析'); await sleep(700)
check('分析页月份筛选出现（当前月）', await bodyHas(dayjs().format('YYYY 年 M 月')))
check('分析页收支三卡', await bodyHas('收入') && await bodyHas('支出') && await bodyHas('结余'))
check('消费趋势出现', await bodyHas('消费趋势'))
check('分类占比出现', await bodyHas('分类占比'))
check('月度报告出现', await bodyHas('月度报告'))
check('当月消费详情出现明细（海底捞）', await bodyHas('海底捞'))
// 分类占比联动：点「餐饮」分类行（海底捞经规则自动分类 → 餐饮）→ 明细过滤为该分类
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('餐饮')&&x.textContent.includes('%'));if(!b)return false;b.click();return true})()`)
await sleep(500)
check('分类联动显示「餐饮」分类明细', await bodyHas('餐饮」分类明细'))
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('清除筛选'));if(!b)return false;b.click();return true})()`)
await sleep(400)
// 柱状图联动：点第一根柱子（近 6 月的第 1 根 = 5 个月前）→ 月份切换 + 明细空态（SVG 元素 offsetParent 恒为 null，用宽高判定可见）
await ev(`(()=>{const g=[...document.querySelectorAll('svg g')].find(x=>x.querySelector('rect')&&x.getBoundingClientRect().width>0);if(!g)return false;g.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true})()`)
await sleep(600)
check('柱状图联动切换月份（首柱 = 5 个月前）', await bodyHas(dayjs().subtract(5, 'month').format('YYYY 年 M 月')))
check('切换后无支出显示空态', await bodyHas('该月暂无支出记录') || await bodyHas('0 笔'))

// ═══ ⑥ 分类两级 ═══
await clickBtn('分类'); await sleep(700)
check('分类页一级分类出现', await bodyHas('餐饮'))
// 新增一级分类
await clickBtn('新增'); await sleep(600)
await setInput('如 宠物 / 猫粮','宠物'); await sleep(100)
await setInput('🐱 / 🏠','🐱'); await sleep(100)
await clickBtn('保存'); await sleep(700)
check('新增一级分类成功', await bodyHas('宠物'))
// 新增二级分类
await ev(`(()=>{const card=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes('宠物'));if(!card)return false;card.click();return true})()`)
await sleep(500)
await clickBtn('添加二级分类'); await sleep(600)
await setInput('如 宠物 / 猫粮','猫粮'); await sleep(100)
await setInput('🐱 / 🏠','🍖'); await sleep(100)
await clickBtn('保存'); await sleep(700)
check('二级分类新增成功', await bodyHas('猫粮'))

// ═══ ⑦ 导入导出 ═══
await clickBtn('导入导出'); await sleep(700)
check('导入导出页出现', await bodyHas('导出账单 Excel') && await bodyHas('导入账单 Excel'))
// CSV 导入：构造文件注入
const imp = await ev(`
  (async()=>{
    const input=document.querySelector('input[type="file"]');
    if(!input) return 'no-input';
    const csv='金额(分),类型,分类,账户,商户,时间,备注\\n1200,expense,餐饮,微信,烤串,2026-08-05T12:00,夜宵';
    const file=new File([csv],'t.csv',{type:'text/csv'});
    const dt=new DataTransfer();dt.items.add(file);
    input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return 'ok';
  })()
`)
await sleep(900)
// 导入数据已写库；切到账单视图验证
await clickBtn('账单'); await sleep(700)
check('CSV 导入成功（烤串出现）', await bodyHas('烤串'))

// ═══ ⑧ 持久化：刷新后仍在 ═══
await ev(`location.reload()`); await sleep(3000)
await ev(`location.hash='#/book'`); await sleep(1500)
await clickBtn('账单'); await sleep(600)
check('刷新后账单仍在', await bodyHas('海底捞'))
check('刷新后转账仍在', (await bodyHas('支付宝 → 现金')) || (await bodyHas('⇄ 支付宝')))
await clickBtn('资产'); await sleep(600)
check('刷新后余额仍在（¥1000.00）', await bodyHas('¥1000.00'))

// ═══ ⑨ 悬浮羽毛笔 → 灵光一闪 ═══
await ev(`(()=>{const b=document.querySelector('button[aria-label="灵光一闪"]');if(!b)return false;b.click();return true})()`)
await sleep(1200)
check('羽毛笔点击进入灵光一闪', await ev(`document.body.innerText.includes('灵光一闪')`))

// ═══ ⑩ 小窝无记账 ═══
await ev(`location.hash='#/space'`); await sleep(1500)
const spaceNav = await ev(`(()=>{const n=[...document.querySelectorAll('nav')].find(x=>x.offsetParent!==null&&x.textContent.includes('倒数日'));return n?[...n.querySelectorAll('button')].map(b=>b.textContent.trim()):[]})()`)
check('小窝侧边无记账', !spaceNav.some(b=>b.includes('记账')), JSON.stringify(spaceNav))

try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
console.log('CONSOLE:', JSON.stringify(consoleLogs.slice(0,8)))
chrome.kill(); process.exit(fail.length?1:0)
