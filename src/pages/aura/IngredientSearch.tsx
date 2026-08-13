import type { IngredientInfo } from '../../services/auraEngine'

// Aura 产品参考（极简版）：仅展示推荐成分 + 电商搜索跳转，不做任何数据解析/接口调用。
// 无推荐成分时整块不显示（降级）。
export function IngredientSearch({
  ingredients,
  inline,
}: {
  ingredients: IngredientInfo[]
  inline?: boolean
}) {
  if (!ingredients || ingredients.length === 0) return null

  const labels = ingredients.map((i) => i.label)
  const titleNames = labels.join(' · ')
  const keyword = labels.join(' ') // 多个成分用空格连接
  // 强制打开手机端搜索页，避免在移动端浏览器打开 PC 站点
  const taobao = `https://s.m.taobao.com/h5?q=${encodeURIComponent(keyword)}`
  const jd = `https://so.m.jd.com/ware/search.action?keyword=${encodeURIComponent(keyword)}`

  const open = (url: string) => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      window.location.href = url
    }
  }

  const body = (
    <>
      <p className="text-sm leading-relaxed text-ink-2">
        根据你的肤况，建议选择含以下成分的产品：
      </p>
      <p className="mt-1 text-sm font-medium text-primary">{labels.join(' · ')}</p>
      <p className="mt-3 text-xs text-ink-3">可在电商平台搜索关键词自行挑选：</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => open(taobao)}
          className="pressable rounded-pill bg-primary px-4 py-2 text-sm font-medium text-bg"
        >
          去淘宝搜
        </button>
        <button
          type="button"
          onClick={() => open(jd)}
          className="pressable rounded-pill bg-surface-sunken px-4 py-2 text-sm font-medium text-ink"
        >
          去京东搜
        </button>
      </div>
    </>
  )

  if (inline) return <div>{body}</div>

  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <p className="text-sm font-semibold text-ink">💡 含「{titleNames}」的产品参考</p>
      <div className="mt-1.5">{body}</div>
    </div>
  )
}
