/**
 * Temu "price-reviews" section: Temu's price guide per listed SKU (current supplier price vs
 * Temu's recommended price), then the price reviews and current goods prices.
 */
const temu = require('../service')
const Listing = require('../../../models/Listing')
const Product = require('../../../models/Product')
const { words, col, tables, firstList } = require('../../../services/marketplace/sectionKit')
const { temuAmount, temuGoodsRows, grantAware } = require('./helpers')

const GOODS_PER_CALL = 20

/** Current and recommended price for every SKU the shop lists on Temu ("<goodsId>:<skuId>"). */
/**
 * Every SKU Temu has for the shop (up to 20 pages of 100): Temu's newer SKU list
 * (temu.local.sku.list.retrieve, token paging) when the app has it, else the older one.
 */
async function allTemuSkus(token, shop, { withPrice = false } = {}) {
  const granted = Array.isArray(shop?.grantedScopes) && shop.grantedScopes.length ? shop.grantedScopes : null
  // The older SKU list carries each SKU's price; it's used when the price itself is needed from it.
  if (!withPrice && (!granted || granted.includes('temu.local.sku.list.retrieve'))) {
    try {
      const all = []
      let pageToken = ''
      for (let page = 0; page < 20; page += 1) {
        const res = await temu.call('temu.local.sku.list.retrieve', { access_token: token, pageSize: 100, ...(pageToken ? { pageToken } : {}) })
        all.push(...(res.skuList || []))
        pageToken = res.pagination?.nextToken || ''
        if (!pageToken || !(res.skuList || []).length) break
      }
      return all
    } catch {
      // Not available for this app or site: the older list below.
    }
  }
  const all = []
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const res = await temu.call('bg.local.goods.sku.list.query', { access_token: token, pageNo, pageSize: 100, skuSearchType: 'ALL' })
    all.push(...(res.skuList || []))
    if (!(res.skuList || []).length || all.length >= (res.total ?? all.length)) break
  }
  return all
}

async function priceGuide(token, shop) {
  const listings = (await Listing.find({ shopId: shop?._id, marketplace: 'temu', externalListingId: /^\d+:\d+$/ }).select('externalListingId productId').lean())
    .map((l) => { const [goodsId, skuId] = String(l.externalListingId).split(':'); return { goodsId, skuId, productId: String(l.productId) } })
  const titles = new Map((await Product.find({ _id: { $in: [...new Set(listings.map((l) => l.productId))] } }).select('title').lean()).map((p) => [String(p._id), p.title]))
  const listingBySku = new Map(listings.map((l) => [l.skuId, l]))
  // Temu US doesn't offer the SKU price query: then your price comes from the SKU list itself.
  const granted = Array.isArray(shop?.grantedScopes) && shop.grantedScopes.length ? shop.grantedScopes : null
  const priceQuery = !granted || granted.includes('bg.local.goods.sku.list.price.query')
  // Every SKU Temu has for the shop (Seller Center additions too), not only the dashboard's listings.
  const temuSkus = await allTemuSkus(token, shop, { withPrice: !priceQuery })
  const listedPrice = new Map(temuSkus.filter((s) => s.price != null && s.price !== '').map((s) => [String(s.skuId), temuAmount(s.price, s.currency)]))
  const skus = (temuSkus.length ? temuSkus.map((s) => ({ goodsId: String(s.goodsId), skuId: String(s.skuId) })) : listings)
    .map((s) => ({ ...s, productId: listingBySku.get(s.skuId)?.productId }))
  const goods = new Map()
  for (const l of skus) goods.set(l.goodsId, [...(goods.get(l.goodsId) || []), l])
  const ids = [...goods.keys()]
  const current = new Map()
  const recommended = new Map()
  for (let i = 0; i < ids.length; i += GOODS_PER_CALL) {
    const batch = ids.slice(i, i + GOODS_PER_CALL)
    const [now, rec] = await Promise.all([
      priceQuery
        ? temu.call('bg.local.goods.sku.list.price.query', { access_token: token, querySupplierPriceBaseList: batch.map((g) => ({ goodsId: Number(g), skuIdList: goods.get(g).map((l) => Number(l.skuId)) })) })
        : {},
      temu.call('temu.local.goods.recommendedprice.query', { access_token: token, goodsIdList: batch.map(Number) }),
    ])
    for (const g of now.openapiGoodsSupplierPriceDTOList || []) for (const k of g.openapiSkuSupplierPriceDTOList || []) current.set(String(k.skuId), temuAmount(k.supplierPrice))
    for (const g of rec.goodsList || []) for (const k of g.skuList || []) recommended.set(String(k.skuId), temuAmount(k.recommendedSupplyPrice))
  }
  return skus
    .map((l) => {
      const now = current.get(l.skuId) || listedPrice.get(l.skuId) || null
      const rec = recommended.get(l.skuId) || null
      const difference = now && rec?.value ? Math.round(((now.value - rec.value) / rec.value) * 1000) / 10 : null
      return { id: l.skuId, goodsId: l.goodsId, skuId: l.skuId, product: titles.get(l.productId) || '', current: now, recommended: rec, difference }
    })
    .sort((a, b) => (b.difference ?? -Infinity) - (a.difference ?? -Infinity))
}

async function prices(token, shop) {
  const list = await tables([
    {
      id: 'pricing',
      tab: 'Price guide',
      title: "Your price vs Temu's recommended price",
      note: "SKUs priced above Temu's recommendation come first: they are the ones a price review is most likely to reject.",
      columns: [col('product', 'Product'), col('goodsId', 'Goods'), col('skuId', 'SKU'), col('current', 'Your supplier price', 'money'), col('recommended', 'Temu recommends', 'money'), col('difference', 'Difference %', 'number')],
      load: grantAware(shop, 'temu.local.goods.recommendedprice.query', () => priceGuide(token, shop)),
    },
    {
      id: 'reviews',
      tab: 'Price reviews',
      title: 'Price reviews',
      columns: [col('id', 'Price order'), col('goodsId', 'Goods'), col('status', 'Status', 'status'), col('price', 'Price', 'money')],
      load: async () => firstList(await temu.call('bg.local.goods.priceorder.query', { access_token: token, page: 1, size: 50 })).map((row) => ({
        id: row.priceOrderId || row.id,
        goodsId: row.goodsId,
        status: words(row.priceOrderStatus || row.status || row.orderStatus),
        price: temuAmount(row.supplierPrice || row.suggestSupplyPrice || row.price, row.currency),
      })),
    },
    {
      id: 'catalog',
      tab: 'Price reviews',
      title: 'Current goods prices',
      columns: [col('goods', 'Goods'), col('sku', 'SKU'), col('price', 'Price', 'money'), col('listPrice', 'List price', 'money'), col('stock', 'Stock', 'number')],
      load: async () => temuGoodsRows(await temu.call('bg.local.goods.list.query', {
        access_token: token,
        pageNo: 1,
        pageSize: 50,
        goodsSearchType: 1,
        orderField: 'price',
        orderType: 0,
      })),
    },
  ])
  return {
    summary: [
      { tab: 'Price guide', label: 'Priced above Temu', value: list[0].rows.filter((r) => r.difference > 0).length, type: 'number' },
      { tab: 'Price reviews', label: 'Price reviews', value: list[1].rows.length, type: 'number' },
      { tab: 'Price reviews', label: 'Goods', value: list[2].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = prices
