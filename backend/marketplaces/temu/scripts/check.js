/**
 * Temu health check: makes one read-only Temu call per dashboard feature with the connected shop's
 * token and prints OK, or Temu's exact error, for each. Nothing on the shop is changed.
 *
 *   docker compose exec backend npm run temu-check
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../../../config/db')
const { CHECKS } = require('./checkList')
const { probeRequest } = require('./probeRules')

async function main() {
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const Shop = require('../../../models/Shop')
  const manager = require('../app/manager')
  const temu = require('../service')
  const shop = await Shop.findOne({ marketplace: 'temu', status: 'connected' })
  if (!shop) throw new Error('No connected Temu shop')
  console.log(`Temu health check for "${shop.name}"\n`)
  const ctx = {}
  let ok = 0
  let failed = 0
  await manager.withShopToken(shop, async (token) => {
    for (const c of CHECKS) {
      probeRequest([c.method]) // read-only guard
      const params = c.params(ctx)
      const label = `${c.feature.padEnd(18)} ${c.method}`
      if (!params) { console.log(`  SKIP  ${label} (no goods on Temu to test with)`); continue }
      try {
        const res = await temu.call(c.method, { access_token: token, ...params })
        c.keep?.(res || {}, ctx)
        ok += 1
        console.log(`  OK    ${label}`)
      } catch (err) {
        failed += 1
        console.log(`  FAIL  ${label} → ${err.code ?? ''} ${err.message}`)
      }
    }
  })
  console.log(`\n${ok} OK, ${failed} failed.${failed ? ' Send me the FAIL lines.' : ' Everything the dashboard reads from Temu works.'}`)
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1 })
  .finally(() => mongoose.disconnect())
