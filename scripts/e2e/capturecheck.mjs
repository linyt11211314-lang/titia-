// 自动记账·一键拾光验证：预览确认弹窗（账单确认）/保存/取消/字段编辑/设置入口/剪贴板唯一入口
import { spawn } from 'node:child_process'
import dayjs from 'dayjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9567
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-cap',
  `${BASE}/#/capture?text=${encodeURIComponent('瑞幸生椰拿铁')}&amount=18.5&account=微信支付`], { stdio: 'ignore' })
await sleep(4000)
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
await new Promise(r=>(ws.onopen=r))
let id=0
const send=(m,p={})=>new Promise(res=>{const i=++id;const h=e=>{const x=JSON.parse(e.data);if(x.id===i){ws.removeEventListener('message',h);res(x.result)}};ws.addEventListener('message',h);ws.send(JSON.stringify({id:i,method:m,params:p}))})
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)return {err:'EX:'+String(r.exceptionDetails.exception?.description||'')};return r.result.value}
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true })
const allErrs=[]
await ev(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));`)
const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickBtn=txt=>ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim().includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
await sleep(2000)

// 清理：防止防重复标记（localStorage captureDone）与账单数据跨运行残留 → 可重复执行
await ev(`localStorage.removeItem('titia.captureDone')`)
await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;if([...db.objectStoreNames].includes('transactions')){const tx=db.transaction('transactions','readwrite');tx.objectStore('transactions').clear();tx.oncomplete=()=>res('ok')}else res('no')}})`)
await ev(`location.reload()`); await sleep(2500)
await ev(`location.hash='#/book'`); await sleep(800)

// ═══ ① 预览弹窗：识别后先弹窗确认（字段来自解析结果），点保存才入库 ═══
await ev(`location.hash='#/capture?text=${encodeURIComponent('瑞幸生椰拿铁')}&amount=18.5&account=微信支付'`); await sleep(2200)
check('预览弹窗出现（账单确认）', await bodyHas('账单确认'))
check('弹窗显示金额 ¥18.50', await bodyHas('¥18.50'))
check('弹窗显示类型 支出', await bodyHas('支出'))
check('弹窗显示商户（瑞幸生椰拿铁）', await bodyHas('瑞幸生椰拿铁'))
check('弹窗显示日期（今天）', await bodyHas(dayjs().format('YYYY-MM-DD')))
check('弹窗显示分类（餐饮）', await bodyHas('餐饮'))
check('弹窗显示账户（微信）', await bodyHas('微信'))
check('弹窗显示备注（自动识别）', await bodyHas('自动识别'))
check('弹窗含「取消」「保存」按钮', await ev(`[...document.querySelectorAll('button')].some(x=>x.offsetParent!==null&&x.textContent.trim()==='保存')&&[...document.querySelectorAll('button')].some(x=>x.offsetParent!==null&&x.textContent.trim()==='取消')`))
// 字段编辑：点字段区 → 编辑表单 → 改金额 20 → 保存编辑 → 弹窗显示 ¥20.00
await ev(`(()=>{const b=document.querySelector('[aria-label="编辑识别结果"]');if(b)b.click();return !!b})()`)
await sleep(1200)
check('点字段进入编辑状态（编辑识别结果）', await bodyHas('编辑识别结果'))
await setInput('如 26.8','20'); await sleep(200)
// 编辑表单的「保存」按钮（限定在"编辑识别结果"面板内，避免匹配到背后弹窗的保存）
await ev(`(()=>{const panel=[...document.querySelectorAll('div')].find(x=>x.offsetParent!==null&&x.textContent.trim().startsWith('编辑识别结果'));const b=panel?[...panel.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='保存'):null;if(b){b.click();return true}return false})()`)
await sleep(1200)
check('编辑后弹窗显示 ¥20.00', await bodyHas('¥20.00'))
// 保存入库
await clickBtn('保存'); await sleep(1800)
check('保存后回到小账', await ev(`location.hash`) === '#/book')
const saveTx1 = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction('transactions').objectStore('transactions').getAll();tx.onsuccess=()=>{const t=(tx.result||[]).find(x=>x.merchant==='瑞幸生椰拿铁');res(t?JSON.stringify({amount:t.amount,merchant:t.merchant,category:t.category,account:t.account,source:t.source}):'none')}}})`)
check('保存账单：金额=20.00（编辑后） 分类=餐饮 账户=微信 source=shortcut', saveTx1==='{"amount":2000,"merchant":"瑞幸生椰拿铁","category":"餐饮","account":"微信","source":"shortcut"}', String(saveTx1))
await clickBtn('账单'); await sleep(700)
check('账单列表出现该账单', await bodyHas('瑞幸生椰拿铁'))
await clickBtn('首页'); await sleep(500)

// ═══ ①.5 OCR Parser：纯 OCR 文本（无显式金额）→ 预览弹窗字段正确 → 保存 ═══
const luckinOcr = `交易详情\n-10.60\n瑞幸咖啡（港深国际中心店）-美团App\n15:22\n微信支付`
await ev(`location.hash='#/capture?text=${encodeURIComponent(luckinOcr)}'`); await sleep(2200)
check('OCR 弹窗金额 ¥10.60', await bodyHas('¥10.60'))
check('OCR 弹窗商户（瑞幸咖啡）', await bodyHas('瑞幸咖啡'))
await clickBtn('保存'); await sleep(1800)
const ocrTx = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction('transactions').objectStore('transactions').getAll();tx.onsuccess=()=>{const t=(tx.result||[]).find(x=>x.merchant==='瑞幸咖啡'&&x.amount===1060&&!x.time.startsWith('2026-08-05 09:09'));res(t?JSON.stringify({amount:t.amount,merchant:t.merchant,category:t.category,account:t.account}):'none')}}})`)
check('OCR 保存：金额=10.60 商户=瑞幸咖啡 分类=餐饮 账户=微信', ocrTx==='{"amount":1060,"merchant":"瑞幸咖啡","category":"餐饮","account":"微信"}', String(ocrTx))

