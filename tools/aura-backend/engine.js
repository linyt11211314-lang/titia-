// Aura 规则引擎（Node.js 移植版，与前端 src/services/auraEngine.ts 同源）
// 纯 JSON 配置 + 匹配组装函数，不依赖数据库 / 实时 API / 爬虫。
// 仅作「可独立部署的后端」交付参考；线上 App 目前使用前端内嵌的同一引擎。

const AURA_SYMPTOMS = [
  { key: 'acne', label: '长痘（红肿痘/闭口粉刺）', concern: '长痘（红肿痘/闭口）通常和皮脂分泌旺盛、毛囊口角化、局部炎症有关。', func: '红肿痘/闭口可点涂含 2% 水杨酸或 10% 壬二酸的产品，每天 1-2 次，只点在痘痘上。', avoid: '暂停磨砂膏、清洁面膜、含酒精的爽肤水和皂基洁面，避免越洗越油、越刺激越炎。', doctor: '若调整 2-4 周后痘痘无改善，或出现囊肿/结节型大痘（硬、痛、反复），建议看皮肤科。' },
  { key: 'redness', label: '泛红（脸颊/鼻翼）', concern: '泛红常意味着屏障偏薄或处于炎症状态，脸颊、鼻翼尤其容易中招。', func: '泛红处可用含积雪草、泛醇、神经酰胺的舒缓类产品帮助退红。', avoid: '避免皂基、磨砂、含香精酒精的产品，洗脸水温不要高。', doctor: '若泛红持续加重、伴刺痛灼热，或出现明显红血丝/脱屑，建议排查玫瑰痤疮或脂溢性皮炎。' },
  { key: 'dry', label: '起皮/干燥紧绷', concern: '起皮、干燥紧绷说明皮肤保水能力下降、屏障可能缺水缺脂。', func: '干燥起皮可在乳液后叠加含角鲨烷或凡士林类成分的面霜，加强封闭锁水。', avoid: '避免过热的水洗脸、避免皂基和强清洁，减少水分进一步流失。', doctor: '若起皮伴随明显瘙痒、裂纹或渗液，建议就医排除特应性皮炎等。' },
  { key: 'dull', label: '暗沉/肤色不均', concern: '暗沉、肤色不均多和角质代谢变慢、氧化、作息有关。', func: '暗沉可尝试含烟酰胺、维生素 C 衍生物（更温和）的成分提亮，白天一定做好防晒。', avoid: '避免只靠去角质「抛光」，过度剥脱会反伤屏障。' },
  { key: 'sagging', label: '脸垮/苹果肌下垂', concern: '脸垮、苹果肌下垂和胶原流失、筋膜支撑减弱有关，会随年龄慢慢显现。', func: '可引入低浓度 A 醇（视黄醇），从每周 2 次起步、逐步建立耐受，务必夜间用并严格防晒。', avoid: '避免暴力按摩拉扯，避免不做防晒就上功效成分。', doctor: '若松弛下垂进展很快或单侧明显不对称，先就医排除其他病因。' },
  { key: 'wrinkle', label: '皱纹（动态纹/静态纹）', concern: '动态纹（做表情才有）和静态纹（静态也可见）和胶原流失、光老化相关。', func: '纹路可尝试低浓度 A 醇（夜间、从低频起步）+ 每天防晒；眼周细纹用专用眼霜轻拍。', avoid: '避免不做防晒就使用 A 醇，避免拉扯眼周。', doctor: '若纹路突然明显增多或伴其他皮肤改变，建议咨询皮肤科。' },
  { key: 'pore', label: '松弛/毛孔粗大', concern: '毛孔粗大、松弛常和出油、胶原流失、皮肤失去弹性相关。', func: '毛孔可搭配水杨酸疏通、并用含烟酰胺的护肤品帮助细腻；同时做好防晒减缓松弛。', avoid: '避免用撕拉式鼻贴，反而撑大毛孔、伤屏障。' },
  { key: 'darkcircle', label: '黑眼圈/眼周细纹', concern: '黑眼圈/眼周细纹常和熬夜、血管、色素或眼周薄嫩有关。', func: '眼周可用含咖啡因、低浓度视黄醇（眼霜专用）或维生素 K 的眼霜，动作要轻、不拉扯。', avoid: '避免用力揉眼睛、避免眼周堆叠太多层导致脂肪粒。', doctor: '若黑眼圈突然加重或伴眼睑水肿，建议排查睡眠/过敏/甲状腺，必要时看皮肤科或内科。' },
]

