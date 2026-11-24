/**
 * Compares every Temu method the dashboard calls with the methods the connected shop's token
 * allows (Temu's bg.open.accesstoken.info.get), and lists the missing ones by feature.
 *
 *   docker compose exec backend npm run temu-access
 *
 * A missing method has to be added to the app in the Temu Partner Platform (API permissions),
 * then granted in Seller Center → Authorization Management, then the shop reconnected.
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../../../config/db')
const { usedEndpoints } = require('../../../scripts/apiCoverage/used')
const { accessReport } = require('./accessRules')

async function main() {
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const Shop = require('../../../models/Shop')
  const manager = require('../app/manager')
  const temu = require('../service')
  const shop = await Shop.findOne({ marketplace: 'temu', status: 'connected' })
  if (!shop) throw new Error('No connected Temu shop')
  const info = await manager.withShopToken(shop, (token) => temu.call('bg.open.accesstoken.info.get', { access_token: token }))
  const granted = Array.isArray(info.apiScopeList) ? info.apiScopeList : []
  // Keep the shop's stored list in step with Temu's (the dashboard checks it before each call).
  await Shop.updateOne({ _id: shop._id }, { grantedScopes: granted })
  const r = accessReport(usedEndpoints('temu'), granted)
  console.log(`Shop: ${shop.name}   Token allows ${granted.length} methods; the dashboard uses ${r.used}, of which ${r.allowed} are allowed.`)
  if (!r.missing.length) return console.log('Everything the dashboard uses is allowed.')
  console.log('\nNot allowed yet (add them to the app in the Temu Partner Platform, grant them in Seller Center, then Reconnect):')
  for (const m of r.missing) console.log(`\n  ${m.feature}:\n    ${m.methods.join('\n    ')}`)
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1 })
  .finally(() => mongoose.disconnect())