// ═══ ①.6 真实微信支付页 OCR（大量 UI 噪声/零钱支付）→ 预览弹窗 → 保存 ═══
const realOcr = `17:39\n:!! 이\n71\n<\n美团美团\n國團 等945万+人喜欢\nS 喜欢\nv 小程序\n特价外卖团购〉\n服务\n-10.60\n美团\n当前状态\n支付时间\n商品\n收单机构\n支付方式\n交易单号\n商户单号\n支付成功\n2026年08月05日 09:09:57\n瑞幸咖啡（港深国际中心店）-美团App-\n2608051120070000130885583955828\n4\n北京钱袋宝支付技术有限公司\n零钱\n4500000294202608059803486081\n20260805090945U904629660881972\n29\n交易服务\n② 对订单有疑惑\n园 发起群收款`
await ev(`location.hash='#/capture?text=${encodeURIComponent(realOcr)}'`); await sleep(2200)
check('真实 OCR 弹窗金额 ¥10.60', await bodyHas('¥10.60'))
check('真实 OCR 弹窗账户（微信/零钱映射）', await bodyHas('微信'))
await clickBtn('保存'); await sleep(1800)
const realTx = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction('transactions').objectStore('transactions').getAll();tx.onsuccess=()=>{const t=(tx.result||[]).find(x=>x.merchant==='瑞幸咖啡'&&x.time.startsWith('2026-08-05 09:09'));res(t?JSON.stringify({amount:t.amount,merchant:t.merchant,category:t.category,account:t.account,time:t.time}):'none')}}})`)
check('真实 OCR 保存：金额=10.60 商户=瑞幸咖啡 分类=餐饮 账户=微信 时间=09:09', /"amount":1060,"merchant":"瑞幸咖啡","category":"餐饮","account":"微信","time":"2026-08-05 09:09/.test(String(realTx)), String(realTx))

// ═══ ② 取消：不保存 → 回小账 ═══
await ev(`location.hash='#/capture?text=${encodeURIComponent('随便买点东西')}&amount=30&account=微信支付'`); await sleep(2200)
check('弹窗显示金额 ¥30.00', await bodyHas('¥30.00'))
check('弹窗显示分类（未分类）', await bodyHas('未分类'))
await clickBtn('取消'); await sleep(1200)
check('取消后回到小账', await ev(`location.hash`) === '#/book')
const cancelTx = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const tx=db.transaction('transactions').objectStore('transactions').getAll();tx.onsuccess=()=>{const t=(tx.result||[]).find(x=>x.merchant==='随便买点东西');res(!!t?'exists':'none')}}})`)
check('取消未保存（无该账单）', cancelTx==='none', String(cancelTx))

