/**
 * Repairs eBay products saved before SKU and image clean-up:
 * - a made-up SKU (random ID such as 3266ccf4-…, BOT-, EP-, draft EBAY-yymmdd-xxxxxx) becomes
 *   EBAY-<eBay item ID>, the format every other eBay product uses;
 * - a product with no images gets them from eBay (GetItem also works for ended listings).
 *
 * Shows what it would change; nothing is written without --apply.
 * `docker compose exec backend node scripts/fix-ebay-products.js [--apply]`
 */
const path = require('path')
const root = path.join(__dirname, '..', '..')
require('dotenv').config({ path: path.join(root, '.env.local'), quiet: true })
require('dotenv').config({ path: path.join(root, '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../config/db')
const Shop = require('../models/Shop')
const Listing = require('../models/Listing')
const Product = require('../models/Product')
const manager = require('../services/marketplace')
const trading = require('../services/marketplace/ebayTrading')
const { ebaySku, isMachineSku } = require('../utils/sku')

const APPLY = process.argv.includes('--apply')
const MAX_IMAGE_LOOKUPS = 100
const itemIdOf = (id) => String(id || '').replace(/^(ebay-)?item-/i, '').replace(/^EBAY-/i, '')

async function main() {
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const shop = await Shop.findOne({ marketplace: 'ebay', status: 'connected' })
  if (!shop) {
    console.log('No connected eBay shop.')
    return 1
  }
  const token = await manager.freshToken(shop)
  const listings = await Listing.find({ shopId: shop._id }).populate('productId', 'sku title images').lean()
  console.log(`${APPLY ? 'Fixing' : 'Dry run (add --apply to save)'}: ${listings.length} eBay listings.\n`)

  let skuFixed = 0
  let imagesFixed = 0
  let lookups = 0
  const skipped = []
  for (const listing of listings) {
    const product = listing.productId
    if (!product) continue
    const itemId = itemIdOf(listing.externalListingId)
    if (!/^\d{9,}$/.test(itemId)) continue
    const label = `${itemId}  ${String(product.title || '').slice(0, 50)}`
    const update = {}

    if (isMachineSku(product.sku)) {
      const sku = ebaySku('', itemId)
      // Other shops' listings may be keyed by this product's SKU; leave shared products alone.
      const elsewhere = await Listing.countDocuments({ productId: product._id, shopId: { $ne: shop._id } })
      const taken = await Product.exists({ sku, _id: { $ne: product._id } })
      if (elsewhere) skipped.push(`${label}: SKU ${product.sku} kept, product is also listed on another shop`)
      else if (taken) skipped.push(`${label}: SKU ${product.sku} kept, ${sku} is already used by another product`)
      else {
        update.sku = sku
        console.log(`SKU     ${label}\n        ${product.sku} -> ${sku}`)
      }
    }

    if (!product.images?.length && lookups < MAX_IMAGE_LOOKUPS) {
      lookups += 1
      try {
        const item = await trading.getItem(token, itemId)
        if (item?.images?.length) {
          update.images = item.images
          console.log(`Images  ${label}\n        ${item.images.length} image(s) from eBay`)
        } else {
          skipped.push(`${label}: eBay has no pictures for this item`)
        }
      } catch (err) {
        skipped.push(`${label}: images not loaded (${err.message})`)
      }
    }

    if (!Object.keys(update).length) continue
    if (update.sku) skuFixed += 1
    if (update.images) imagesFixed += 1
    if (APPLY) await Product.updateOne({ _id: product._id }, { $set: update })
  }

  console.log(`\n${APPLY ? 'Changed' : 'Would change'}: ${skuFixed} SKU(s), ${imagesFixed} product image set(s).`)
  if (skipped.length) console.log(`\nLeft as is:\n- ${skipped.join('\n- ')}`)
  if (lookups >= MAX_IMAGE_LOOKUPS) console.log(`\n(Stopped image lookups at ${MAX_IMAGE_LOOKUPS}; run again for the rest.)`)
  return 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => mongoose.disconnect().catch(() => {}))
