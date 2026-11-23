/**
 * Gives every product one shop and splits products listed on several shops into one product per
 * shop (each with that shop's listing stock and price). Listings, order items, inventory history
 * and research links are pointed at their shop's copy.
 *
 *   docker compose exec backend npm run split-products            # dry run: prints the plan only
 *   docker compose exec backend npm run split-products -- --apply # backs up, then writes
 *
 * Pause all sync first (SYNC_PAUSED=true in .env, then restart the backend).
 * The backup is written to /app/backups/split-products-<time>/ (EJSON, restorable with mongoimport).
 * It is not on a volume and deliberately not under uploads/ (served publicly): the script prints
 * the `docker cp` command to copy it to the server.
 * Safe to run twice: products that already have a shop are left alone.
 */
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../config/db')
const Product = require('../models/Product')
const { run } = require('./splitProducts')

async function main() {
  const apply = process.argv.includes('--apply')
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const col = (name) => mongoose.connection.db.collection(name)
  const { EJSON } = mongoose.mongo.BSON

  const db = {
    load: async () => ({
      shops: await col('shops').find({}, { projection: { marketplace: 1 } }).toArray(),
      products: await col('products').find({}).toArray(),
      listings: await col('listings').find({}, { projection: { productId: 1, shopId: 1, marketplace: 1, stock: 1, price: 1 } }).toArray(),
      orders: await col('orders').find({}, { projection: { marketplace: 1, 'items.productId': 1 } }).toArray(),
      logs: await col('inventorylogs').find({}, { projection: { productId: 1, shopId: 1 } }).toArray(),
      reports: await col('researchreports').find({}, { projection: { 'opportunities.addedProductId': 1, 'opportunities.targetMarketplace': 1 } }).toArray(),
    }),
    backup: async () => {
      const dir = path.join(__dirname, '..', 'backups', `split-products-${new Date().toISOString().replace(/[:.]/g, '-')}`)
      fs.mkdirSync(dir, { recursive: true })
      for (const name of ['products', 'listings', 'orders', 'inventorylogs', 'researchreports']) {
        const docs = await col(name).find({}).toArray()
        fs.writeFileSync(path.join(dir, `${name}.json`), docs.map((doc) => EJSON.stringify(doc, { relaxed: false })).join('\n'))
      }
      console.log(`Backup written to ${dir}`)
      // Not on a volume (and never under uploads/, which is served publicly): copy it out now.
      console.log(`Copy it to the server before going on: docker cp unified-dashboard-backend:${dir} ./`)
    },
    dropOldSkuIndex: async () => {
      const indexes = await col('products').indexes()
      if (indexes.some((index) => index.name === 'sku_1')) await col('products').dropIndex('sku_1')
    },
    assign: async (rows) => {
      if (!rows.length) return
      await col('products').bulkWrite(rows.map((row) => ({
        updateOne: { filter: { _id: row.productId }, update: { $set: { marketplace: row.marketplace, stock: row.stock, basePrice: row.price } } },
      })))
    },
    createCopies: async (docs) => {
      if (docs.length) await col('products').insertMany(docs)
    },
    repoint: async ({ listings, orderItems, logs, reports }) => {
      if (listings.length) await col('listings').bulkWrite(listings.map(([id, productId]) => ({ updateOne: { filter: { _id: id }, update: { $set: { productId } } } })))
      if (orderItems.length) await col('orders').bulkWrite(orderItems.map(([id, index, productId]) => ({ updateOne: { filter: { _id: id }, update: { $set: { [`items.${index}.productId`]: productId } } } })))
      if (logs.length) await col('inventorylogs').bulkWrite(logs.map(([id, productId]) => ({ updateOne: { filter: { _id: id }, update: { $set: { productId } } } })))
      if (reports.length) await col('researchreports').bulkWrite(reports.map(([id, index, productId]) => ({ updateOne: { filter: { _id: id }, update: { $set: { [`opportunities.${index}.addedProductId`]: productId } } } })))
    },
    // Creates the schema's indexes (incl. { marketplace, sku } unique) without dropping any others.
    ensureIndexes: () => Product.createIndexes(),
  }

  await run({ apply, db, makeId: () => new mongoose.Types.ObjectId() })
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
