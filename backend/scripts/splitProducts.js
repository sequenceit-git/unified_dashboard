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
  const plan = { assign: [], copies: [], repoint: { listings: [], orderItems: [], logs: [], reports: [] } }
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
  const plan = planSplit({ ...data, makeId })
  const summary = {
    assigned: plan.assign.length,
    copies: plan.copies.length,
    listings: plan.repoint.listings.length,
    orderItems: plan.repoint.orderItems.length,
    logs: plan.repoint.logs.length,
    reports: plan.repoint.reports.length,
    applied: Boolean(apply),
  }
  log(`Products given a shop: ${summary.assigned}; copies for other shops: ${summary.copies}`)
  log(`Repointed to a shop's copy: ${summary.listings} listings, ${summary.orderItems} order items, ${summary.logs} inventory logs, ${summary.reports} research links`)
  if (!apply) {
    log('Dry run: nothing written. Run again with --apply to make these changes.')
    return summary
  }
  await db.backup(data)
  // A copy reuses its product's SKU, so the old "SKU unique overall" index goes first.
  await db.dropOldSkuIndex()
  await db.assign(plan.assign)
  const byId = new Map(data.products.map((product) => [idOf(product._id), product]))
  await db.createCopies(plan.copies.map((copy) => {
    const { _id, ...rest } = byId.get(idOf(copy.fromId))
    return { ...rest, _id: copy.newId, marketplace: copy.marketplace, stock: copy.stock, basePrice: copy.price }
  }))
  await db.repoint(plan.repoint)
  await db.ensureIndexes()
  log('Done.')
  return summary
}

module.exports = { planSplit, run }
