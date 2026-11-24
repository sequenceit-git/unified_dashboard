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
    { id: 'analytics', label: 'Analytics', path: '/temu/analytics', route: 'analytics', needs: 'Order Management', probe: temuOrders },
    { id: 'goods', label: 'Goods', path: '/temu/goods', route: 'products', needs: 'Product Management', probe: temuGoods },
    { id: 'inventory', label: 'Inventory', path: '/temu/inventory', route: 'inventory', needs: 'Product Management', probe: temuGoods },
    { id: 'orders', label: 'Orders', path: '/temu/orders', route: 'orders', needs: 'bg.order.list.v2.get', probe: temuOrders },
    { id: 'shipping', label: 'Shipping', path: '/temu/shipping', route: 'orders', needs: 'bg.logistics.warehouse.list.get', probe: temuShipping },
    { id: 'after-sales', label: 'Returns & refunds', path: '/temu/after-sales', route: 'orders', needs: 'bg.aftersales.parentaftersales.list.get', probe: temuReturns },
    { id: 'price-reviews', label: 'Price reviews', path: '/temu/price-reviews', route: 'products', needs: 'bg.local.goods.priceorder.query', probe: temuPriceOrders },
    { id: 'promotions', label: 'Promotions', path: '/temu/promotions', route: 'products', needs: 'bg.promotion.activity.query', probe: temuPromotions },
    { id: 'ads', label: 'Ads', path: '/temu/ads', route: 'analytics', needs: 'Temu Ads switched on in Seller Center', hideWhenUnavailable: true, probe: temuAds },
    { id: 'customers', label: 'Customers', path: '/temu/customers', route: 'customers', needs: 'bg.order.list.v2.get', probe: temuOrders },
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
    directIntro: 'New goods go to Temu for review before they are on sale.',
  },
  listingActions: [
    { id: 'unpublish', label: 'Take off sale', confirm: 'Take this goods off sale on Temu?', statuses: ['live', 'out_of_stock'] },
    { id: 'publish', label: 'Put on sale', confirm: 'Put this goods on sale on Temu?', statuses: ['paused'] },
  ],
}
