// Titia 时序 · 密码箱平台 logo 联想
// 依据平台名称（不区分大小写、含关键字即匹配）返回代表 emoji；未命中返回默认 🔐。
// 纯本地映射，无需联网。

const RULES: { kw: string[]; icon: string }[] = [
  { kw: ['微信', 'wechat', 'weixin'], icon: '💬' },
  { kw: ['支付宝', 'alipay'], icon: '🔵' },
  { kw: ['淘宝', 'taobao'], icon: '🟠' },
  { kw: ['京东', 'jd', 'jingdong'], icon: '🐶' },
  { kw: ['拼多多', 'pdd'], icon: '🟥' },
  { kw: ['美团', 'meituan'], icon: '🟡' },
  { kw: ['抖音', 'douyin', 'tiktok'], icon: '🎵' },
  { kw: ['小红书', 'redbook', 'xhs', '小红'], icon: '📕' },
  { kw: ['哔哩', 'bilibili', 'b站'], icon: '📺' },
  { kw: ['微博', 'weibo'], icon: '🐦' },
  { kw: ['知乎', 'zhihu'], icon: '🔵' },
  { kw: ['网易', 'netease', '云音乐'], icon: '🎶' },
  { kw: ['qq'], icon: '🐧' },
  { kw: ['gmail', 'outlook', '邮箱', 'mail', 'email', '163', 'foxmail'], icon: '✉️' },
  { kw: ['apple', '苹果', 'icloud'], icon: '🍎' },
  { kw: ['google', '谷歌'], icon: '🔍' },
  { kw: ['microsoft', '微软', 'xbox'], icon: '🪟' },
  { kw: ['github', 'gitlab'], icon: '🐙' },
  { kw: ['steam', '游戏'], icon: '🎮' },
  { kw: ['招商', '工商', '建设', '中国银', '农业', '交通', '邮储', '平安', '民生', '浦发', '兴业', '中信', '银行', '储蓄', '信用卡', '银行卡'], icon: '🏦' },
  { kw: ['社保', '公积金'], icon: '🏛️' },
  { kw: ['身份证', '身份证号'], icon: '🪪' },
  { kw: ['护照'], icon: '🛂' },
  { kw: ['wifi', '路由器', '宽带'], icon: '📶' },
  { kw: ['vpn'], icon: '🛡️' },
]

export function platformLogo(name: string): string {
  const n = (name || '').toLowerCase()
  for (const r of RULES) {
    if (r.kw.some((k) => n.includes(k.toLowerCase()))) return r.icon
  }
  return '🔐'
}
