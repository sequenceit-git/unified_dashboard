/**
 * Read-only TikTok Shop US smoke test: `npm run smoke:tiktok`.
 * Uses the connected TikTok Shop's stored token and calls read-only endpoints across
 * authorization, orders, products, warehouse logistics, returns, cancellations, inbox,
 * finance, analytics, creators, and webhooks. Nothing is mutated. Exits 1 if any check fails.
 */
const path = require('path')
const root = path.join(__dirname, '..', '..')
require('dotenv').config({ path: path.join(root, '.env.local') })
require('dotenv').config({ path: path.join(root, '.env') })

const mongoose = require('mongoose')
const connectDB = require('../config/db')
const Shop = require('../models/Shop')
const config = require('../config/marketplaces').tiktok_shop
const tiktok = require('../services/marketplace/tiktok')
const manager = require('../services/marketplace')
const { PROFILES } = require('../services/marketplace/profiles')

const results = []
async function check(name, fn) {
  try {
    const note = await fn()
    results.push({ name, ok: true, note: note || '' })
  } catch (err) {
    results.push({ name, ok: false, note: err.message })
  }
}

async function main() {
  const missing = ['appKey', 'appSecret', 'serviceId'].filter((key) => !config[key])
  console.log(`TikTok Shop US (${config.apiBaseUrl}); missing config: ${missing.join(', ') || 'none'}`)

  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const shop = await Shop.findOne({ marketplace: 'tiktok_shop', status: 'connected' })
  if (!shop) {
    console.log('No connected TikTok Shop. Connect it from Settings first.')
    return 1
  }
  console.log(`Shop: ${shop.name} (${shop.externalShopId || 'no externalShopId'}, cipher=${shop.shopCipher ? 'set' : 'missing'})`)

  const token = await manager.freshToken(shop)
  if (!token) {
    results.push({ name: 'Shop access token', ok: false, note: 'shop has no stored token' })
  } else {
    await check('Authorized shops (GET /authorization/202309/shops)', async () => {
      const shops = await tiktok.getAuthorizedShops(token)
      return `${shops.length} shop(s)`
    })

    for (const section of PROFILES.tiktok_shop.sections) {
      await check(`Section probe: ${section.label} (${section.needs})`, async () => {
        await section.probe(token, shop)
      })
    }

    await check('Default warehouse (GET /logistics/202309/warehouses)', async () => {
      const id = await tiktok.defaultWarehouseId(token, shop)
      return `warehouseId=${id}`
    })

    await check('Inventory paging (POST /product/202502/products/search)', async () => {
      const { inventoryItems, complete } = await tiktok.getInventory(token, { shop, limit: 10 })
      return `${inventoryItems.length} SKUs sampled, complete=${complete}`
    })

    await check('Orders paging (POST /order/202309/orders/search)', async () => {
      const { orders, complete } = await tiktok.getOrders(token, { shop, limit: 10 })
      const line = orders[0]?.items?.[0]
      return line
        ? `${orders.length} orders, complete=${complete} (sample extId=${line.externalListingId || 'none'})`
        : `${orders.length} orders, complete=${complete}`
    })

    await check('Returns search (POST /return_refund/202309/returns/search)', async () => {
      const rows = await tiktok.getReturns(token, { shop, limit: 10 })
      return `${rows.length} return(s)`
    })

    await check('Cancellations search (POST /return_refund/202309/cancellations/search)', async () => {
      const rows = await tiktok.getCancellations(token, { shop, limit: 10 })
      return `${rows.length} cancellation(s)`
    })

    await check('Inbox (GET /customer_service/202309/conversations)', async () => {
      const threads = await tiktok.getInbox(token, shop)
      return `${threads.length} conversation(s)`
    })

    await check('Webhooks (GET /event/202309/webhooks)', async () => {
      const hooks = await tiktok.getWebhooks(token, { shop })
      return `${hooks.length} webhook(s)`
    })
  }

  const failed = results.filter((row) => !row.ok)
  console.log('')
  for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.note ? ` — ${row.note}` : ''}`)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  return failed.length ? 1 : 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => mongoose.disconnect().catch(() => {}))
