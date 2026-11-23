/** promotions: methods mixed into the service (they use `this.call` and other service methods). */


module.exports = {
  /**
   * Creates a discount activity on TikTok Shop
   */
  async createPromotion(accessToken, { name, title, activityType = 'DIRECT_DISCOUNT', percentageOff = 10, productLevel = 'PRODUCT', listingIds = [], startDate, endDate, beginTime, endTime, shop } = {}) {
    const percent = Math.round(Number(percentageOff || 10))
    if (!(percent >= 1 && percent <= 90)) {
      throw new Error('TikTok Shop discount percentage must be between 1% and 90%.')
    }
    const level = productLevel || 'PRODUCT'
    const productIds = [...new Set(
      (listingIds || []).map((id) => String(id || '').split(':')[0].trim()).filter(Boolean),
    )].slice(0, 300)
    if (level === 'PRODUCT' && !productIds.length) {
      throw new Error('TikTok Shop needs at least one live product to include in a promotion. Sync listings or enter TikTok product IDs first.')
    }
    const now = Math.floor(Date.now() / 1000)
    const rawStart = beginTime ? Math.floor(new Date(beginTime).getTime() / 1000) : startDate ? Math.floor(new Date(startDate).getTime() / 1000) : now + 120
    const start = Math.max(now + 60, rawStart)
    const rawEnd = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : endDate ? Math.floor(new Date(endDate).getTime() / 1000) : start + 14 * 86400
    const end = Math.max(start + 600, rawEnd)

    const stamp = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    const body = {
      activity_type: activityType || 'DIRECT_DISCOUNT',
      duration_type: 'NORMAL',
      title: String(title || name || `Sale ${stamp}`).slice(0, 50),
      begin_time: start,
      end_time: end,
      product_level: level,
    }
    const created = await this.call(accessToken, 'POST', '/promotion/202309/activities', { shop, body })
    const activityId = created.activity_id
    if (activityId && productIds.length) {
      try {
        await this.call(accessToken, 'PUT', `/promotion/202309/activities/${encodeURIComponent(activityId)}/products`, {
          shop,
          body: {
            activity_id: String(activityId),
            products: productIds.map((id) => ({
              id,
              discount: String(percent),
              quantity_limit: -1,
              quantity_per_user: -1,
              skus: [],
            })),
          },
        })
      } catch (err) {
        await this.deactivatePromotion(accessToken, activityId, { shop }).catch(() => {})
        throw err
      }
    }
    return created
  },

  /**
   * Deactivates an active promotion on TikTok Shop
   */
  async deactivatePromotion(accessToken, activityId, { shop } = {}) {
    return this.call(accessToken, 'POST', `/promotion/202309/activities/${encodeURIComponent(activityId)}/deactivate`, {
      shop,
      body: {},
    })
  },

  /**
   * Pauses / deactivates promotion (unified interface with eBay)
   */
  async pausePromotion(accessToken, promotionId, options = {}) {
    return this.deactivatePromotion(accessToken, promotionId, options)
  },
}
