const Customer = require('../../models/Customer')
const Order = require('../../models/Order')
const { canonical: canonicalMarketplace } = require('../../marketplaces')

function buyerKeys(customer) {
  const keys = new Set()
  if (customer.name) keys.add(customer.name)
  for (const identity of customer.identities || []) {
    if (identity.username) keys.add(identity.username)
    if (identity.externalBuyerId) keys.add(identity.externalBuyerId)
  }
  return keys
}

function orderMatch(list, marketplace) {
  const shopIds = list.flatMap((customer) => (customer.identities || [])
    .filter((identity) => !marketplace || (canonicalMarketplace(identity.marketplace) || identity.marketplace) === marketplace)
    .map((identity) => identity.shopId)
    .filter(Boolean))
  // Query only unencrypted, indexed fields; encrypted buyer fields are matched after decrypt getters run.
  const buyerMatch = [
    { customerId: { $in: list.map((customer) => customer._id) } },
    { customerId: null },
  ]
  const shopMatch = []
  if (marketplace) shopMatch.push({ marketplace })
  if (shopIds.length) shopMatch.push({ shopId: { $in: shopIds } })
  return {
    status: { $nin: ['cancelled', 'refunded'] },
    $and: [
      { $or: buyerMatch },
      ...(shopMatch.length ? [{ $or: shopMatch }] : []),
    ],
  }
}

function customerMatchesOrder(customer, order) {
  if (order.customerId && String(order.customerId) === String(customer._id)) return true
  if (order.customerId != null) return false
  const keys = buyerKeys(customer)
  const lowerEmail = customer.email ? String(customer.email).toLowerCase() : ''
  const orderEmail = order.buyer?.email ? String(order.buyer.email).toLowerCase() : ''
  return Boolean(
    (order.buyer?.name && keys.has(order.buyer.name))
    || (order.buyer?.username && keys.has(order.buyer.username))
    || (lowerEmail && orderEmail && lowerEmail === orderEmail),
  )
}

async function findCustomerOrders(list, marketplace, { extraFilter = null, select = '', limit = 0 } = {}) {
  if (!list.length) return []
  const filter = orderMatch(list, marketplace)
  if (extraFilter && Object.keys(extraFilter).length) {
    filter.$and.push(extraFilter)
  }
  let query = Order.find(filter).sort({ placedAt: -1 })
  if (select) query = query.select(select)
  const candidates = await query
  const matched = candidates.filter((order) => list.some((customer) => customerMatchesOrder(customer, order)))
  return limit > 0 ? matched.slice(0, limit) : matched
}

function orderAmount(order) {
  const total = Number(order.totals?.total)
  if (total) return total
  return (order.items || []).reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0), 0)
}

async function withOrderStats(customers, marketplace) {
  const list = customers.map((customer) => (customer.toObject ? customer.toObject() : customer))
  if (!list.length) return list

  const orders = await findCustomerOrders(list, marketplace, {
    select: 'customerId buyer.name buyer.username buyer.email buyer.phone shippingAddress totals.total items placedAt',
  })
  const stats = new Map()
  for (const order of orders) {
    const customer = list.find((item) => customerMatchesOrder(item, order))
    if (!customer) continue
    const key = String(customer._id)
    const row = stats.get(key) || {
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      email: null,
      phone: null,
      address: null,
    }
    row.orderCount += 1
    row.totalSpent += orderAmount(order)
    const placed = order.placedAt ? new Date(order.placedAt) : null
    if (placed && (!row.lastOrderAt || placed > row.lastOrderAt)) row.lastOrderAt = placed
    if (!row.email && order.buyer?.email) row.email = order.buyer.email
    if (!row.phone && (order.buyer?.phone || order.shippingAddress?.phone)) {
      row.phone = order.buyer?.phone || order.shippingAddress?.phone
    }
    if (!row.address && order.shippingAddress?.city) row.address = order.shippingAddress
    stats.set(key, row)
  }

  return list.map((customer) => {
    const row = stats.get(String(customer._id)) || { orderCount: 0, totalSpent: 0, lastOrderAt: null }
    const buyerUsername =
      (customer.identities || []).find((i) => i.marketplace === 'ebay')?.username ||
      customer.identities?.[0]?.username ||
      customer.identities?.[0]?.externalBuyerId ||
      (!customer.name?.includes(' ') ? customer.name : '')

    const isEbay = marketplace === 'ebay' || (customer.identities || []).some((i) => i.marketplace === 'ebay')
    const fallbackEmail = isEbay && buyerUsername ? `${buyerUsername.toLowerCase()}@members.ebay.com` : null

    const resolvedEmail = customer.email || row.email || fallbackEmail || ''
    const resolvedPhone = customer.phone || row.phone || ''
    const resolvedAddress = customer.address || row.address || null

    return {
      ...customer,
      email: resolvedEmail,
      phone: resolvedPhone,
      address: resolvedAddress,
      orderCount: row.orderCount,
      totalSpent: Math.round(row.totalSpent * 100) / 100,
      lastOrderAt: row.lastOrderAt,
    }
  })
}

async function saveCustomerStats(customerIds) {
  const ids = [...new Set(customerIds.filter(Boolean).map((id) => String(id)))]
  if (!ids.length) return
  const customers = await Customer.find({ _id: { $in: ids } })
  const stats = await withOrderStats(customers)
  await Promise.all(stats.map((customer) => Customer.updateOne(
    { _id: customer._id },
    { orderCount: customer.orderCount, totalSpent: customer.totalSpent, lastOrderAt: customer.lastOrderAt },
  )))
}

module.exports = { buyerKeys, orderMatch, findCustomerOrders, withOrderStats, saveCustomerStats }
