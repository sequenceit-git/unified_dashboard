/** inbox: methods mixed into the service (they use `this.call` and other service methods). */
const { htmlToText } = require('./format')

module.exports = {
  /**
   * Returns `{ threads, accountUsername }`. eBay messages carry usernames only, so the seller is
   * the username that appears in most member conversations.
   */
  async getInbox(accessToken, shop = {}) {
    const rows = []
    for (const conversationType of ['FROM_MEMBERS', 'FROM_EBAY']) {
      const limit = conversationType === 'FROM_MEMBERS' ? '50' : '25'
      const params = new URLSearchParams({ conversation_type: conversationType, limit, offset: '0' })
      const data = await this.ebayJson(accessToken, `/commerce/message/v1/conversation?${params}`)
      for (const row of data.conversations || []) rows.push({ row, conversationType })
    }

    const counts = {}
    for (const { row, conversationType } of rows) {
      if (conversationType !== 'FROM_MEMBERS') continue
      const latest = row.latestMessage || {}
      for (const name of new Set([latest.senderUsername, latest.recipientUsername].filter(Boolean))) {
        counts[name] = (counts[name] || 0) + 1
      }
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const detected = ranked.length > 1 && ranked[0][1] > ranked[1][1] ? ranked[0][0] : null
    let accountUsername = shop.accountUsername || detected || null
    if (!accountUsername) {
      const acct = await this.getAccount(accessToken).catch(() => null)
      accountUsername = acct?.username || null
    }

    const threads = rows.map(({ row, conversationType }) => {
      const latest = row.latestMessage || {}
      const sentAt = latest.createdDate || row.createdDate || new Date().toISOString()
      const fromEbay = conversationType === 'FROM_EBAY'
      const rawBody = /<\w+[^>]*>/.test(latest.messageBody || '') ? htmlToText(latest.messageBody) : String(latest.messageBody || '')
      const text = fromEbay ? (rawBody || row.conversationTitle || '') : (latest.messageBody || '')
      const fromSeller = !fromEbay && Boolean(accountUsername) && latest.senderUsername === accountUsername
      const buyer = fromSeller ? latest.recipientUsername : latest.senderUsername
      const fallbackMsgId = `${row.conversationId}-${new Date(sentAt).getTime()}`
      return {
        externalThreadId: String(row.conversationId),
        conversationType,
        replyable: !fromEbay,
        customerName: fromEbay ? 'eBay' : buyer || row.conversationTitle || '',
        status: String(row.conversationStatus || '').toUpperCase() === 'CLOSED' ? 'closed' : 'open',
        lastMessageAt: new Date(sentAt),
        lastMessagePreview: String(fromEbay ? (row.conversationTitle || text) : text).slice(0, 100),
        unreadCount: Number(row.unreadCount || 0),
        messages: text ? [{
          externalMessageId: String(latest.messageId || fallbackMsgId),
          text: String(text),
          direction: fromSeller ? 'outbound' : 'inbound',
          senderType: fromSeller ? 'agent' : 'customer',
          sentAt: new Date(sentAt),
        }] : [],
      }
    })
    return { threads, accountUsername }
  },

  /** Recent messages of one member conversation, oldest first. */
  async getThreadMessages(accessToken, shop, conversationId, { conversationType = 'FROM_MEMBERS' } = {}) {
    const accountUsername = shop?.accountUsername
    const fromEbay = conversationType === 'FROM_EBAY'
    const params = new URLSearchParams({ conversation_type: conversationType, limit: '25', offset: '0' })
    const data = await this.ebayJson(accessToken, `/commerce/message/v1/conversation/${encodeURIComponent(conversationId)}?${params}`)
    return (data.messages || [])
      .map((message) => {
        const fromSeller = !fromEbay && Boolean(accountUsername) && message.senderUsername === accountUsername
        const body = /<\w+[^>]*>/.test(message.messageBody || '') ? htmlToText(message.messageBody) : String(message.messageBody || '')
        return {
          externalMessageId: String(message.messageId),
          text: fromEbay && message.subject && !body.startsWith(message.subject) ? `${message.subject}\n\n${body}` : body,
          direction: fromSeller ? 'outbound' : 'inbound',
          senderType: fromSeller ? 'agent' : 'customer',
          sentAt: new Date(message.createdDate || Date.now()),
        }
      })
      .sort((a, b) => a.sentAt - b.sentAt)
  },

  async sendMessage(accessToken, shop, conversationId, text) {
    const data = await this.ebayJson(accessToken, '/commerce/message/v1/send_message', {
      method: 'POST',
      body: { conversationId: String(conversationId), messageText: String(text).slice(0, 2000) },
    })
    return { externalMessageId: data.messageId ? String(data.messageId) : null }
  },
}
