// 设置持久化验证：单行收敛 / 重复行自愈 / 换肤跨刷新稳定
// 钉死的 bug：ensureRow 并发 → settings 建出两行；叠加 query() 结尾的 .reverse()
// （主键是随机 UUID）→ 每次读到哪行随机 → 「换了皮肤，重开有时变回去」。
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9361
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

const pass=[],fail=[]
const check=(n,ok,extra='')=>(ok?pass:fail).push(n+(extra?` (${extra})`:''))
const clickSkin=k=>ev(`document.querySelector('[data-skin-option="${k}"]').click()`)
const curSkin=()=>ev(`document.documentElement.getAttribute('data-theme')`)

// 错误跨刷新累积：每次重载前先把上一轮的 __errs 收走
const allErrs=[]
const injectErr=()=>ev(`window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));`)
// 注意：必须用 location.reload() 真重载。
// Page.navigate 到「只有 hash 不同」的同一 URL 属于同文档导航，页面不会重启，
// 持久化断言会变成假绿（这脚本第一版就踩了）。
const reload=async()=>{
  try { allErrs.push(...(await ev(`window.__errs||[]`) || [])) } catch {}
  try { await ev(`location.reload()`) } catch {}
  await sleep(3000)
  await ev(`location.hash='#/theme'`); await sleep(700)
  await injectErr()
}

// 直连 IndexedDB 读 settings 表（绕过 app 代码，看物理真相）
const rawRows = () => ev(`
  new Promise(res => {
    const rq = indexedDB.open('titia');
    rq.onsuccess = () => {
      const tx = rq.result.transaction('settings', 'readonly');
      const all = tx.objectStore('settings').getAll();
      all.onsuccess = () => res(all.result.map(r => ({
        id: r.id, skin: r.theme && r.theme.skin, deletedAt: r.deletedAt, updatedAt: r.updatedAt
      })));
    };
  })
`)
const live = async () => (await rawRows()).filter(r => !r.deletedAt)

await ev(`location.hash='#/theme'`); await sleep(1200)
await injectErr()

// 自检：确认 reload() 真的重启了页面，否则后面所有持久化断言都是假绿
await ev(`window.__reloadProbe = 'alive'`)
await reload()
check('刷新真的重启了页面（哨兵已消失）', (await ev(`window.__reloadProbe || 'gone'`)) === 'gone')

// ── 1. 正常启动后 settings 只有一行，且主键固定
let rows = await live()
check('settings 表只有一行存活', rows.length === 1, `${rows.length} 行`)
check('主键固定为 default（不是随机 UUID）', rows[0]?.id === 'default', rows[0]?.id ?? '无')

// ── 2. 换肤 → 刷新，连做 3 次，不允许出现一次回弹
const seq = ['klein','cinnamon','peacock']
const flaps = []
for (const s of seq) {
  await clickSkin(s); await sleep(600)
  await reload()
  const after = await curSkin()
  if (after !== s) flaps.push(`${s}→${after}`)
}
check('连续 3 次换肤刷新均不回弹', flaps.length === 0, flaps.join(', ') || '0 次回弹')

// ── 3. 注入一条重复行（模拟历史竞态遗留），刷新后应自愈成一行
await ev(`
  new Promise(res => {
    const rq = indexedDB.open('titia');
    rq.onsuccess = () => {
      const tx = rq.result.transaction('settings', 'readwrite');
      const st = tx.objectStore('settings');
      const g = st.get('default');
      g.onsuccess = () => {
        const base = g.result;
        // 伪造一条"更旧"的脏行，skin 故意设成 warm
        st.put({ ...base, id: 'legacy-dup-0001', theme: { ...base.theme, skin: 'warm' },
                 updatedAt: (base.updatedAt || Date.now()) - 60000 });
        tx.oncomplete = () => res(1);
      };
    };
  })
`)
const dirty = await live()
check('脏数据注入成功（出现 2 行）', dirty.length === 2, `${dirty.length} 行`)

const before = await curSkin()
await reload()
const healed = await live()
check('刷新后自愈回一行', healed.length === 1, `${healed.length} 行`)
check('保留的是 updatedAt 最新那行', healed[0]?.skin === before, `保留 ${healed[0]?.skin}，期望 ${before}`)
check('自愈后皮肤未被旧行覆盖', (await curSkin()) === before, `${before} → ${await curSkin()}`)

// 软删而非物理删（数据可回溯）
const softDeleted = (await rawRows()).filter(r => r.deletedAt)
check('重复行走软删、非物理删',
  softDeleted.length === 1 && softDeleted[0].id === 'legacy-dup-0001',
  `软删 ${softDeleted.length} 行`)

// ── 4. 清空 settings 后刷新，只应重建一行（冷启动路径不产生重复）
await ev(`
  new Promise(res => {
    const rq = indexedDB.open('titia');
    rq.onsuccess = () => {
      const tx = rq.result.transaction('settings', 'readwrite');
      tx.objectStore('settings').clear();
      tx.oncomplete = () => res(1);
    };
  })
`)
await reload()
const rebuilt = await live()
check('冷启动只重建一行', rebuilt.length === 1, `${rebuilt.length} 行`)
check('重建行主键仍为 default', rebuilt[0]?.id === 'default', rebuilt[0]?.id ?? '无')
check('重建后回落默认皮肤 warm', (await curSkin()) === 'warm', await curSkin())

allErrs.push(...(await ev(`window.__errs||[]`) || []))
check('无运行时错误', allErrs.length === 0, allErrs.join(' | '))

console.log('\n通过:'); pass.forEach(p=>console.log('  ✔',p))
if (fail.length){console.log('\n失败:');fail.forEach(f=>console.log('  ✘',f))}
console.log(`\n${pass.length} 通过 / ${fail.length} 失败`)
console.log('最终行:', JSON.stringify(await rawRows()))
chrome.kill(); process.exit(fail.length?1:0)
