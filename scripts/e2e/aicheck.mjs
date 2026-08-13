// AI 识别验证（DeepSeek · OpenAI 兼容）：①未配置时按钮可用但降级提示 ②配置 mock 后识别成功预填 ③服务异常时静默降级
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import http from 'node:http'

// ── 本地 mock DeepSeek API（模拟 api.deepseek.com/chat/completions 返回） ──
let mode = 'ok' // ok | error
const server = http.createServer((req, res) => {
  console.log('MOCK-REQ:', req.method, req.url)
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.statusCode = 204
    res.end()
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    if (mode === 'error') {
      res.statusCode = 500
      res.end(JSON.stringify({ error: { message: 'mock fail' } }))
      return
    }
    // DeepSeek /chat/completions 响应：choices[0].message.content 为 JSON 字符串
    // 新规则输出：amount 为元（支出负/收入正）、date 为 YYYY-MM-DD、memo 为备注
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                merchant: '海底捞',
                category: '餐饮',
                account: '支付宝',
                amount: -2.68,
                date: '2026-08-05',
                memo: '支付宝-海底捞-今晚聚餐',
                orderId: null,
                warn: null,
                periodic: false,
              }),
            },
          },
        ],
      }),
    )
  })
})
await new Promise((r) => server.listen(9788, r))

const PORT = 9525
const BASE = process.env.BASE || 'http://127.0.0.1:4185'
const chrome = spawn('chromium', ['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--window-size=393,852','--user-data-dir=/tmp/cdp-liveai',
  `${BASE}/#/mine`], { stdio: 'ignore' })
await sleep(5500)
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
const clickCard=txt=>ev(`(()=>{const el=[...document.querySelectorAll('[role="button"]')].find(x=>x.offsetParent!==null&&x.textContent.includes(${JSON.stringify(txt)}));if(!el)return false;el.click();return true})()`)
const bodyHas=t=>ev(`document.body.innerText.includes(${JSON.stringify(t)})`)
const setInput=(ph,val)=>ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)

// ── ① 我呀页 AI 配置（通过 UI 表单输入保存，验证输入框可用） ──
await ev(`location.hash='#/mine'`); await sleep(1500)
check('我呀页出现 AI 识别卡', await bodyHas('AI 识别'))
await clickCard('AI 识别'); await sleep(700)
check('AI 设置表单打开（DeepSeek）', await bodyHas('AI 识别（DeepSeek）'))
await setInput('sk-', 'test-deepseek-key'); await sleep(200)
await setInput('https://api.deepseek.com', 'http://127.0.0.1:9788'); await sleep(200)
check('API Key 可输入（受控回滚修复）', await ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&(x.placeholder||'').includes('sk-'));return el?el.value==='test-deepseek-key':false})()`))
await ev(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim()==='保存');const el=b[b.length-1];if(el){el.click();return true}return false})()`)
await sleep(600)
check('AI 配置保存成功', (await ev(`localStorage.getItem('titia.aiKey')`))==='test-deepseek-key', String(await ev(`localStorage.getItem('titia.aiKey')`)))
check('卡片显示已启用（DeepSeek）', await bodyHas('已启用'))
check('AI 识别卡存在', await bodyHas('AI 识别'))

// ── ② 记账页 AI 识别成功 ──
await ev(`window.__fetches=[];const of=window.fetch;window.fetch=(...a)=>{window.__fetches.push(String(a[0]||''));return of(...a)}`)
console.log('配置后 aiKey:', JSON.stringify(await ev(`localStorage.getItem('titia.aiKey')`)), 'aiBase:', JSON.stringify(await ev(`localStorage.getItem('titia.aiBaseUrl')`)))
await ev(`location.hash='#/book'`); await sleep(1500)
await clickBtn('记一笔'); await sleep(700)
await setInput('如 海底捞','海底捞今晚'); await sleep(200)
const aiBtn = await ev(`(()=>{const el=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('AI 识别'));return !!el})()`)
check('表单出现「🤖 AI 识别」按钮', aiBtn)
await clickBtn('AI 识别'); await sleep(2500)
console.log('fetches:', JSON.stringify(await ev(`window.__fetches||[]`)))
console.log('localStorage now:', JSON.stringify(await ev(`localStorage.getItem('titia.aiKey')`)))
const prefill = await ev(`(()=>{
  const ins=[...document.querySelectorAll('input')].filter(x=>x.offsetParent!==null);
  const sels=[...document.querySelectorAll('select')].filter(x=>x.offsetParent!==null);
  const catBtn=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.includes('▾')&&!x.textContent.includes('未分类'));
  return { amount: ins.find(x=>x.placeholder.includes('26.8'))?.value, merchant: ins.find(x=>x.placeholder.includes('海底捞'))?.value, cats: sels.map(s=>s.value), catTxt: catBtn?catBtn.textContent.trim():null };
})()`)
check('AI 识别回填金额 268→2.68', prefill.amount==='2.68', JSON.stringify(prefill))
// 分类现为面板按钮（▾ 显示「🍜 餐饮」），账户仍为 select
check('AI 识别回填分类/账户', !!prefill.catTxt&&prefill.catTxt.includes('餐饮')&&prefill.cats.includes('支付宝'), `cat=${prefill.catTxt} acc=${JSON.stringify(prefill.cats)}`)
// 直接保存（保存后默认回首页，进账单视图验证）
await clickBtn('保存'); await sleep(800)
await clickBtn('账单'); await sleep(500)
check('AI 识别后保存成功', await bodyHas('海底捞今晚'))

// ── ③ 代理异常时静默降级 ──
mode = 'error'
await clickBtn('记一笔'); await sleep(700)
await setInput('如 海底捞','打车回家'); await sleep(200)
await clickBtn('AI 识别'); await sleep(2500)
console.log('fetches:', JSON.stringify(await ev(`window.__fetches||[]`)))
console.log('localStorage now:', JSON.stringify(await ev(`localStorage.getItem('titia.aiKey')`)))
const amountAfterFail = await ev(`(()=>{const el=[...document.querySelectorAll('input')].find(x=>x.offsetParent!==null&&x.placeholder.includes('26.8'));return el?el.value:null})()`)
check('代理失败时金额未被污染（静默降级）', amountAfterFail==='', `amount=${amountAfterFail}`)
// 关闭表单
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent!==null&&x.textContent.trim()==='取消');if(b)b.click();return true})()`)
await sleep(400)

try{allErrs.push(...(await ev(`window.__errs||[]`)||[]))}catch{}
check('无运行时错误', allErrs.length===0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if(fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
chrome.kill(); server.close(); process.exit(fail.length?1:0)