const AURA_FACTOR_GROUPS = [
  { category: '作息类', items: [
    { key: 'stayup', label: '熬夜（日均睡眠<6h，或凌晨后入睡）', mechanism: '熬夜会升高皮质醇，刺激皮脂腺分泌、还会拖慢皮肤夜间修护。', life: '作息：尽量在 23:30 前入睡；睡前 1 小时放下手机，做 5 分钟深呼吸（吸气 4 秒→屏息 7 秒→呼气 8 秒）。' },
    { key: 'lack', label: '睡眠不足（睡眠时长不足，但作息规律）', mechanism: '睡眠不足让皮肤错过夜间修护窗口，屏障和光泽都会打折扣。', life: '作息：固定起床时间比硬早睡更可行，尽量睡够 7-8 小时；午间小憩 20 分钟补觉。' },
    { key: 'irregular', label: '作息不规律（倒班/频繁跨时区）', mechanism: '作息不规律会打乱皮肤的昼夜节律，让它变得不稳定、易敏感。', life: '作息：尽量固定三餐与睡眠时段；跨时区时多晒自然光，帮身体重新校准节律。' },
  ]},
  { category: '压力与情绪类', items: [
    { key: 'stress', label: '近期压力大（工作/学业/生活变动）', mechanism: '压力升高皮质醇，进而刺激油脂分泌、加重炎症和爆痘。', life: '压力：把大任务拆成小步，每天留 15 分钟只属于自己；快走/瑜伽能快速降皮质醇。' },
    { key: 'anxiety', label: '焦虑/情绪波动', mechanism: '情绪波动会影响神经内分泌，皮肤更容易「闹脾气」。', life: '情绪：把最担心的 3 件事写下来，再写一件能马上做的小事，把焦虑外化；需要时找人聊聊。' },
    { key: 'tense', label: '长期精神紧张', mechanism: '长期紧张会持续激活压力轴，皮肤的修复被长期抑制。', life: '放松：每天做 1 次渐进式肌肉放松（脚趾→额头依次收紧-放松），睡前尤其有效。' },
  ]},
  { category: '饮食类', items: [
    { key: 'sugar', label: '高糖饮食（奶茶/甜点/含糖饮料频繁）', mechanism: '高糖（高 GI）饮食会加剧糖化与炎症，让痘痘和暗沉更明显。', life: '饮食：本周奶茶控制在 2 杯以内、甜点减半；用无糖气泡水/原味酸奶替代；多吃绿叶菜和富含 Omega-3 的食物（三文鱼、亚麻籽）。' },
    { key: 'dairy', label: '高乳制品摄入（每天超过1份）', mechanism: '乳制品中的某些成分可能刺激皮脂与角化，和痘痘相关。', life: '饮食：乳制品先减到每天 ≤1 份，观察 2-3 周皮肤变化；可用无糖豆奶/燕麦奶暂代。' },
    { key: 'oilyspicy', label: '油腻/辛辣饮食', mechanism: '油腻辛辣食物可能加重皮脂分泌和泛红。', life: '饮食：油腻辛辣减频，多蔬果肉蛋；辣可保留，但避免「辣+油+夜宵」组合。' },
    { key: 'alcohol', label: '近期饮酒频繁', mechanism: '饮酒会带走水分、扩张血管，加重干燥与泛红。', life: '饮酒：近期尽量间隔 ≥3 天再喝，酒后补水（每杯酒配 1 杯温水），次日加强保湿。' },
    { key: 'dehydration', label: '饮水不足（日均<1.5L）', mechanism: '饮水不足时皮肤保水能力下降，更容易干、暗、没精神。', life: '饮水：把目标定在每天 1.5-2L，用带刻度杯子提醒自己；晨起先喝 1 杯温水。' },
  ]},
  { category: '生理与激素类', items: [
    { key: 'period', label: '生理期前后', mechanism: '生理期前后激素波动，常让皮肤偏油、易长痘或变敏感。', life: '生理期：前后一周温和清洁、少折腾；可适度热敷舒缓；爆痘明显参考上面的点涂护理。' },
    { key: 'pregnancy', label: '孕期/哺乳期', mechanism: '孕期/哺乳期激素变化明显，皮肤状态会有较大波动。', life: '特殊期：功效型产品（A 醇、水杨酸）先暂停，以基础保湿+防晒为主；具体成分拿不准时咨询产科/皮肤科。', doctor: '孕期/哺乳期皮肤剧变或伴有其他不适，建议咨询产科+皮肤科。' },
    { key: 'menopause', label: '更年期阶段', mechanism: '更年期雌激素下降，皮肤变薄、变干、胶原流失加快。', life: '特殊期：加强保湿与防晒，补充优质蛋白和钙；皮肤变薄处避免用力揉搓。', doctor: '更年期皮肤明显不适或剧变，建议妇科+皮肤科评估激素管理。' },
  ]},
  { category: '环境类', items: [
    { key: 'season', label: '换季（春秋交替/气温剧烈变化）', mechanism: '换季时温湿度剧烈变化，皮肤屏障容易进入脆弱期。', life: '环境：换季备好屏障修护面霜；洗脸水温接近体温；随身带保湿喷雾（喷后轻拍+锁水面霜）。' },
    { key: 'acroom', label: '长时间待在空调房（干燥环境）', mechanism: '长时间空调房持续抽湿，皮肤水分流失加快。', life: '环境：空调房放一盆水或加湿器，湿度保持 50%-60%；桌上放杯温水随时喝。' },
    { key: 'uv', label: '紫外线暴露增加（防晒不足）', mechanism: '紫外线暴露增加会加速光老化（色斑、松弛、纹路）。', life: '环境：户外每 2 小时补涂防晒（SPF30+、PA+++ 以上），帽子/伞物理遮挡也有效；上午 10 点-下午 4 点减少直晒。' },
    { key: 'pollution', label: '空气污染/粉尘环境', mechanism: '空气污染与粉尘会诱发氧化与炎症，让皮肤暗沉、易敏。', life: '环境：外出回来用温水洗脸，减少粉尘停留；基础护肤后可加一层抗氧化精华（如含维生素 C/E）。' },
  ]},
]

