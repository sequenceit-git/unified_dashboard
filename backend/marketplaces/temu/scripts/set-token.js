/**
 * Saves an access token that Temu Seller Center showed after a manual authorization to the
 * connected Temu shop: Temu's own token info is read first, the token must belong to this shop's
 * mall, and the allowed methods and expiry are saved with it (encrypted, like a Reconnect).
 *
 *   docker compose exec backend npm run temu-set-token      # then paste the token and press Enter
 *
 * The token is read from the keyboard (not the command line) and never printed.
 */
const path = require('path')
const readline = require('readline')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../../../config/db')
const { tokenUpdate } = require('./tokenRules')

const ask = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false })
  process.stdout.write(q)
  rl.once('line', (line) => { rl.close(); resolve(line) })
})

async function main() {
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const Shop = require('../../../models/Shop')
  const temu = require('../service')
  const shop = await Shop.findOne({ marketplace: 'temu' }).sort({ status: 1 })
  if (!shop) throw new Error('No Temu shop in the dashboard. Connect it once from Settings first.')
  const token = (await ask(`Paste the Temu access token for "${shop.name}" and press Enter: `)).trim()
  const info = await temu.call('bg.open.accesstoken.info.get', { access_token: token })
  const update = tokenUpdate(shop, token, info)
  await Shop.updateOne({ _id: shop._id }, { $set: update })
  const methods = update.grantedScopes
  console.log(`Saved for "${shop.name}" (mall ${info.mallId}). Allowed methods: ${methods.length}.`)
  if (update['auth.expiresAt']) console.log(`Expires: ${update['auth.expiresAt'].toISOString().slice(0, 10)}`)
  const want = ['bg.local.goods.sku.list.price.query', 'bg.local.goods.add', 'bg.local.goods.cats.get', 'bg.logistics.shipment.create', 'temu.searchrec.ad.create', 'bg.promotion.activity.query']
  const missing = want.filter((m) => !methods.includes(m))
  console.log(missing.length ? `Still not allowed: ${missing.join(', ')}` : 'The listing, label, ad, price and promotion methods are all allowed.')
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1 })
  .finally(() => mongoose.disconnect())
