/**
 * GET /goods/signals — what Temu says about each goods, for the Goods page's chips and needs-attention:
 * traffic restricted / low traffic, a compliance item without a certificate on file, a price review
 * still open. Cached 10 minutes per shop; a Temu call that fails leaves the others (named in
 * `unavailable`).
 */
const cache = require('../../../../services/core/cache')
const marketplaceManager = require('../manager')
const { goodsShop } = require('./goodsHelpers')

const TTL = 600
const CLOSED = /approv|pass|agree|reject|refus|cancel|expir|finish|done|success|fail|close/i

async function pages(fetchPage, max) {
  const rows = []
  for (let page = 1; page <= max; page += 1) {
    const { list, more } = await fetchPage(page)
    rows.push(...list)
    if (!more || !list.length) break
  }
  return rows
}

async function signals(ctx) {
  const shop = await goodsShop(ctx)
  return cache.wrap(`temu:goods-signals:${shop._id}`, TTL, () => marketplaceManager.withShopToken(shop, async (token) => {
    const temu = require('../../service')
    const call = (method, params = {}) => temu.call(method, { access_token: token, ...params })
    const goods = {}
    const mark = (id, patch) => { goods[String(id)] = { ...goods[String(id)], ...patch } }
    const unavailable = []
    const sources = {
      traffic: async () => {
        let pageToken = ''
        for (let i = 0; i < 20; i += 1) {
          const res = await call('temu.local.goods.list.retrieve', { pageSize: 100, goodsSearchType: 'ALL', ...(pageToken ? { pageToken } : {}) })
          for (const g of res.goodsList || []) {
            if (Number(g.restrictedTrafficTag) === 1) mark(g.goodsId, { traffic: 'Traffic restricted' })
            else if (Number(g.lowTrafficTag) === 1) mark(g.goodsId, { traffic: 'Low traffic' })
          }
          pageToken = res.pagination?.nextToken || ''
          if (!pageToken || !(res.goodsList || []).length) break
        }
      },
      compliance: async () => {
        let seen = 0
        const rows = await pages(async (pageNo) => {
          const res = await call('bg.local.compliance.goods.list.query', { pageNo, pageSize: 50 })
          seen += (res.goodsList || []).length
          return { list: res.goodsList || [], more: seen < (res.total ?? 0) }
        }, 20)
        for (const g of rows) if (!(g.certificateInfoList || []).length) mark(g.goodsId, { certNeeded: true })
      },
      priceReviews: async () => {
        const res = await call('bg.local.goods.priceorder.query', { page: 1, size: 50 })
        for (const row of res.list || res.priceOrderList || res.data || []) {
          const status = String(row.priceOrderStatus ?? row.status ?? row.orderStatus ?? '')
          if (row.goodsId != null && !CLOSED.test(status)) mark(row.goodsId, { priceReview: true })
        }
      },
    }
    await Promise.all(Object.entries(sources).map(([name, run]) => run().catch(() => { unavailable.push(name) })))
    return { goods, unavailable: unavailable.sort() }
  }))
}

module.exports = { signals }
