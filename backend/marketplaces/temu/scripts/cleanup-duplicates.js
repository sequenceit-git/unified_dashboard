/**
 * Cleans up historical Temu sync duplicates created before the SKU/customer fix:
 * - Merges duplicate `TEMU-...` order-created products (`source: 'marketplace_sync'`) into the
 *   real Temu catalog product (re-pointing Order.items and InventoryLog, deleting orphan Temu
 *   listings and the duplicate Product). Leaves products shared with other marketplaces alone.
 * - Detaches and removes collapsed placeholder `"Temu customer"` Customer records.
 *
 * Shows what it would change; nothing is written without --apply:
 * `docker compose exec backend npm run cleanup:temu [-- --apply]`
 */
const path = require('path')
const root = path.join(__dirname, '..', '..', '..', '..')
require('dotenv').config({ path: path.join(root, '.env.local') })
require('dotenv').config({ path: path.join(root, '.env') })

const mongoose = require('mongoose')
const connectDB = require('../../../config/db')
const Order = require('../../../models/Order')
const Product = require('../../../models/Product')
const Listing = require('../../../models/Listing')
const InventoryLog = require('../../../models/InventoryLog')
const Customer = require('../../../models/Customer')

const APPLY = process.argv.includes('--apply')

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function main() {
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  if (mongoose.connection.readyState !== 1) {
    console.log('No database connection.')
    return 1
  }
  console.log(APPLY ? 'APPLY mode: changing data.\n' : 'Dry run: nothing is changed. Add --apply to fix.\n')

  const duplicates = await Product.find({ sku: /^TEMU-/i, source: 'marketplace_sync' })
    .select('_id sku title')
    .lean()
  console.log(`Found ${duplicates.length} synced product(s) with TEMU- prefix.`)

  let merged = 0
  const skipped = []
  const unmatched = []

  for (const dup of duplicates) {
    const baseSku = String(dup.sku || '').replace(/^TEMU-/i, '').trim()
    const label = `${dup.sku} (${String(dup.title || '').slice(0, 45)})`

    const otherShopListings = await Listing.countDocuments({ productId: dup._id, marketplace: { $ne: 'temu' } })
    if (otherShopListings > 0) {
      skipped.push(`${label}: also listed on another marketplace`)
      continue
    }

    let real = baseSku
      ? await Product.findOne({ sku: baseSku, _id: { $ne: dup._id } }).select('_id sku title').lean()
      : null

    if (!real && baseSku) {
      const listingMatch = await Listing.findOne({
        marketplace: 'temu',
        productId: { $ne: dup._id },
        externalListingId: new RegExp(`(^|:)${escapeRegex(baseSku)}(:|$)`),
      }).select('productId').lean()
      if (listingMatch?.productId) {
        real = await Product.findById(listingMatch.productId).select('_id sku title').lean()
      }
    }

    if (!real) {
      unmatched.push(label)
      continue
    }

    const [orderCount, logCount, listingCount] = await Promise.all([
      Order.countDocuments({ 'items.productId': dup._id }),
      InventoryLog.countDocuments({ productId: dup._id }),
      Listing.countDocuments({ productId: dup._id, marketplace: 'temu' }),
    ])

    console.log(`MERGE  ${dup.sku} -> ${real.sku}  (orders: ${orderCount}, logs: ${logCount}, listings: ${listingCount})`)

    if (APPLY) {
      await Order.updateMany(
        { 'items.productId': dup._id },
        { $set: { 'items.$[elem].productId': real._id, 'items.$[elem].sku': real.sku } },
        { arrayFilters: [{ 'elem.productId': dup._id }] },
      )
      await InventoryLog.updateMany({ productId: dup._id }, { $set: { productId: real._id } })
      await Listing.deleteMany({ productId: dup._id, marketplace: 'temu' })
      await Product.deleteOne({ _id: dup._id })
    }
    merged += 1
  }

  const placeholderCustomers = await Customer.find({
    $or: [
      { 'identities.externalBuyerId': 'Temu customer' },
      { 'identities.username': 'Temu customer' },
    ],
  }).select('_id identities').lean()
  const placeholderIds = placeholderCustomers.map((c) => c._id)
  const linkedOrderCount = placeholderIds.length
    ? await Order.countDocuments({ customerId: { $in: placeholderIds }, marketplace: 'temu' })
    : 0
  console.log(`\nPlaceholder "Temu customer" records: ${placeholderIds.length} (linked Temu orders: ${linkedOrderCount})`)

  let detachedOrders = 0
  let removedCustomers = 0
  if (APPLY && placeholderIds.length) {
    const detached = await Order.updateMany(
      { customerId: { $in: placeholderIds }, marketplace: 'temu' },
      { $set: { customerId: null } },
    )
    detachedOrders = detached.modifiedCount || 0
    for (const id of placeholderIds) {
      if ((await Order.countDocuments({ customerId: id })) === 0) {
        await Customer.deleteOne({ _id: id })
        removedCustomers += 1
      }
    }
  }

  console.log('\nSummary:')
  console.log(`  ${APPLY ? 'Merged' : 'Would merge'}:               ${merged} duplicate product(s)`)
  console.log(`  Skipped (multi-market):   ${skipped.length}`)
  console.log(`  Unmatched (left intact):  ${unmatched.length}`)
  console.log(`  Placeholder customers:    ${APPLY ? `detached ${detachedOrders} order(s), removed ${removedCustomers} customer(s)` : `${placeholderIds.length} customer(s), ${linkedOrderCount} order(s) would detach`}`)

  if (skipped.length) {
    console.log('\nSkipped:')
    for (const item of skipped.slice(0, 15)) console.log(`  - ${item}`)
  }
  if (unmatched.length) {
    console.log('\nUnmatched TEMU- products (no matching real product found):')
    for (const item of unmatched.slice(0, 15)) console.log(`  - ${item}`)
    if (unmatched.length > 15) console.log(`  ... and ${unmatched.length - 15} more`)
  }
  return 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => mongoose.disconnect().catch(() => {}))
