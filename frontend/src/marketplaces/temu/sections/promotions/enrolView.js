/**
 * Enrol goods steps: pick goods → activity quantity and price per SKU → confirm. Prices are in the
 * unit Temu's recommendation comes in (shown as dollars) and may not go above it; a SKU Temu gives
 * no recommended price for keeps Temu's own price.
 */

const money = (v) => (v == null || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(2))
const amount = (text) => (String(text ?? '').trim() === '' || !Number.isFinite(Number(text)) ? NaN : Math.round(Number(text) * 100) / 100)
const name = (g) => g.title || `Goods ${g.goodsId}`
const priced = (g) => g.skus.filter((s) => s.price != null)

/** The form's starting values: Temu's recommended quantity and prices. */
export function startEdits(goods) {
  return Object.fromEntries(goods.map((g) => [g.goodsId, {
    quantity: g.quantity == null ? '' : String(g.quantity),
    prices: Object.fromEntries(priced(g).map((s) => [s.skuId, money(s.price)])),
  }]))
}

export function enrolProblems(goods, picked, edits) {
  if (!goods.some((g) => picked.has(g.goodsId))) return [{ step: 'pick', field: 'pick', message: 'Pick at least one goods.' }]
  const problems = []
  for (const g of goods.filter((x) => picked.has(x.goodsId))) {
    const e = edits[g.goodsId]
    const q = Number(e.quantity)
    if (!Number.isInteger(q) || q < 1) problems.push({ step: 'prices', field: `q${g.goodsId}`, message: `${name(g)}: the activity quantity must be a whole number of at least 1.` })
    for (const s of priced(g)) {
      const p = amount(e.prices[s.skuId])
      if (!Number.isFinite(p) || p <= 0) problems.push({ step: 'prices', field: `p${s.skuId}`, message: `${name(g)} · SKU ${s.skuId}: enter a price.` })
      else if (p > s.price) problems.push({ step: 'prices', field: `p${s.skuId}`, message: `${name(g)} · SKU ${s.skuId}: $${money(p)} is above Temu's $${money(s.price)}.` })
    }
  }
  return problems
}

/** Likely typos, shown on Confirm: prices over half below Temu's, quantities over twice Temu's. */
export function bigCuts(goods, picked, edits) {
  const out = []
  for (const g of goods.filter((x) => picked.has(x.goodsId))) {
    const q = Number(edits[g.goodsId].quantity)
    if (g.quantity && q > g.quantity * 2) out.push(`${name(g)}: ${q} units is over twice Temu’s ${g.quantity}`)
    for (const s of priced(g)) {
      const p = amount(edits[g.goodsId].prices[s.skuId])
      if (s.price && Number.isFinite(p) && p < s.price / 2) out.push(`${name(g)} · SKU ${s.skuId}: $${money(p)} is ${Math.round((1 - p / s.price) * 100)}% below Temu’s $${money(s.price)}`)
    }
  }
  return out
}

/** A price as it will be sent, for the Confirm step. */
export const shownPrice = (text) => money(amount(text))

/** What the enrol action gets: picked goods with their quantity and own prices (SKUs Temu priced). */
export function enrolItems(goods, picked, edits) {
  return goods.filter((g) => picked.has(g.goodsId)).map((g) => ({
    goodsId: g.goodsId,
    quantity: Number(edits[g.goodsId].quantity),
    skus: priced(g).map((s) => ({ skuId: s.skuId, price: amount(edits[g.goodsId].prices[s.skuId]) })),
  }))
}
