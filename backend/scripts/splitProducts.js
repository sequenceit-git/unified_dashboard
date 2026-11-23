/**
 * Splitting shared products into one product per shop (see scripts/split-products-per-shop.js).
 * `planSplit` decides everything from plain data and touches no database; `run` applies a plan
 * through an injected `db` so it can be tested without MongoDB.
 */
const registry = require('../marketplaces')

const idOf = (value) => String(value)

/**
 * @returns {{ assign: object[], copies: object[], repoint: { listings: any[], orderItems: any[], logs: any[], reports: any[] } }}
 */
function planSplit({ shops, products, listings, orders, logs, reports, makeId }) {
  const shopMarket = new Map(shops.map((shop) => [idOf(shop._id), shop.marketplace]))
  const listingsOf = new Map()
  for (const listing of listings) {
    const key = idOf(listing.productId)
    if (!listingsOf.has(key)) listingsOf.set(key, [])
    listingsOf.get(key).push(listing)
  }
  const plan = { assign: [], copies: [], repoint: { listings: [], orderItems: [], logs: [], reports: [] }, mismatched: 0 }
  // Copies made by an earlier run that stopped before giving the original its shop: reuse them.
  const madeCopies = new Map(products.filter((p) => p.splitFrom && p.marketplace).map((p) => [`${idOf(p.splitFrom)}|${p.marketplace}`, p._id]))
  /** productId → marketplace → id of that shop's product (the original or its copy) */
  const owner = new Map()

  for (const product of products) {
    if (product.marketplace) continue
    const pid = idOf(product._id)
    const own = listingsOf.get(pid) || []
    const marketOf = (listing) => shopMarket.get(idOf(listing.shopId)) || registry.canonical(listing.marketplace)
    let markets = registry.KEYS.filter((key) => own.some((listing) => marketOf(listing) === key))
    if (!markets.length) {
      const target = registry.canonical(product.attributes?.targetMarketplace)
      markets = target ? [target] : [...registry.KEYS]
    }
    const numbers = (market) => {
      const listing = own.find((row) => marketOf(row) === market)
      return {
        stock: Number.isFinite(listing?.stock) ? listing.stock : (product.stock ?? 0),
        price: Number.isFinite(listing?.price) ? listing.price : product.basePrice,
      }
    }
    const ids = new Map()
    markets.forEach((market, index) => {
      if (index === 0) {
        plan.assign.push({ productId: product._id, marketplace: market, ...numbers(market) })
        ids.set(market, product._id)
      } else if (madeCopies.has(`${pid}|${market}`)) {
        ids.set(market, madeCopies.get(`${pid}|${market}`))
      } else {
        const newId = makeId()
        plan.copies.push({ fromId: product._id, newId, marketplace: market, ...numbers(market) })
        ids.set(market, newId)
      }
    })
    owner.set(pid, ids)
    for (const listing of own) {
      const target = ids.get(marketOf(listing))
      if (target && idOf(target) !== pid) plan.repoint.listings.push([listing._id, target])
    }
  }

  // Listings on one shop still attached to another shop's product (should be 0 after a full run).
  const productMarket = new Map(products.filter((p) => p.marketplace).map((p) => [idOf(p._id), p.marketplace]))
  for (const listing of listings) {
    const market = productMarket.get(idOf(listing.productId))
    const shopMarketOf = shopMarket.get(idOf(listing.shopId)) || registry.canonical(listing.marketplace)
    if (market && shopMarketOf && market !== shopMarketOf) plan.mismatched += 1
  }

  const copyFor = (productId, market) => {
    const target = owner.get(idOf(productId))?.get(market)
    return target && idOf(target) !== idOf(productId) ? target : null
  }
  for (const order of orders) {
    const market = registry.canonical(order.marketplace)
    ;(order.items || []).forEach((item, index) => {
      const target = item.productId && copyFor(item.productId, market)
      if (target) plan.repoint.orderItems.push([order._id, index, target])
    })
  }
  for (const log of logs) {
    const target = log.productId && log.shopId && copyFor(log.productId, shopMarket.get(idOf(log.shopId)))
    if (target) plan.repoint.logs.push([log._id, target])
  }
  for (const report of reports) {
    ;(report.opportunities || []).forEach((opp, index) => {
      const target = opp.addedProductId && copyFor(opp.addedProductId, registry.canonical(opp.targetMarketplace))
      if (target) plan.repoint.reports.push([report._id, index, target])
    })
  }
  return plan
}

/** Plans the split; with `apply` backs up, then writes. Returns a summary of what (would have) changed. */
async function run({ apply, db, makeId, log = console.log }) {
  const data = await db.load()
  let plan = planSplit({ ...data, makeId })
  const summarize = (p) => ({
    assigned: p.assign.length,
    copies: p.copies.length,
    listings: p.repoint.listings.length,
    orderItems: p.repoint.orderItems.length,
    logs: p.repoint.logs.length,
    reports: p.repoint.reports.length,
    mismatched: p.mismatched,
    applied: Boolean(apply),
  })
  let summary = summarize(plan)
  log(`Products given a shop: ${summary.assigned}; copies for other shops: ${summary.copies}`)
  log(`Repointed to a shop's copy: ${summary.listings} listings, ${summary.orderItems} order items, ${summary.logs} inventory logs, ${summary.reports} research links`)
  log(`Listings attached to another shop's product: ${summary.mismatched} (0 once the split is complete)`)
  if (!apply) {
    log('Dry run: nothing written. Run again with --apply to make these changes.')
    return summary
  }
  await db.backup(data)
  // Plan again from a fresh read so sales since the dry run are not overwritten.
  const latest = await db.load()
  plan = planSplit({ ...latest, makeId })
  summary = summarize(plan)
  // A copy reuses its product's SKU, so the old "SKU unique overall" index goes first.
  await db.dropOldSkuIndex()
  // Copies and repoints first, originals' shop last: if this stops midway, a re-run still sees the
  // unfinished originals (no shop yet) and reuses the copies already made (splitFrom).
  const byId = new Map(latest.products.map((product) => [idOf(product._id), product]))
  await db.createCopies(plan.copies.map((copy) => {
    const { _id, ...rest } = byId.get(idOf(copy.fromId))
    return { ...rest, _id: copy.newId, splitFrom: copy.fromId, marketplace: copy.marketplace, stock: copy.stock, basePrice: copy.price }
  }))
  await db.repoint(plan.repoint)
  await db.assign(plan.assign)
  await db.ensureIndexes()
  log('Done.')
  return summary
}

module.exports = { planSplit, run }
