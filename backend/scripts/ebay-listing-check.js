/**
 * Read-only: compares every eBay listing stored in the dashboard with what eBay reports.
 * `docker compose exec backend node scripts/ebay-listing-check.js`
 *
 * For listings eBay does not show as active, it asks eBay for the item itself (GetItem) and
 * prints eBay's own status, quantity and sold count. Nothing is written anywhere.
 */
const path = require('path')
const root = path.join(__dirname, '..', '..')
require('dotenv').config({ path: path.join(root, '.env.local') })
require('dotenv').config({ path: path.join(root, '.env') })

const mongoose = require('mongoose')
const connectDB = require('../config/db')
const Shop = require('../models/Shop')
const Listing = require('../models/Listing')
require('../models/Product')
const manager = require('../services/marketplace')
const trading = require('../services/marketplace/ebayTrading')

const numericId = (id) => String(id || '').replace(/^(ebay-)?item-/, '')

async function main() {
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const shop = await Shop.findOne({ marketplace: 'ebay', status: 'connected' })
  if (!shop) {
    console.log('No connected eBay shop.')
    return 1
  }
  const token = await manager.freshToken(shop)
  const { items: active, complete } = await trading.getActiveSummaries(token)
  const activeById = new Map(active.map((row) => [row.itemId, row]))
  const listings = await Listing.find({ shopId: shop._id }).populate('productId', 'sku title stock source').lean()

  console.log(`eBay reports ${active.length} active listings (all pages read: ${complete}). Dashboard has ${listings.length} eBay listings.\n`)
  const counts = {}
  const problems = []
  let lookups = 0
  for (const listing of listings) {
    const id = numericId(listing.externalListingId)
    const onEbay = activeById.get(id)
    counts[listing.status] = (counts[listing.status] || 0) + 1
    const title = String(listing.productId?.title || '').slice(0, 45)
    const sku = listing.productId?.sku || ''
    if (onEbay) {
      const issues = []
      if (!['live', 'out_of_stock'].includes(listing.status)) issues.push(`dashboard says ${listing.status}, eBay says active`)
      if (Number.isFinite(onEbay.stock) && onEbay.stock !== listing.stock) issues.push(`stock here ${listing.stock}, on eBay ${onEbay.stock}`)
      // The shared product stock is what gets pushed to other shops; it should match eBay
      // unless the product is also sold elsewhere.
      const shared = listing.productId?.stock
      if (Number.isFinite(onEbay.stock) && Number.isFinite(shared) && shared !== onEbay.stock) {
        const elsewhere = await Listing.countDocuments({ productId: listing.productId._id, shopId: { $ne: shop._id }, status: { $in: ['live', 'out_of_stock'] } })
        issues.push(`shared stock ${shared}, eBay ${onEbay.stock}${elsewhere ? ` (also listed on ${elsewhere} other shop(s))` : ''}`)
      }
      if (issues.length) problems.push({ id, sku, title, issues })
      continue
    }
    if (!/^\d{9,}$/.test(id)) {
      problems.push({ id: listing.externalListingId || '(none)', sku, title, issues: [`dashboard says ${listing.status}; no valid eBay item ID, never published`] })
      continue
    }
    if (lookups >= 60) continue
    lookups += 1
    let ebay = 'not found on eBay'
    try {
      const item = await trading.getItem(token, id)
      if (item) {
        const raw = item.raw || {}
        ebay = `eBay status ${item.listingStatus || '?'}, available ${item.stock}, sold ${raw.SellingStatus?.QuantitySold ?? '?'}, out-of-stock control ${raw.OutOfStockControl ?? 'n/a'}`
      }
    } catch (err) {
      ebay = `eBay lookup failed: ${err.message}`
    }
    const expected = ['ended', 'error'].includes(listing.status)
    // eBay refuses GetItem for listings it removed (e.g. policy violations); "ended" is right for those.
    if (expected && /removed/i.test(ebay)) {
      console.log(`Note: ${id} ${title}: ${ebay.replace('eBay lookup failed: eBay: ', '')} (dashboard: ended, correct)`)
      continue
    }
    if (!expected || !/Completed|Ended/i.test(ebay)) problems.push({ id, sku, title, issues: [`dashboard says ${listing.status}; ${ebay}`] })
  }

  console.log('Dashboard listing statuses:', JSON.stringify(counts))
  console.log(`\n${problems.length} listing(s) where the dashboard and eBay disagree or look odd:\n`)
  for (const row of problems) console.log(`- ${row.id}  ${row.sku}  ${row.title}\n    ${row.issues.join('\n    ')}`)
  if (lookups >= 60) console.log('\n(Stopped item lookups at 60; run again later for the rest.)')
  return 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => mongoose.disconnect().catch(() => {}))
