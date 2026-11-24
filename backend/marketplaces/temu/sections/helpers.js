/** Temu value formatting shared by the section files. */
const temu = require('../service')

const AFTERSALES_GROUP = {
  1: 'Pending',
  2: 'Requested',
  3: 'Package shipped',
  4: 'Platform reviewing',
  5: 'Refunded',
  6: 'Rejected',
  7: 'Cancelled',
}

function temuTime(value) {
  const n = Number(value)
  if (!n) return null
  return new Date(n > 1e12 ? n : n * 1000).toISOString()
}

function temuAmount(price, currency = 'USD') {
  if (price == null || price === '') return null
  if (typeof price === 'object') {
    const value = Number(price.amount)
    return Number.isFinite(value) ? { value, currency: price.currency || currency } : null
  }
  const value = Number(price)
  return Number.isFinite(value) ? { value, currency } : null
}

function temuGoodsRows(result) {
  const goods = result.goodsList || result.pageItems || result.list || []
  const rows = []
  for (const good of goods) {
    const skus = good.skuList || good.skuInfoList || [good]
    for (const sku of skus) {
      rows.push({
        goods: good.goodsName || sku.goodsName || 'Temu goods',
        sku: sku.outSkuSn || sku.outGoodsSn || good.outGoodsSn || String(sku.skuId || good.goodsId || ''),
        price: temuAmount(sku.retailPrice || sku.price || good.price, good.currency),
        listPrice: temuAmount(sku.listPrice || good.listPrice, good.currency),
        stock: Number(sku.quantity || sku.stock || good.quantity || 0),
      })
    }
  }
  return rows
}

/** parentAfterSalesStatus (Temu Return and Refund Guide). */
const TEMU_AFTERSALES_STATUS = {
  1: 'Requested',
  2: 'Package shipped',
  3: 'Pending: return received',
  4: 'Refund processing',
  5: 'Refunded',
  6: 'Cancelled by buyer',
  7: 'Rejected',
  8: 'Pending: return label',
  9: 'Refund processing',
  10: 'Return requested',
  11: 'Platform reviewing',
}

/** Ad report values are `{ val }` objects. */
const adVal = (field) => {
  const value = field && typeof field === 'object' ? field.val : field
  const n = Number(value)
  return value == null || value === '' || !Number.isFinite(n) ? null : n
}
const adMoney = (field) => {
  const n = adVal(field)
  return n == null ? null : { value: n, currency: 'USD' }
}

/** The ads report's timestamp unit isn't documented: try milliseconds, then seconds. */
async function temuAdReport(token, days) {
  const end = Date.now()
  const start = end - days * 24 * 3600 * 1000
  try {
    return await temu.call('temu.searchrec.ad.reports.mall.query', { access_token: token, startTs: start, endTs: end })
  } catch (err) {
    if (String(err.code) !== '230012000') throw err
    return temu.call('temu.searchrec.ad.reports.mall.query', {
      access_token: token,
      startTs: Math.floor(start / 1000),
      endTs: Math.floor(end / 1000),
    })
  }
}

/**
 * Wraps a table loader for one Temu API method: when the shop's granted methods are known and this
 * one isn't among them, says how to enable it instead of calling Temu. Shops without a recorded
 * list (connected before it was stored) are not blocked.
 */
function grantAware(shop, method, load) {
  return async (...args) => {
    const granted = shop?.grantedScopes
    if (Array.isArray(granted) && granted.length && !granted.includes(method)) {
      throw new Error(`This needs "${method}" enabled for the app in the Temu partner account, then reconnect the shop in Settings.`)
    }
    return load(...args)
  }
}

module.exports = {
  grantAware, AFTERSALES_GROUP, temuTime, temuAmount, temuGoodsRows, TEMU_AFTERSALES_STATUS, adVal, adMoney, temuAdReport }
