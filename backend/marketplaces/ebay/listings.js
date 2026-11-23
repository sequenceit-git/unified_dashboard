/** listings: methods mixed into the service (they use `this.call` and other service methods). */
const config = require('./config')
const trading = require('./trading')
const { ebayItemId } = require('./format')

module.exports = {
  /**
   * Fetch inventory items from eBay Sell Inventory API
   */
  async getInventory(accessToken, { limit = 50, offset = 0 } = {}) {
    const response = await fetch(`${config.apiBaseUrl}/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Accept-Language': 'en-US',
      },
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Inventory API Error: ${err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || response.statusText}`)
    }

    return response.json()
  },

  /** Every active listing's id, SKU, title, price and stock in a few calls; `complete` false means pages were skipped. */
  async getListingSummaries(accessToken) {
    return trading.getActiveSummaries(accessToken)
  },

  /** Full details (description, images, category, item specifics) of one listing; null if eBay cannot return it. */
  async getListingDetail(accessToken, itemId) {
    return trading.getItem(accessToken, itemId)
  },

  /** Live listings with full details, from the Trading API (includes Seller Hub listings). */
  async getListings(accessToken) {
    return trading.getActiveListings(accessToken)
  },

  /**
   * Publishes a live fixed-price listing (single-SKU or multi-variation). Location, shipping and
   * returns are copied from one of the seller's live listings.
   * Returns `{ externalListingId: ItemID, status, variants? }`.
   */
  async createListing(accessToken, product, options = {}) {
    const opts = typeof options === 'number' ? { price: options } : { ...options }
    if (!opts.categoryId) {
      const [suggestion] = await this.getCategories(accessToken, opts.title || product.title).catch(() => [])
      opts.categoryId = suggestion?.categoryId
    }
    const { itemId, variants } = await trading.addListing(accessToken, product, {
      ...opts,
      images: opts.images?.length ? opts.images : product.images,
      cacheKey: String(opts.shop?._id || 'default'),
    })
    return {
      externalListingId: itemId,
      status: opts.verifyOnly ? 'pending' : 'live',
      categoryId: opts.categoryId,
      ...(variants ? { variants } : {}),
    }
  },

  /** Changes title, subtitle, description, conditionDescription, images, price or quantity of a live listing. */
  async reviseListing(accessToken, externalListingId, changes, options = {}) {
    const variants = changes?.variants || options?.product?.variants
    return trading.reviseListing(accessToken, ebayItemId(externalListingId), {
      ...changes,
      ...(variants?.length ? { variants } : {}),
    })
  },

  async updateStock(accessToken, sku, quantity, options = {}) {
    return trading.reviseListing(accessToken, ebayItemId(options.externalListingId), {
      quantity,
      variants: options.variants,
      variantSku: options.variantSku,
      variantStock: options.variantStock,
      syncAllVariants: options.syncAllVariants,
    })
  },

  async updatePrice(accessToken, sku, price, currency = 'USD', options = {}) {
    await trading.reviseListing(accessToken, ebayItemId(options.externalListingId), {
      price,
      variants: options.variants,
      useVariantPrices: options.useVariantPrices,
    })
    return { success: true, price }
  },

  /** Puts an ended listing back on sale. `changes.quantity` is the stock to list. */
  async relistListing(accessToken, externalListingId, changes = {}) {
    return trading.relistListing(accessToken, ebayItemId(externalListingId), changes)
  },

  async applyListingAction(accessToken, action, listing, options = {}) {
    let itemId
    try {
      itemId = ebayItemId(listing.externalListingId)
    } catch (err) {
      if (action === 'end' || action === 'delete') {
        return { status: 'ended', marketplaceStatus: 'Ended' }
      }
      throw err
    }
    if (action === 'end' || action === 'delete') {
      await trading.endListing(accessToken, itemId)
      // Best-effort removal of inventory item if a SKU exists
      const sku = listing.sku || (Array.isArray(listing.matchSkus) && listing.matchSkus[0])
      if (sku) {
        await fetch(`${config.apiBaseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {})
      }
      return { status: 'ended', marketplaceStatus: 'Ended' }
    }
    if (action === 'relist') {
      // `quantity` (the shared stock) replaces eBay's old quantity when given.
      const res = await trading.relistListing(accessToken, itemId, options.quantity > 0 ? { quantity: options.quantity } : {})
      return {
        status: 'live',
        marketplaceStatus: 'Active',
        externalListingId: res.externalListingId || itemId,
        ...(options.quantity > 0 ? { stock: Math.floor(Number(options.quantity)) } : {}),
      }
    }
    throw new Error(`eBay cannot ${action} a listing.`)
  },

  /**
   * Category suggestions for a title. The Taxonomy API refuses seller tokens, so this uses the app token.
   */
  async getCategories(accessToken, query = 'General') {
    const categoryTreeId = '0'
    const appToken = await this.getApplicationToken().catch(() => null)
    const response = await fetch(
      `${config.apiBaseUrl}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${appToken || accessToken}`, Accept: 'application/json' } },
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay category lookup failed: ${err.errors?.[0]?.message || response.statusText}`)
    }
    const data = await response.json()
    return (data.categorySuggestions || []).map((s) => ({
      categoryId: s.category?.categoryId,
      categoryName: s.category?.categoryName,
      path: (s.categoryTreeNodeAncestors || []).map((node) => node.categoryName).reverse().concat(s.category?.categoryName).join(' > '),
    }))
  },

  /**
   * Look up item aspects/attributes required for an eBay category
   */
  async getItemAspects(accessToken, categoryId) {
    const appToken = await this.getApplicationToken().catch(() => null)
    const response = await fetch(
      `${config.apiBaseUrl}/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
      { headers: { Authorization: `Bearer ${appToken || accessToken}`, Accept: 'application/json' } },
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay item specifics lookup failed: ${err.errors?.[0]?.message || response.statusText}`)
    }
    const data = await response.json()
    return (data.aspects || [])
      .filter((a) => a.localizedAspectName !== 'Brand')
      .map((a) => ({
        id: a.localizedAspectName,
        name: a.localizedAspectName,
        type: 'product',
        required: Boolean(a.aspectConstraint?.aspectRequired),
        recommended: a.aspectConstraint?.aspectUsage === 'RECOMMENDED',
        multiple: a.aspectConstraint?.itemToAspectCardinality === 'MULTI',
        variationEnabled: Boolean(a.aspectConstraint?.aspectEnabledForVariations),
        values: (a.aspectValues || []).map((v) => v.localizedValue).slice(0, 200),
        freeText: a.aspectConstraint?.aspectMode !== 'SELECTION_ONLY',
      }))
  },

  /** Category features from GetCategoryFeatures (variations, conditions, Best Offer, identifiers). */
  async getCategoryRules(accessToken, categoryId) {
    try {
      return await trading.getCategoryFeatures(accessToken, categoryId)
    } catch {
      return {
        variationsEnabled: true,
        conditionEnabled: 'Enabled',
        conditions: [],
        bestOfferEnabled: true,
        upcEnabled: 'Enabled',
        eanEnabled: 'Enabled',
        isbnEnabled: 'Enabled',
      }
    }
  },

  /**
   * Proactively sends a discount offer to interested buyers/watchers
   */
  async sendBuyerOffer(accessToken, listingId, { discountPercentage = 10, message = 'Special discount offer for you!', allowCounterOffer = false } = {}) {
    const response = await fetch(`${config.apiBaseUrl}/sell/negotiation/v1/send_offer_to_interested_buyers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
      body: JSON.stringify({
        message: String(message || 'Special discount offer for you!').slice(0, 250),
        allowCounterOffer: Boolean(allowCounterOffer),
        offeredItems: [
          {
            listingId: String(listingId),
            quantity: 1,
            discountPercentage: String(discountPercentage || 10),
          },
        ],
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload.errors?.[0]?.longMessage || payload.errors?.[0]?.message || payload.message || response.statusText
      throw new Error(`eBay Send Offer Error: ${detail}`)
    }
    return payload
  },

  /**
   * Creates an item discount promotion via eBay Sell Marketing API
   */
  async createPromotion(accessToken, { name, description, percentageOff = 10, listingIds = [], startDate, endDate, imageUrl } = {}) {
    // A plain "% off these listings" sale is a markdown discount (createItemPriceMarkdownPromotion).
    // createItemPromotion is for threshold discounts and needs a buy-X threshold, which this form has not.
    const ids = [...new Set((listingIds || []).map((id) => String(id).trim()).filter(Boolean))]
    if (!ids.length) throw new Error('Add at least one eBay item ID to put on sale.')
    if (ids.length > 500) throw new Error('eBay allows at most 500 items in one sale.')
    const percent = Math.round(Number(percentageOff))
    if (!(percent >= 5 && percent <= 80)) throw new Error('eBay sale discounts must be between 5% and 80%.')
    const start = new Date(startDate || Date.now() + 5 * 60000)
    const end = new Date(endDate || start.getTime() + 14 * 86400000)
    if (end - start < 24 * 3600000) throw new Error('An eBay sale must run for at least 24 hours.')
    if (!imageUrl) throw new Error('eBay needs a picture for the sale. The first item must have a product image.')
    const payload = {
      name: String(name || `Sale ${new Date().toLocaleDateString('en-US')}`).slice(0, 90),
      description: String(description || `${percent}% off selected items`).slice(0, 50),
      marketplaceId: 'EBAY_US',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      promotionStatus: 'SCHEDULED',
      promotionImageUrl: imageUrl,
      selectedInventoryDiscounts: [{
        inventoryCriterion: { inventoryCriterionType: 'INVENTORY_BY_VALUE', listingIds: ids },
        discountBenefit: { percentageOffItem: String(percent) },
        ruleOrder: 1,
      }],
    }
    const response = await fetch(`${config.apiBaseUrl}/sell/marketing/v1/item_price_markdown`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const detail = body.errors?.[0]?.longMessage || body.errors?.[0]?.message || body.message || response.statusText
      throw new Error(`eBay Create Sale Error: ${detail}`)
    }
    const location = response.headers.get('Location') || ''
    return { success: true, promotionId: location.split('/').pop() || null, location }
  },

  /**
   * Pauses an active promotion via eBay Sell Marketing API
   */
  async pausePromotion(accessToken, promotionId) {
    const response = await fetch(`${config.apiBaseUrl}/sell/marketing/v1/promotion/${encodeURIComponent(promotionId)}/pause`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      const detail = payload.errors?.[0]?.message || payload.message || response.statusText
      throw new Error(`eBay Pause Promotion Error: ${detail}. eBay can only pause and resume threshold discounts, not markdown sales.`)
    }
    return { success: true }
  },

  /**
   * Resumes a paused promotion via eBay Sell Marketing API
   */
  async resumePromotion(accessToken, promotionId) {
    const response = await fetch(`${config.apiBaseUrl}/sell/marketing/v1/promotion/${encodeURIComponent(promotionId)}/resume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      const detail = payload.errors?.[0]?.message || payload.message || response.statusText
      throw new Error(`eBay Resume Promotion Error: ${detail}. eBay can only pause and resume threshold discounts, not markdown sales.`)
    }
    return { success: true }
  },

  /**
   * Retrieves competitor and market data using eBay Browse API
   */
  async getMarketData(accessToken, query = 'trending', limit = 10) {
    const response = await fetch(`${config.apiBaseUrl}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return (data.itemSummaries || []).map((item) => ({
      itemId: item.itemId,
      title: item.title,
      price: item.price?.value,
      currency: item.price?.currency,
      image: item.image?.imageUrl,
      itemWebUrl: item.itemWebUrl,
    }))
  },

  /**
   * Fetches live item details including primary and additional image URLs
   * Supports both legacy 12-digit item IDs and standard REST item IDs
   */
  async getItemDetails(token, itemId) {
    if (!token || !itemId) return null
    try {
      const cleanId = String(itemId).trim()
      const url = `${config.apiBaseUrl}/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(cleanId)}`
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      })
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  },
}
