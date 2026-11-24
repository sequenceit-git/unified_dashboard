/**
 * Enrol goods steps: pick goods → activity quantity and price per SKU → confirm. Temu's prices are
 * whole cents; the form shows dollars. A price may not go above Temu's recommended activity price.
 */

const dollars = (cents) => (cents == null ? '' : (cents / 100).toFixed(2))
const cents = (text) => (String(text).trim() === '' || !Number.isFinite(Number(text)) ? NaN : Math.round(Number(text) * 100))
const name = (g) => g.title || `Goods ${g.goodsId}`

/** The form's starting values: Temu's recommended quantity and prices. */
export function startEdits(goods) {
  return Object.fromEntries(goods.map((g) => [g.goodsId, {
    quantity: g.quantity == null ? '' : String(g.quantity),
    prices: Object.fromEntries(g.skus.map((s) => [s.skuId, dollars(s.price)])),
  }]))
}

export function enrolProblems(goods, picked, edits) {
  if (!picked.size) return [{ step: 'pick', field: 'pick', message: 'Pick at least one goods.' }]
  const problems = []
  for (const g of goods.filter((x) => picked.has(x.goodsId))) {
    const e = edits[g.goodsId]
    const q = Number(e.quantity)
    if (!Number.isInteger(q) || q < 1) problems.push({ step: 'prices', field: `q${g.goodsId}`, message: `${name(g)}: the activity quantity must be a whole number of at least 1.` })
    for (const s of g.skus) {
      const c = cents(e.prices[s.skuId])
      if (!Number.isFinite(c) || c < 1) problems.push({ step: 'prices', field: `p${s.skuId}`, message: `${name(g)} · SKU ${s.skuId}: enter a price.` })
      else if (s.price != null && c > s.price) problems.push({ step: 'prices', field: `p${s.skuId}`, message: `${name(g)} · SKU ${s.skuId}: $${dollars(c)} is above Temu's $${dollars(s.price)}.` })
    }
  }
  return problems
}

/** Prices more than half below Temu's recommendation (likely a typo): shown on Confirm. */
export function bigCuts(goods, picked, edits) {
  const out = []
  for (const g of goods.filter((x) => picked.has(x.goodsId))) {
    for (const s of g.skus) {
      const c = cents(edits[g.goodsId].prices[s.skuId])
      if (s.price && Number.isFinite(c) && c < s.price / 2) out.push(`${name(g)} · SKU ${s.skuId}: $${dollars(c)} is ${Math.round((1 - c / s.price) * 100)}% below Temu’s $${dollars(s.price)}`)
    }
  }
  return out
}

/** What the enrol action gets: picked goods with their quantity and prices in cents. */
export function enrolItems(goods, picked, edits) {
  return goods.filter((g) => picked.has(g.goodsId)).map((g) => ({
    goodsId: g.goodsId,
    quantity: Number(edits[g.goodsId].quantity),
    skus: g.skus.map((s) => ({ skuId: s.skuId, price: cents(edits[g.goodsId].prices[s.skuId]) })),
  }))
}
