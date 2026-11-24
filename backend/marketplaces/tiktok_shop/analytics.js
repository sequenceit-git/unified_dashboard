/** analytics: methods mixed into the service (they use `this.call` and other service methods). */
const { dateOnly, nextDate } = require('./format')

module.exports = {
  async shopPerformance(accessToken, opts = {}) {
    return (await this.shopPerformanceData(accessToken, opts)).intervals
  },

  /** Daily shop performance (sales, channels, traffic) and the last date TikTok has data for. */
  async shopPerformanceData(accessToken, { shop, from, to } = {}) {
    const data = await this.call(accessToken, 'GET', '/analytics/202509/shop/performance', {
      shop,
      query: {
        start_date_ge: dateOnly(from),
        end_date_lt: nextDate(to),
        granularity: '1D',
        currency: 'USD',
      },
    })
    return { intervals: data.performance?.intervals || [], latestDate: data.latest_available_date || null }
  },

  async productPerformance(accessToken, { shop, from, to, limit = 10 } = {}) {
    const query = {
      start_date_ge: dateOnly(from),
      end_date_lt: nextDate(to),
      page_size: Math.min(Number(limit) || 10, 100),
      currency: 'USD',
    }
    try {
      const data = await this.call(accessToken, 'GET', '/analytics/202509/shop_products/performance', { shop, query })
      return data.products || []
    } catch (error) {
      if (!/version|not found|404/i.test(error.message || '')) throw error
      const data = await this.call(accessToken, 'GET', '/analytics/202405/shop_products/performance', { shop, query })
      return data.products || []
    }
  },
}
