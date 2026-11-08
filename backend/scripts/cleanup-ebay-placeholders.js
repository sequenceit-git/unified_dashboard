/**
 * Removes placeholder data older eBay syncs invented: `npm run cleanup:ebay` (dry run) or
 * `npm run cleanup:ebay -- --apply`.
 *
 *  - made-up buyer emails `username@members.ebay.com` on customers and orders
 *  - the made-up 19.99 product price, when a listing holds the real price
 *
 * Tracking numbers that were really eBay fulfillment IDs are not touched here: the order sync
 * re-reads each shipped order's shipment record and replaces them (40 orders per run).
 */
const path = require('path')
const root = path.join(__dirname, '..', '..')
require('dotenv').config({ path: path.join(root, '.env.local') })
require('dotenv').config({ path: path.join(root, '.env') })

const mongoose = require('mongoose')
const connectDB = require('../config/db')
const Customer = require('../models/Customer')
const Order = require('../models/Order')
const Product = require('../models/Product')
const Listing = require('../models/Listing')

const apply = process.argv.includes('--apply')
const FAKE_EMAIL = /@members\.ebay\.com$/i

async function main() {
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  if (mongoose.connection.readyState !== 1) {
    console.log('No database connection.')
    return 1
  }
  console.log(apply ? 'APPLY mode: changing data.\n' : 'Dry run: nothing is changed. Add --apply to fix.\n')

  const customers = await Customer.countDocuments({ email: FAKE_EMAIL })
  const orders = await Order.countDocuments({ 'buyer.email': FAKE_EMAIL })
  console.log(`Customers with a made-up eBay email: ${customers}`)
  console.log(`Orders with a made-up eBay email:    ${orders}`)

  const placeholders = await Product.find({ basePrice: 19.99, source: 'marketplace_sync' }).select('title sku').lean()
  const fixable = []
  const unknown = []
  for (const product of placeholders) {
    const listing = await Listing.findOne({ productId: product._id, price: { $gt: 0, $ne: 19.99 } }).select('price').lean()
    if (listing) fixable.push({ id: product._id, price: listing.price })
    else unknown.push(product)
  }
  console.log(`Synced products priced exactly 19.99: ${placeholders.length} (${fixable.length} have a different real listing price, ${unknown.length} do not)`)
  if (unknown.length) {
    console.log('  Left as they are, check by hand (may be real 19.99 prices):')
    for (const product of unknown.slice(0, 15)) console.log(`  - ${product.sku}  ${String(product.title).slice(0, 60)}`)
    if (unknown.length > 15) console.log(`  ... and ${unknown.length - 15} more`)
  }

  if (apply) {
    const c = await Customer.updateMany({ email: FAKE_EMAIL }, { $unset: { email: '' } })
    const o = await Order.updateMany({ 'buyer.email': FAKE_EMAIL }, { $unset: { 'buyer.email': '' } })
    for (const row of fixable) await Product.updateOne({ _id: row.id }, { $set: { basePrice: row.price } })
    console.log(`\nFixed: ${c.modifiedCount} customers, ${o.modifiedCount} orders, ${fixable.length} product prices.`)
  }
  return 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => mongoose.disconnect().catch(() => {}))
