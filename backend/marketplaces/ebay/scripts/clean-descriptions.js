/**
 * Fixes eBay product descriptions saved as a whole web page (<html><head>…<title>eBay</title>…),
 * keeping only the description inside <body>. New syncs already clean them (description.js).
 *
 *   docker compose exec backend npm run ebay-clean-descriptions            # dry run
 *   docker compose exec backend npm run ebay-clean-descriptions -- --apply # backs up, then writes
 *
 * Backup: /app/backups/ebay-clean-descriptions-<time>/products.json (copy it out with docker cp).
 */
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../../../config/db')
const { run } = require('./cleanDescriptions')

async function main() {
  const apply = process.argv.includes('--apply')
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const products = mongoose.connection.db.collection('products')
  const { EJSON } = mongoose.mongo.BSON
  const PAGE = /<(!doctype|html|head|body)\b/i
  await run({
    apply,
    db: {
      load: () => products.find({ marketplace: 'ebay', description: PAGE }, { projection: { description: 1 } }).toArray(),
      backup: async (rows) => {
        const dir = path.join(__dirname, '..', '..', '..', 'backups', `ebay-clean-descriptions-${new Date().toISOString().replace(/[:.]/g, '-')}`)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'products.json'), rows.map((doc) => EJSON.stringify(doc, { relaxed: false })).join('\n'))
        console.log(`Backup written to ${dir}`)
        console.log(`Copy it out: docker cp unified-dashboard-backend:${dir} ./`)
      },
      write: (rows) => products.bulkWrite(rows.map(([_id, description]) => ({ updateOne: { filter: { _id }, update: { $set: { description } } } }))),
    },
  })
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
