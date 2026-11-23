/**
 * Read-only Temu US smoke test: `npm run smoke:temu`.
 * Uses the connected Temu shop's stored token and calls read-only endpoints plus
 * `bg.open.accesstoken.info.get` to report which write API scopes your US Self-Developed
 * Application is authorized for. Nothing is cancelled, shipped, refunded, or edited.
 * Exits 1 if any check fails.
 */
const path = require('path')
const root = path.join(__dirname, '..', '..', '..', '..')
require('dotenv').config({ path: path.join(root, '.env.local') })
require('dotenv').config({ path: path.join(root, '.env') })

const mongoose = require('mongoose')
const connectDB = require('../../../config/db')
const Shop = require('../../../models/Shop')
const config = require('../config')
const temu = require('../service')
const manager = require('../../../services/marketplace')
const { PROFILES } = require('../../../services/marketplace/profiles')

const WRITE_SCOPE_AUDIT = [
  'bg.logistics.shipment.v2.confirm',
  'bg.logistics.companies.get',
  'bg.logistics.warehouse.list.get',
  'temu.order.cancel.outofstock.apply',
  'temu.aftersales.refund.issue',
  'bg.aftersales.cancel.agree',
  'bg.order.shippinginfo.v2.get',
  'bg.order.amount.query',
  'bg.local.goods.stock.edit',
  'bg.local.goods.sale.status.set',
  'bg.local.goods.priceorder.change.sku.price',
  'bg.tmc.message.update',
]

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
  const missing = ['appKey', 'appSecret'].filter((key) => !config[key])
  console.log(`Temu US (${config.apiBaseUrl}); missing config: ${missing.join(', ') || 'none'}`)

  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const shop = await Shop.findOne({ marketplace: 'temu', status: 'connected' })
  if (!shop) {
    console.log('No connected Temu shop. Connect it from Settings first.')
    return 1
  }
  console.log(`Shop: ${shop.name} (${shop.externalShopId || 'no mallId'})`)

  let scopes = []
  const token = await manager.freshToken(shop)
  if (!token) {
    results.push({ name: 'Shop access token', ok: false, note: 'shop has no stored token' })
  } else {
    await check('Token & authorized API scopes (bg.open.accesstoken.info.get)', async () => {
      const res = await temu.call('bg.open.accesstoken.info.get', { access_token: token })
      const raw = res.apiScopeList || res.api_scope_list || []
      scopes = Array.isArray(raw) ? raw.map(String) : []
      const mallId = res.mallId || res.mall_id || '?'
      const exp = res.expiredTime || res.expired_time || '?'
      return `mallId=${mallId}, expires=${exp}, scopes=${scopes.length}`
    })

    for (const section of PROFILES.temu.sections) {
      await check(`Section probe: ${section.label} (${section.needs})`, async () => {
        await section.probe(token, shop)
      })
    }

    await check('Carrier list (bg.logistics.companies.get)', async () => {
      const res = await temu.call('bg.logistics.companies.get', { access_token: token, regionId: 211 })
      const list = res.shippingCompanyList || res.logisticsServiceProviderList || Object.values(res).find(Array.isArray) || []
      const keys = list[0] && typeof list[0] === 'object' ? Object.keys(list[0]).join(', ') : 'none'
      return `${list.length} carriers; item keys: ${keys}`
    })

    await check('Inventory paging (bg.local.goods.list.query)', async () => {
      const { inventoryItems, complete } = await temu.getInventory(token)
      return `${inventoryItems.length} SKUs, complete=${complete}`
    })

    await check('Orders paging (bg.order.list.v2.get)', async () => {
      const { orders } = await temu.getOrders(token, { limit: 10 })
      const line = orders[0]?.items?.[0]
      const withTotal = orders.filter((order) => order.totals?.total > 0).length
      const toShip = orders.filter((order) => ['pending', 'paid'].includes(order.status))
      const withAddress = toShip.filter((order) => order.shippingAddress?.street).length
      const counts = `${withTotal}/${orders.length} with total, ${withAddress}/${toShip.length} to-ship with address`
      return line
        ? `${orders.length} orders; ${counts} (sample: externalListingId=${Boolean(line.externalListingId)}, lineItemId=${Boolean(line.lineItemId)})`
        : `${orders.length} orders; ${counts}`
    })
  }

  const failed = results.filter((row) => !row.ok)
  console.log('')
  for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.note ? ` — ${row.note}` : ''}`)

  if (scopes.length > 0) {
    const scopeSet = new Set(scopes)
    console.log('\nWrite API scope audit (bg.open.accesstoken.info.get -> apiScopeList):')
    for (const name of WRITE_SCOPE_AUDIT) {
      console.log(`  [${scopeSet.has(name) ? 'GRANTED' : 'MISSING'}] ${name}`)
    }
    const relevant = scopes
      .filter((s) => /logistics|shipment|cancel|aftersales|refund|priceorder|stock/i.test(s))
      .sort()
    console.log(`\nGranted logistics/cancel/aftersales/price/stock scopes (${relevant.length}):`)
    for (const s of relevant) console.log(`  - ${s}`)
  }

  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  return failed.length ? 1 : 0
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => mongoose.disconnect().catch(() => {}))