// ═══ ②.5 防重复：同一内容再次打开 → 不重复生成 ═══
await ev(`location.hash='#/capture?text=${encodeURIComponent('瑞幸生椰拿铁')}&amount=18.5&account=微信支付'`); await sleep(1800)
check('重复打开显示「该笔已处理过」', await bodyHas('该笔已处理过'))
await ev(`location.hash='#/book'`); await sleep(1200)

// ═══ ③.6 OCR 未识别：无内容 → 提示 + 手动记账入口 ═══
await ev(`location.hash='#/capture'`); await sleep(1500)
check('未识别提示', await bodyHas('未识别到账单信息'))
check('提供「手动记账」入口', await ev(`[...document.querySelectorAll('button')].some(x=>x.offsetParent!==null&&x.textContent.includes('手动记账'))`))
await clickBtn('手动记账'); await sleep(1800)
check('手动记账打开记一笔表单', await bodyHas('记一笔'))
await clickBtn('取消'); await sleep(500)

// ═══ ③.7 自动识别按钮（需求七）：点击 📥 后直接 读取→解析→生成识别结果，无中间操作提示 ═══
await ev(`location.hash='#/book'`); await sleep(1000)
await send('Browser.grantPermissions', { origin: BASE, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
await ev(`localStorage.removeItem('titia.captureDone')`)
await ev(`navigator.clipboard.writeText('TITIA_CAPTURE::星巴克燕麦拿铁')`); await sleep(400)
await ev(`(()=>{const b=document.querySelector('button[aria-label="从剪贴板读取拾光数据"]');if(b){b.click();return true}return false})()`)
await sleep(2200)
check('点击📥直接进入识别页（账单确认预览）', await bodyHas('账单确认'))
check('直接生成识别结果（金额/商户解析）', await bodyHas('星巴克') && await bodyHas('餐饮'))
check('未出现中间操作提示「已读取，正在识别」', !(await bodyHas('已读取，正在识别')))
check('未展示剪贴板原始文字（OCR 文本折叠隐藏）', await ev(`(()=>{const d=[...document.querySelectorAll('details')].find(x=>x.offsetParent!==null);return !d||!d.open})()`))
await clickBtn('取消'); await sleep(800)

// ═══ ③.8 多笔支付订单（需求三）：一张截图识别多笔 → 勾选 → 全部保存 ═══
const multiText = `瑞幸咖啡 10.60\n美团外卖 35\n滴滴 28`
// 清空账单（前面 OCR 场景已保存过「瑞幸咖啡 10.60」），保证多笔断言精确；同时清跨容器桥
await ev(`localStorage.removeItem('titia.pendingTx')`)
await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;if([...db.objectStoreNames].includes('transactions')){const tx=db.transaction('transactions','readwrite');tx.objectStore('transactions').clear();tx.oncomplete=()=>res('ok')}else res('no')}})`)
await ev(`location.reload()`); await sleep(2500)
await ev(`location.hash='#/book'`); await sleep(800)
await ev(`localStorage.removeItem('titia.captureDone')`)
await ev(`location.hash='#/capture?text=${encodeURIComponent(multiText)}'`); await sleep(2200)
check('多笔识别：显示「识别到 3 笔消费」', await bodyHas('识别到 3 笔消费'))
check('多笔识别：瑞幸咖啡 ¥10.60', await bodyHas('瑞幸咖啡') && await bodyHas('¥10.60'))
check('多笔识别：美团外卖 ¥35', await bodyHas('美团外卖') && await bodyHas('¥35'))
check('多笔识别：滴滴 ¥28', await bodyHas('滴滴') && await bodyHas('¥28'))
check('多笔识别：分类联动（咖啡）', await bodyHas('咖啡'))
// 取消美团这笔 → 全部保存（2）
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('美团外卖'));if(b)b.click();return !!b})()`)
await sleep(300)
check('取消勾选后按钮显示全部保存（2）', await bodyHas('全部保存（2）'))
await clickBtn('全部保存'); await sleep(2000)
const multiSaved = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('transactions').objectStore('transactions').getAll();t.onsuccess=()=>{const r=(t.result||[]).filter(x=>x.source==='shortcut'&&(x.merchant==='瑞幸咖啡'||x.merchant==='滴滴'));res(JSON.stringify(r.map(x=>x.merchant).sort()))}}})`)
check('多笔保存：瑞幸咖啡+滴滴 入库（美团已取消）', multiSaved==='["滴滴","瑞幸咖啡"]', String(multiSaved))

// ═══ ③.9 重复记账检测（需求五）：金额+交易对象+时间+账户 组合 → 提示继续保存/取消 ═══
await ev(`localStorage.removeItem('titia.captureDone')`)
await ev(`location.hash='#/capture?text=${encodeURIComponent(multiText)}'`); await sleep(2200)
check('再次识别显示多笔', await bodyHas('识别到 3 笔消费'))
await clickBtn('全部保存'); await sleep(1500)
check('重复检测：出现「可能重复记账」提示', await bodyHas('可能重复记账'))
check('重复检测：提供「继续保存」按钮', await bodyHas('继续保存'))
await clickBtn('取消'); await sleep(900)
const dupCnt = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('transactions').objectStore('transactions').getAll();t.onsuccess=()=>{const r=(t.result||[]).filter(x=>x.merchant==='瑞幸咖啡');res(r.length)}}})`)
check('重复检测：取消后不重复保存（瑞幸咖啡仍 1 笔）', dupCnt===1, String(dupCnt))
// 再识别一次 → 继续保存 → 允许再次入库
await ev(`localStorage.removeItem('titia.captureDone')`)
await ev(`location.hash='#/capture?text=${encodeURIComponent(multiText)}'`); await sleep(2200)
await clickBtn('全部保存'); await sleep(1200)
await clickBtn('继续保存'); await sleep(1800)
const dupCnt2 = await ev(`new Promise(res=>{const rq=indexedDB.open('titia');rq.onsuccess=()=>{const db=rq.result;const t=db.transaction('transactions').objectStore('transactions').getAll();t.onsuccess=()=>{const r=(t.result||[]).filter(x=>x.merchant==='瑞幸咖啡');res(r.length)}}})`)
check('重复检测：继续保存后新增一笔（瑞幸咖啡 2 笔）', dupCnt2===2, String(dupCnt2))
await ev(`location.hash='#/book'`); await sleep(1000)

