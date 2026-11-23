/** finance: methods mixed into the service (they use `this.call` and other service methods). */
const config = require('./config')

module.exports = {
  /**
   * Retrieves financial transactions and fee data from eBay Sell Finances API
   */
  async getFinances(accessToken, { limit = 20 } = {}) {
    // Finances is served from apiz.ebay.com (apiz.sandbox.ebay.com in the sandbox).
    const host = config.environment === 'SANDBOX' ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com'
    const response = await fetch(`${host}/sell/finances/v1/transaction?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(`eBay Finances Error: ${data.errors?.[0]?.message || response.statusText}`)
      error.status = response.status
      throw error
    }
    return {
      transactions: data.transactions || [],
      total: data.total || 0,
    }
  },
}
