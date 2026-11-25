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

module.exports = { conversationQuery }
