/** Temu in the dashboard: sidebar sections (each with a read-only access probe), statuses, product form. */
const temu = require('./service')

const temuGoods = (token) => temu.call('bg.local.goods.list.query', { access_token: token, pageNo: 1, pageSize: 1, goodsSearchType: 1 })
const temuOrders = (token) => temu.call('bg.order.list.v2.get', { access_token: token, pageNumber: 1, pageSize: 1, parentOrderStatus: 0, regionId: 211 })
const temuPriceOrders = (token) => temu.call('bg.local.goods.priceorder.query', { access_token: token, page: 1, size: 1 })
const temuPromotions = (token) => temu.call('bg.promotion.activity.query', { access_token: token, pageNumber: 1, pageSize: 1 })
const temuAds = (token) => {
  const end = Date.now()
  return temu.call('temu.searchrec.ad.reports.mall.query', { access_token: token, startTs: end - 24 * 3600 * 1000, endTs: end })
    .catch((err) => {
      if (String(err.code) !== '230012000') throw err
      return temu.call('temu.searchrec.ad.reports.mall.query', { access_token: token, startTs: Math.floor(end / 1000) - 24 * 3600, endTs: Math.floor(end / 1000) })
    })
}
const temuShipping = (token) => temu.call('bg.logistics.warehouse.list.get', { access_token: token })
const temuReturns = (token) => {
  const end = Math.floor(Date.now() / 1000)
  return temu.call('bg.aftersales.parentaftersales.list.get', {
    access_token: token,
    pageNo: 1,
    pageSize: 1,
    createAtStart: end - 7 * 24 * 3600,
    createAtEnd: end,
  })
}

/**
 * `route` is the permission a sub-admin needs (Settings > Sub-admins); `path` is the page.
 * `needs` names the API or scope, shown when the section is unavailable.
 */

module.exports = {
  label: 'Temu Shop',
  sections: [
    { id: 'analytics', label: 'Analytics', path: '/analytics', route: 'analytics', needs: 'Order Management', probe: temuOrders },
    { id: 'products', label: 'Goods', path: '/products', route: 'products', needs: 'Product Management', probe: temuGoods },
    { id: 'inventory', label: 'Inventory', path: '/inventory', route: 'inventory', needs: 'Product Management', probe: temuGoods },
    { id: 'orders', label: 'Orders', path: '/orders', route: 'orders', needs: 'bg.order.list.v2.get', probe: temuOrders },
    { id: 'fulfillment', label: 'Shipping', path: '/shop/fulfillment', route: 'orders', needs: 'bg.logistics.warehouse.list.get', probe: temuShipping },
    { id: 'returns', label: 'Returns & refunds', path: '/shop/returns', route: 'orders', needs: 'bg.aftersales.parentaftersales.list.get', probe: temuReturns },
    { id: 'prices', label: 'Price reviews', path: '/shop/prices', route: 'products', needs: 'bg.local.goods.priceorder.query', probe: temuPriceOrders },
    { id: 'promotions', label: 'Promotions', path: '/shop/promotions', route: 'products', needs: 'bg.promotion.activity.query', probe: temuPromotions },
    { id: 'ads', label: 'Ads', path: '/shop/ads', route: 'analytics', needs: 'temu.searchrec.ad.reports.mall.query', probe: temuAds },
    { id: 'customers', label: 'Customers', path: '/customers', route: 'customers', needs: 'bg.order.list.v2.get', probe: temuOrders },
  ],
  statuses: {
    live: { label: 'On sale', color: 'green' },
    out_of_stock: { label: 'Sold out', color: 'yellow' },
    pending: { label: 'Under review', color: 'blue' },
    paused: { label: 'Off sale', color: 'gray' },
    ended: { label: 'Removed', color: 'gray' },
    error: { label: 'Rejected', color: 'red' },
  },
  rawStatuses: {},
  productForm: {
    titleMax: 250,
    maxImages: 10,
    condition: false,
    specifics: null,
    packageDetails: { required: false, note: '' },
    productStatus: { draft: 'Draft', active: 'Ready', archived: 'Archived' },
    listAction: 'List on Temu',
    directIntro: 'Save goods to the catalog. New Temu goods are still created in Seller Center, then synced here.',
  },
  listingActions: [
    { id: 'unpublish', label: 'Take off sale', confirm: 'Take this goods off sale on Temu?', statuses: ['live', 'out_of_stock'] },
    { id: 'publish', label: 'Put on sale', confirm: 'Put this goods on sale on Temu?', statuses: ['paused'] },
  ],
}
