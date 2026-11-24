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
async function priceGuide(token, shop) {
  const listings = (await Listing.find({ shopId: shop?._id, marketplace: 'temu', externalListingId: /^\d+:\d+$/ }).select('externalListingId productId').lean())
    .map((l) => { const [goodsId, skuId] = String(l.externalListingId).split(':'); return { goodsId, skuId, productId: String(l.productId) } })
  const titles = new Map((await Product.find({ _id: { $in: [...new Set(listings.map((l) => l.productId))] } }).select('title').lean()).map((p) => [String(p._id), p.title]))
  const goods = new Map()
  for (const l of listings) goods.set(l.goodsId, [...(goods.get(l.goodsId) || []), l])
  const ids = [...goods.keys()]
  const current = new Map()
  const recommended = new Map()
  for (let i = 0; i < ids.length; i += GOODS_PER_CALL) {
    const batch = ids.slice(i, i + GOODS_PER_CALL)
    const [now, rec] = await Promise.all([
      temu.call('bg.local.goods.sku.list.price.query', { access_token: token, querySupplierPriceBaseList: batch.map((g) => ({ goodsId: Number(g), skuIdList: goods.get(g).map((l) => Number(l.skuId)) })) }),
      temu.call('temu.local.goods.recommendedprice.query', { access_token: token, goodsIdList: batch.map(Number) }),
    ])
    for (const g of now.openapiGoodsSupplierPriceDTOList || []) for (const k of g.openapiSkuSupplierPriceDTOList || []) current.set(String(k.skuId), temuAmount(k.supplierPrice))
    for (const g of rec.goodsList || []) for (const k of g.skuList || []) recommended.set(String(k.skuId), temuAmount(k.recommendedSupplyPrice))
  }
  return listings
    .map((l) => {
      const now = current.get(l.skuId) || null
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
      load: grantAware(shop, 'bg.local.goods.sku.list.price.query', grantAware(shop, 'temu.local.goods.recommendedprice.query', () => priceGuide(token, shop))),
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
