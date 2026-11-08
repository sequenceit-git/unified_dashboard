/**
 * Read-only eBay smoke test: `npm run smoke:ebay`.
 * Uses the connected eBay shop's stored token (refreshed if needed) and calls every API the
 * dashboard depends on with GET requests only. Nothing is written, listed, cancelled or sent.
 * Exits 1 if any check fails.
 */
const path = require('path')
const root = path.join(__dirname, '..', '..')
require('dotenv').config({ path: path.join(root, '.env.local') })
require('dotenv').config({ path: path.join(root, '.env') })

const mongoose = require('mongoose')
const connectDB = require('../config/db')
const Shop = require('../models/Shop')
const config = require('../config/marketplaces').ebay
const ebay = require('../services/marketplace/ebay')
const manager = require('../services/marketplace')
const { PROFILES } = require('../services/marketplace/profiles')
const { ebayFetch } = require('../services/marketplace/ebayHttp')

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
  const missing = ['clientId', 'clientSecret', 'ruName'].filter((key) => !config[key])
  console.log(`eBay ${config.environment}; missing config: ${missing.join(', ') || 'none'}`)
  console.log(`EBAY_VERIFICATION_TOKEN set: ${Boolean((process.env.EBAY_VERIFICATION_TOKEN || '').trim())}`)

  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const shop = await Shop.findOne({ marketplace: 'ebay', status: 'connected' })
  if (!shop) {
    console.log('No connected eBay shop. Connect it from Settings first.')
    return 1
  }
  console.log(`Shop: ${shop.name}`)
  const scopes = config.scopes.map((scope) => scope.split('/').pop())
  console.log(`Requested scopes: ${scopes.join(', ')}`)

  await check('Application token (client credentials)', async () => {
    if (!(await ebay.getApplicationToken())) throw new Error('could not get an application token')
  })
  await check('Taxonomy category suggestions', async () => {
    const rows = await ebay.getCategories('', 'phone case')
    return `${rows.length} suggestions`
  })

  const token = await manager.freshToken(shop)
  if (!token) {
    results.push({ name: 'Shop access token', ok: false, note: 'shop has no stored token' })
  } else {
    // Every sidebar section's own read-only probe.
    for (const section of PROFILES.ebay.sections) {
      await check(`Section probe: ${section.label} (${section.needs})`, async () => { await section.probe(token, shop) })
    }
    await check('Post-Order cases search (IAF)', async () => {
      const body = await ebayFetch(token, '/post-order/v2/casemanagement/search?limit=1', { iaf: true })
      return `${(body.members || []).length} rows`
    })
    await check('Finances transactions (apiz host)', async () => {
      const data = await ebay.getFinances(token, { limit: 1 })
      return `${data.transactions.length} rows`
    })
    await check('Fulfillment order -> lineItemId present', async () => {
      const body = await ebayFetch(token, '/sell/fulfillment/v1/order?limit=1')
      const line = body.orders?.[0]?.lineItems?.[0]
      if (!line) return 'no orders to inspect'
      if (!line.lineItemId) throw new Error('order line item has no lineItemId')
      return `lineItemId ${line.lineItemId}`
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
