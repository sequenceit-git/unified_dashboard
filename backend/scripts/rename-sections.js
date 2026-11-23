/**
 * Renames stored section ids to each shop's own API names: sub-admin permissions
 * (users.allowedSections) and shop API-access keys (shops.apiAccess).
 *
 *   docker compose exec backend npm run rename-sections            # dry run
 *   docker compose exec backend npm run rename-sections -- --apply # backs up, then writes
 *
 * The backup goes to /app/backups/rename-sections-<time>/ (not under the public uploads folder);
 * copy it out with the printed docker cp command. Safe to run twice.
 */
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../config/db')
const { run } = require('./renameSections')

async function main() {
  const apply = process.argv.includes('--apply')
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const col = (name) => mongoose.connection.db.collection(name)
  const { EJSON } = mongoose.mongo.BSON
  const db = {
    load: async () => ({
      users: await col('users').find({ allowedSections: { $exists: true, $ne: [] } }, { projection: { allowedSections: 1 } }).toArray(),
      shops: await col('shops').find({}, { projection: { marketplace: 1, apiAccess: 1 } }).toArray(),
    }),
    backup: async () => {
      const dir = path.join(__dirname, '..', 'backups', `rename-sections-${new Date().toISOString().replace(/[:.]/g, '-')}`)
      fs.mkdirSync(dir, { recursive: true })
      for (const name of ['users', 'shops']) {
        const docs = await col(name).find({}, { projection: name === 'users' ? { allowedSections: 1 } : { apiAccess: 1, marketplace: 1 } }).toArray()
        fs.writeFileSync(path.join(dir, `${name}.json`), docs.map((doc) => EJSON.stringify(doc, { relaxed: false })).join('\n'))
      }
      console.log(`Backup written to ${dir}`)
      console.log(`Copy it to the server before going on: docker cp unified-dashboard-backend:${dir} ./`)
    },
    writeUsers: async (rows) => {
      if (rows.length) await col('users').bulkWrite(rows.map(([id, allowedSections]) => ({ updateOne: { filter: { _id: id }, update: { $set: { allowedSections } } } })))
    },
    writeShops: async (rows) => {
      if (rows.length) await col('shops').bulkWrite(rows.map(([id, apiAccess]) => ({ updateOne: { filter: { _id: id }, update: { $set: { apiAccess } } } })))
    },
  }
  await run({ apply, db })
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
