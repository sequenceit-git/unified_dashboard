/**
 * The Temu health check: one read-only call per dashboard feature, with the parameters the pages
 * use (Temu US). `params(ctx)` may use earlier results (`ctx.goodsId`, `ctx.skuId`, `ctx.catId`).
 */
const now = () => Math.floor(Date.now() / 1000)

const CHECKS = [
  { feature: 'Connection', method: 'bg.open.accesstoken.info.get', params: () => ({}) },
  { feature: 'Goods & listing', method: 'bg.local.goods.list.query', params: () => ({ pageNo: 1, pageSize: 10, goodsSearchType: 1 }), keep: (r, ctx) => { const g = (r.goodsList || [])[0]; if (g) ctx.goodsId = g.goodsId } },
  { feature: 'Goods & listing', method: 'bg.local.goods.cats.get', params: () => ({}), keep: (r, ctx) => { ctx.topCatId = (r.goodsCatsList || [])[0]?.catId } },
  { feature: 'Goods & listing', method: 'bg.freight.template.list.query', params: () => ({}) },
  { feature: 'Goods & listing', method: 'bg.local.goods.detail.query', params: (ctx) => (ctx.goodsId ? { goodsId: Number(ctx.goodsId) } : null), keep: (r, ctx) => { ctx.catId = r.catId } },
  { feature: 'Goods & listing', method: 'bg.local.goods.template.get', params: (ctx) => (ctx.catId ? { catId: Number(ctx.catId) } : null) },
  { feature: 'Inventory', method: 'bg.local.goods.sku.list.query', params: () => ({ pageNo: 1, pageSize: 10, skuSearchType: 'ALL' }), keep: (r, ctx) => { const s = (r.skuList || [])[0]; if (s) { ctx.skuId = s.skuId; ctx.goodsId = ctx.goodsId || s.goodsId } } },
  { feature: 'Inventory', method: 'temu.local.goods.sku.stock.query', params: (ctx) => (ctx.goodsId ? { goodsId: Number(ctx.goodsId) } : null) },
  { feature: 'Orders', method: 'bg.order.list.v2.get', params: () => ({ pageNumber: 1, pageSize: 10, parentOrderStatus: 0, regionId: 211 }) },
  { feature: 'Orders', method: 'bg.order.combinedshipment.list.get', params: () => ({}) },
  { feature: 'Shipping & labels', method: 'bg.logistics.warehouse.list.get', params: () => ({ returnEnableBuyShippingLabelOnly: true }) },
  { feature: 'Shipping & labels', method: 'temu.logistics.label.list.get', params: () => ({ createAtStart: now() - 30 * 86400, createAtEnd: now(), pageNumber: 1, pageSize: 10 }) },
  { feature: 'Shipping & labels', method: 'temu.logistics.shiplogisticstype.get', params: () => ({ regionId: 211 }) },
  { feature: 'Returns & refunds', method: 'bg.aftersales.parentaftersales.list.get', params: () => ({ pageNo: 1, pageSize: 10, createAtStart: now() - 90 * 86400, createAtEnd: now() }) },
  { feature: 'Returns & refunds', method: 'temu.aftersales.carrier.get', params: () => ({ returnWarehouseRegionId1: 211 }) },
  { feature: 'Price reviews', method: 'bg.local.goods.priceorder.query', params: () => ({ page: 1, size: 10 }) },
  { feature: 'Price reviews', method: 'temu.local.goods.recommendedprice.query', params: (ctx) => (ctx.goodsId ? { goodsIdList: [Number(ctx.goodsId)] } : null) },
  { feature: 'Promotions', method: 'bg.promotion.activity.query', params: () => ({ pageNumber: 1, pageSize: 10, activityType: 2 }) },
  { feature: 'Ads', method: 'temu.searchrec.ad.reports.mall.query', params: () => ({ startTs: (now() - 30 * 86400) * 1000, endTs: now() * 1000 }) },
  { feature: 'Analytics', method: 'temu.local.goods.list.retrieve', params: () => ({ pageSize: 10 }) },
  { feature: 'Analytics', method: 'temu.local.mall.tags.get', params: () => ({}) },
  { feature: 'Compliance', method: 'bg.local.compliance.goods.list.query', params: () => ({ pageNo: 1, pageSize: 10 }) },
]

module.exports = { CHECKS }
