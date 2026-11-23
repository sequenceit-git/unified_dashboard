/** Generated from routes/sales/customers.js: business logic behind the routes; routes only handle HTTP. */
const { paging, sortOf } = require('../../../../utils/query')
const Conversation = require('../../../../models/Conversation')
const Customer = require('../../../../models/Customer')
const Order = require('../../../../models/Order')
const { findCustomerOrders, withOrderStats } = require('./customerStats')
const { HttpError } = require('../../../../utils/httpError')
const { shopFilter } = require('../../../../middleware/auth')

function scope(req) {
  if (req.user.role !== 'sub_admin') return {}
  return { 'identities.shopId': { $in: req.allowedShopIds } }
}

/** GET / */
async function list(ctx) {
    const filter = { ...scope(ctx) }
    const marketplace = 'ebay'
    if (marketplace) filter['identities.marketplace'] = marketplace
    const q = ctx.query.q?.trim().toLowerCase()
    const pg = paging(ctx)
    const sort = sortOf(ctx, ['lastOrderAt', 'totalSpent', 'orderCount', 'createdAt'], '-lastOrderAt')
    const sortKey = Object.keys(sort)[0]
    const direction = sort[sortKey]
    let customers = await withOrderStats(await Customer.find(filter), marketplace)
    if (q) {
      customers = customers.filter((row) =>
        [
          row.name,
          row.email,
          row.phone,
          ...(row.identities || []).flatMap((i) => [i.username, i.externalBuyerId]),
        ].some((value) => String(value || '').toLowerCase().includes(q)))
    }
    const sortValue = (row) => {
      const raw = row[sortKey]
      if (raw == null || raw === '') return null
      return sortKey === 'lastOrderAt' ? new Date(raw).getTime() : raw
    }
    customers.sort((a, b) => {
      const left = sortValue(a)
      const right = sortValue(b)
      if (left == null && right == null) return 0
      if (left == null) return 1
      if (right == null) return -1
      if (left > right) return direction
      if (left < right) return -direction
      return 0
    })
    const total = customers.length
    return {
      data: customers.slice(pg.skip, pg.skip + pg.limit),
      page: pg.page,
      limit: pg.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pg.limit)),
    }
}

/** GET /:id */
async function get(ctx) {
    const customer = await Customer.findOne({ _id: ctx.params.id, ...scope(ctx) })
    if (!customer) throw new HttpError(404, { error: 'Not found' })
    const marketplace = 'ebay'
    const [orders, conversations, [stats]] = await Promise.all([
      findCustomerOrders([customer], marketplace, { extraFilter: shopFilter(ctx, Order), limit: 50 }),
      Conversation.find({ customerId: customer._id, ...shopFilter(ctx, Conversation) }).sort({ lastMessageAt: -1 }).limit(20),
      withOrderStats([customer], marketplace),
    ])
    return { ...stats, orders, conversations }
}

/** PATCH /:id */
async function update(ctx) {
    const { name, email, phone, address } = ctx.body
    const doc = await Customer.findOne({ _id: ctx.params.id, ...scope(ctx) })
    if (!doc) throw new HttpError(404, { error: 'Not found' })
    if (name !== undefined) doc.name = name
    if (email !== undefined) doc.email = email
    if (phone !== undefined) doc.phone = phone
    if (address !== undefined) {
      // Assign on the document and save so subdocument PII setters encrypt address fields.
      doc.address = address
      doc.addresses = [address]
    }
    await doc.save()
    return doc
}

module.exports = { list, get, update }
