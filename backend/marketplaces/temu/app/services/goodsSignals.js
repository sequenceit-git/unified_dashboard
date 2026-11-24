/**
 * GET /goods/signals — what Temu says about the dashboard's goods, for the Goods page's chips and
 * needs-attention: traffic restricted / low traffic, compliance items to check, price reviews waiting
 * for the seller (Temu price-order code 101). Only goods stored for this shop; `totals` count rows
 * (like the status pills). Complete results are cached 10 minutes; a failed call is named in
 * `unavailable` and that result isn't cached. Methods the token lacks are not called.
 */
const cache = require('../../../../services/core/cache')
const Listing = require('../../../../models/Listing')
const marketplaceManager = require('../manager')
const { goodsShop } = require('./goodsHelpers')

const TTL = 600
const AWAITING_SELLER = 101

function granted(shop, method) {
  const list = shop?.grantedScopes
  return !(Array.isArray(list) && list.length && !list.includes(method))
}

async function signals(ctx) {
  const shop = await goodsShop(ctx)
  const key = `temu:goods-signals:${shop._id}`
  const hit = await cache.get(key)
  if (hit) return hit
  // Rows per Temu goods id, for the shop's stored goods ("<goodsId>:<skuId>" or a bare goodsId).
  const rows = new Map()
  for (const l of await Listing.find({ shopId: shop._id, marketplace: 'temu' }).select('externalListingId').lean()) {
    const id = String(l.externalListingId || '').split(':')[0]
    if (id) rows.set(id, (rows.get(id) || 0) + 1)
  }
  const out = await marketplaceManager.withShopToken(shop, async (token) => {
    const temu = require('../../service')
    const goods = {}
    const mark = (id, patch) => {
      if (!rows.has(String(id))) return
      goods[String(id)] = { ...goods[String(id)], ...patch }
    }
    const unavailable = []
    const sources = {
      traffic: ['temu.local.goods.list.retrieve', async (call) => {
        let pageToken = ''
        for (let i = 0; i < 20; i += 1) {
          const res = await call({ pageSize: 100, goodsSearchType: 'ALL', ...(pageToken ? { pageToken } : {}) })
          for (const g of res.goodsList || []) {
            if (Number(g.restrictedTrafficTag) === 1) mark(g.goodsId, { traffic: 'Traffic restricted' })
            else if (Number(g.lowTrafficTag) === 1) mark(g.goodsId, { traffic: 'Low traffic' })
          }
          pageToken = res.pagination?.nextToken || ''
          if (!pageToken || !(res.goodsList || []).length) break
        }
      }],
      // Temu doesn't document its certificate status codes: a goods with certificate items is "to check"
      // (the goods' Compliance details compare what is required with what is on file).
      compliance: ['bg.local.compliance.goods.list.query', async (call) => {
        let seen = 0
        for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
          const res = await call({ pageNo, pageSize: 50 })
          for (const g of res.goodsList || []) if ((g.certificateInfoList || []).length) mark(g.goodsId, { compliance: true })
          seen += (res.goodsList || []).length
          if (!(res.goodsList || []).length || seen >= (res.total ?? 0)) break
        }
      }],
      priceReviews: ['bg.local.goods.priceorder.query', async (call) => {
        for (let page = 1; page <= 5; page += 1) {
          const res = await call({ page, size: 50, status: AWAITING_SELLER })
          const list = res.list || res.priceOrderList || res.data || []
          for (const row of list) if (row.goodsId != null) mark(row.goodsId, { priceReview: true })
          if (list.length < 50) break
        }
      }],
    }
    await Promise.all(Object.entries(sources).map(async ([name, [method, run]]) => {
      if (!granted(shop, method)) return unavailable.push(name)
      try {
        await run((params) => temu.call(method, { access_token: token, ...params }))
      } catch {
        unavailable.push(name)
      }
    }))
    const count = (test) => Object.entries(goods).filter(([, g]) => test(g)).reduce((n, [id]) => n + (rows.get(id) || 0), 0)
    return {
      goods,
      totals: {
        restricted: count((g) => g.traffic === 'Traffic restricted'),
        low: count((g) => g.traffic === 'Low traffic'),
        compliance: count((g) => g.compliance),
        priceReview: count((g) => g.priceReview),
      },
      unavailable: unavailable.sort(),
    }
  })
  if (!out.unavailable.length) await cache.set(key, out, TTL)
  return out
}

module.exports = { signals }
