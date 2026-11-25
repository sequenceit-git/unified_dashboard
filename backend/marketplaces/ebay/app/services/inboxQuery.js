/**
 * The eBay inbox list's filter and order from the page's query: `type` buyers (default view),
 * notices, all, or unread (buyer messages with something unread); `status` open / closed / all.
 * Unread conversations come first, then the newest.
 */
function conversationQuery(query = {}) {
  const filter = {}
  if (query.status && query.status !== 'all') filter.status = query.status
  if (query.type === 'buyers' || query.type === 'unread') filter.replyable = { $ne: false }
  if (query.type === 'notices') filter.replyable = false
  if (query.type === 'unread') filter.unreadCount = { $gt: 0 }
  return { filter, sort: { unreadCount: -1, lastMessageAt: -1 } }
}

/**
 * The order a thread is about, for the item card: the conversation's own order when it has one,
 * else the buyer's latest order in that shop (sync doesn't link conversations to orders).
 */
async function threadOrder(convo) {
  if (convo?.orderId && typeof convo.orderId === 'object' && convo.orderId.externalOrderId) return convo.orderId
  const customerId = convo?.customerId?._id || convo?.customerId
  if (!customerId || !convo?.shopId) return null
  const Order = require('../../../../models/Order')
  return Order.findOne({ shopId: convo.shopId, customerId }).sort({ placedAt: -1 }).select('externalOrderId status items totals placedAt').lean()
}

module.exports = { conversationQuery, threadOrder }