const COMFORT_POOL = [
  '你的 Aura 是独一无二的，不用为今天的皮肤状态焦虑。',
  '焦虑会升高皮质醇，皮质醇会让皮肤更差。先深呼吸三次，再来看建议吧。',
  '皮肤有自我修复的能力，给它一点时间，它会慢慢回到正轨。',
  '你不是一个人。压力消失后，皮肤会跟着好起来的。',
  '不用追求别人的皮肤，你自带的 Aura 就是最好的。',
  '今天开始调整，已经比什么都不做强太多了。',
  '皮肤是身体的镜子，它只是在提醒你：该好好照顾自己了。',
  '每一次你关注自己的皮肤，都是在练习温柔对待自己。',
]

const SYMPTOM_MAP = Object.fromEntries(AURA_SYMPTOMS.map((s) => [s.key, s]))
const FACTOR_MAP = {}
AURA_FACTOR_GROUPS.forEach((g) => g.items.forEach((it) => (FACTOR_MAP[it.key] = it)))

const SKIN_BASE = {
  干性: { cleanse: '晨间可只用温水洗脸，晚间用氨基酸洁面，水温接近体温，不要过度揉搓。', moist: '选含神经酰胺、角鲨烷、泛醇的滋润面霜，洗完脸趁微湿涂抹锁水。' },
  油性: { cleanse: '早晚用温和氨基酸洁面，T 区可多打圈，避免过度清洁反而刺激出油。', moist: '用清爽乳液而非厚重面霜；含神经酰胺的轻薄保湿也 OK，避开致痘成分。' },
  混合性: { cleanse: '全脸温和氨基酸洁面，T 区稍加留意、两颊一带而过。', moist: '两颊加强保湿、T 区用清爽乳液，分区护理最省力。' },
  敏感性: { cleanse: '晨间温水、晚间氨基酸洁面，洗脸后用棉柔巾轻按吸干，不来回搓。', moist: '用含神经酰胺、角鲨烷、泛醇的屏障修护面霜，暂停酸类/A 醇/高浓度 VC。' },
}

