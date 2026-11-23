/** inbox: methods mixed into the service (they use `this.call` and other service methods). */
const { chatMessage } = require('./format')

module.exports = {
  async getInbox(accessToken, shop) {
    const threads = []
    let pageToken = ''
    let pages = 0
    do {
      const data = await this.call(accessToken, 'GET', '/customer_service/202309/conversations', {
        shop,
        query: { page_size: 20, ...(pageToken ? { page_token: pageToken } : {}) },
      })
      for (const row of data.conversations || []) {
        const latest = row.latest_message || {}
        const message = latest.id ? chatMessage(latest) : null
        const buyer = (row.participants || []).find((person) => String(person.role).toUpperCase() === 'BUYER')
        threads.push({
          externalThreadId: String(row.id),
          customerName: buyer?.nickname || (message?.direction === 'inbound' ? latest.sender?.nickname : '') || '',
          replyable: row.can_send_message !== false,
          status: 'open',
          lastMessageAt: message?.sentAt || new Date(),
          lastMessagePreview: String(message?.text || '').slice(0, 100),
          unreadCount: Number(row.unread_count || 0),
          messages: message ? [message] : [],
        })
      }
      pageToken = data.next_page_token || ''
      pages += 1
    } while (pageToken && pages < 5)
    return threads
  },

  /** Recent visible messages of one conversation, oldest first. Never marks read unless `markRead: true`. */
  async getThreadMessages(accessToken, shop, conversationId, { markRead = false } = {}) {
    if (markRead) {
      this.markConversationAsRead(accessToken, shop, conversationId).catch(() => {})
    }
    const messages = []
    let pageToken = ''
    let pages = 0
    do {
      const data = await this.call(accessToken, 'GET', `/customer_service/202309/conversations/${encodeURIComponent(conversationId)}/messages`, {
        shop,
        query: {
          page_size: 10,
          sort_order: 'DESC',
          sort_field: 'create_time',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      })
      messages.push(...(data.messages || []))
      pageToken = data.next_page_token || ''
      pages += 1
    } while (pageToken && pages < 2)
    return messages
      .filter((message) => message.is_visible !== false)
      .map(chatMessage)
      .sort((a, b) => a.sentAt - b.sentAt)
  },

  async markConversationAsRead(accessToken, shop, conversationId) {
    try {
      await this.call(accessToken, 'POST', `/customer_service/202309/conversations/${encodeURIComponent(conversationId)}/messages/read`, {
        shop,
        body: {},
      })
    } catch {
      // best-effort
    }
  },

  async sendMessage(accessToken, shop, conversationId, text) {
    const data = await this.call(accessToken, 'POST', `/customer_service/202309/conversations/${encodeURIComponent(conversationId)}/messages`, {
      shop,
      body: { type: 'TEXT', content: JSON.stringify({ content: String(text).slice(0, 2000) }) },
    })
    return { externalMessageId: data.message_id ? String(data.message_id) : null }
  },
}
