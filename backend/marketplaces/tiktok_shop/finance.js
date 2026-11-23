/** finance: methods mixed into the service (they use `this.call` and other service methods). */


module.exports = {
  /**
   * Retrieves recent settlement statements from TikTok Shop Finance API.
   */
  async getFinances(accessToken, { shop, limit = 50 } = {}) {
    const data = await this.call(accessToken, 'GET', '/finance/202309/statements', {
      shop,
      query: { page_size: Math.min(Number(limit) || 50, 100), sort_field: 'statement_time', sort_order: 'DESC' },
    })
    const transactions = (data.statements || []).map((row) => ({
      id: row.id,
      date: row.statement_time ? new Date(Number(row.statement_time) * 1000).toISOString() : null,
      revenue: Number(row.revenue_amount || 0),
      fee: Number(row.fee_amount || 0),
      settlement: Number(row.settlement_amount || 0),
      currency: row.currency || 'USD',
      status: row.payment_status || '',
    }))
    return { transactions, total: transactions.length }
  },
}
