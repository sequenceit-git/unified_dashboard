/**
 * Deletes the TikTok inbox data the dashboard no longer uses (the TikTok inbox was removed: the
 * E-commerce connector app has no Customer Service scope): conversations of TikTok shops, their
 * messages, and "new message" notifications of those shops. Other shops' data is not touched.
 *
 *   docker compose exec backend npm run tiktok-remove-inbox-data            # dry run
 *   docker compose exec backend npm run tiktok-remove-inbox-data -- --apply # backs up, then deletes
 *
 * Backup: /app/backups/tiktok-inbox-<time>/ (copy it out with docker cp). Safe to run twice.
 */
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../../../config/db')
const { run } = require('./removeInboxData')

async function main() {
  const apply = process.argv.includes('--apply')
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const col = (name) => mongoose.connection.db.collection(name)
  const { EJSON } = mongoose.mongo.BSON
  const filters = (shopIds) => ({
    conversations: { shopId: { $in: shopIds } },
    messages: { shopId: { $in: shopIds } },
    notifications: { shopId: { $in: shopIds }, type: 'new_message' },
  })
  // Messages are matched by shop, and also by conversation for any saved without a shopId.
  const messageFilter = async (shopIds) => ({
    $or: [{ shopId: { $in: shopIds } }, { conversationId: { $in: await col('conversations').distinct('_id', { shopId: { $in: shopIds } }) } }],
  })
  await run({
    apply,
    db: {
      shopIds: () => col('shops').distinct('_id', { marketplace: 'tiktok_shop' }),
      count: async (shopIds) => ({
        conversations: await col('conversations').countDocuments(filters(shopIds).conversations),
        messages: await col('messages').countDocuments(await messageFilter(shopIds)),
        notifications: await col('notifications').countDocuments(filters(shopIds).notifications),
      }),
      backup: async (shopIds) => {
        const dir = path.join(__dirname, '..', '..', '..', 'backups', `tiktok-inbox-${new Date().toISOString().replace(/[:.]/g, '-')}`)
        fs.mkdirSync(dir, { recursive: true })
        const f = filters(shopIds)
        for (const [name, filter] of [['conversations', f.conversations], ['messages', await messageFilter(shopIds)], ['notifications', f.notifications]]) {
          const docs = await col(name).find(filter).toArray()
          fs.writeFileSync(path.join(dir, `${name}.json`), docs.map((doc) => EJSON.stringify(doc, { relaxed: false })).join('\n'))
        }
        console.log(`Backup written to ${dir}`)
        console.log(`Copy it out: docker cp unified-dashboard-backend:${dir} ./`)
      },
      remove: async (shopIds) => {
        const f = filters(shopIds)
        await col('messages').deleteMany(await messageFilter(shopIds))
        await col('conversations').deleteMany(f.conversations)
        await col('notifications').deleteMany(f.notifications)
      },
    },
  })
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