const AGE_HINT_GROUPS = ['31-35', '36-40', '41-50', '51+']

function generateAura(input) {
  const syms = (input.symptoms || []).map((k) => SYMPTOM_MAP[k]).filter(Boolean)
  const facs = (input.factors || []).map((k) => FACTOR_MAP[k]).filter(Boolean)

  let overview
  if (syms.length === 0 && facs.length === 0) {
    overview = '先勾选一些症状或生活中的关联因素，Aura 才能给出更贴合你的建议。也可以从最近最困扰的一项开始～'
  } else {
    const parts = []
    if (syms.length) {
      parts.push(`你勾选了${syms.map((s) => s.label).join('、')}。这些表现大多和皮肤屏障、皮脂分泌或作息节律有关，单独或叠加出现都很常见。`)
    }
    for (const f of facs) parts.push(f.mechanism)
    if (input.skinType === '敏感性') parts.push('你的敏感性肤质本身屏障更薄，外界刺激更容易被放大，所以护理上「少即是多」。')
    if (AGE_HINT_GROUPS.includes(input.ageGroup)) parts.push('30 岁后胶原每年约流失 1%，叠加光老化，纹路和松弛会更早出现，但认真防晒和保湿能明显放缓。')
    overview = '结合你的勾选，皮肤可能正在经历这些变化：\n' + parts.join('\n') + '\n\n这些大多是身体在提醒你「该好好照顾自己了」，不是皮肤在和你作对，我们一步步来。'
  }

  const base = SKIN_BASE[input.skinType] || SKIN_BASE['混合性']
  const careLines = [`清洁：${base.cleanse}`, `保湿/修复：${base.moist}`]
  const funcs = syms.map((s) => s.func).filter(Boolean)
  if (funcs.length) careLines.push(`功能性护理：${funcs.join(' ')}`)
  else careLines.push('功能性护理：目前没有强功效需求，先把温和清洁和扎实保湿做对，皮肤会更稳。')
  const avoids = new Set()
  syms.forEach((s) => s.avoid && avoids.add(s.avoid))
  if (input.skinType === '敏感性') avoids.add('近期不做刷酸、不整套换新，给皮肤一段放空期。')
  if (input.factors && (input.factors.includes('uv'))) avoids.add('不防晒会让前面所有功效大打折扣，户外务必补涂防晒。')
  if (input.factors && (input.factors.includes('sugar') || input.factors.includes('dairy'))) avoids.add('高糖与高乳制品近期尽量控制，减少炎症来源。')
  if (avoids.size) careLines.push(`避坑提醒：${Array.from(avoids).join(' ')}`)
  else careLines.push('避坑提醒：暂无特别禁忌，保持温和、不过度清洁即可。')
  const care = careLines.join('\n')

  const lifeLines = facs.map((f) => f.life)
  if (lifeLines.length === 0) lifeLines.push('保持规律作息、均衡饮食、认真防晒，是皮肤最稳的底盘。先从最容易做到的一件小事开始就好。')
  const life = lifeLines.join('\n')

  const docs = []
  syms.forEach((s) => s.doctor && docs.push(s.doctor))
  facs.forEach((f) => f.doctor && docs.push(f.doctor))
  if (docs.length === 0) docs.push('拿不准、或皮肤状态让你困扰时，去正规医疗机构的皮肤科就诊最稳妥。')
  docs.push('以上建议不能替代专业诊断。若问题持续加重或影响生活，请及时就医。')
  const doctor = docs.join('\n')

  const comfort = COMFORT_POOL[Math.floor(Math.random() * COMFORT_POOL.length)]

  return { overview, care, life, doctor, comfort }
}

module.exports = { generateAura, AURA_SYMPTOMS, AURA_FACTOR_GROUPS, COMFORT_POOL }
