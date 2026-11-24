/**
 * Sends ONE read-only Temu call with the connected Temu shop's token and prints Temu's exact
 * answer (success, errorCode, errorMsg, result) — to see why Temu refuses a request.
 *
 *   docker compose exec backend npm run temu-probe -- bg.promotion.activity.query '{"pageNumber":1,"pageSize":20}'
 *
 * Read-only calls only (queries); the token is never printed.
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env'), quiet: true })

const mongoose = require('mongoose')
const connectDB = require('../../../config/db')
const { probeRequest } = require('./probeRules')

async function main() {
  const { method, params } = probeRequest(process.argv.slice(2))
  await connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  const Shop = require('../../../models/Shop')
  const manager = require('../app/manager')
  const temu = require('../service')
  const shop = await Shop.findOne({ marketplace: 'temu', status: 'connected' })
  if (!shop) throw new Error('No connected Temu shop')
  console.log(`Shop: ${shop.name}  Method: ${method}  Params: ${JSON.stringify(params)}`)
  try {
    const result = await manager.withShopToken(shop, (token) => temu.call(method, { access_token: token, ...params }))
    console.log('success: true')
    console.log(JSON.stringify(result, null, 2).slice(0, 20000))
  } catch (err) {
    console.log('success: false')
    console.log(`errorCode: ${err.code ?? '—'}`)
    console.log(`errorMsg: ${err.message}`)
  }
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1 })
  .finally(() => mongoose.disconnect())