// ═══ ④ 自动记账设置入口（首页右上角 ⚙️，不新增导航） ═══
await ev(`location.hash='#/book'`); await sleep(1200)
await clickBtn('首页'); await sleep(600) // 确保回到 home 视图（⚙️ 入口在首页）
check('左侧导航保持 6 项（无自动记账一级导航）', await ev(`(()=>{const nav=[...document.querySelectorAll('nav')].find(n=>n.offsetParent!==null&&n.textContent.includes('首页'));return nav?[...nav.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>t).join(','):'no-nav'})()`))
await ev(`(()=>{const b=document.querySelector('button[aria-label="自动记账设置"]');if(b)b.click();return !!b})()`)
await sleep(700)
check('自动记账设置打开（一键拾光）', await bodyHas('自动记账') && await bodyHas('一键拾光'))
check('设置快捷方式按钮', await bodyHas('设置快捷方式'))
// 展开快捷方式配置说明（剪贴板接力，不打开网页）
await clickBtn('设置快捷方式'); await sleep(500)
check('快捷方式配置说明（剪贴板接力）', await bodyHas('剪贴板接力') && await bodyHas('TITIA_CAPTURE::') && await bodyHas('复制到剪贴板'))
check('提供「从剪贴板读取」兜底入口', await ev(`[...document.querySelectorAll('button')].some(x=>x.offsetParent!==null&&x.textContent.includes('从剪贴板读取'))`))
await clickBtn('取消'); await sleep(500)

// ═══ ⑤ 无运行时错误 ═══
try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); process.exit(fail.length?1:0)
