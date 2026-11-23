/** Temu goods: inventory, stock, sale status, price. Methods use `this.call` (see service.js). */
const { temuMoney } = require('./format')

module.exports = {
  async getInventory(accessToken, { limit = 50 } = {}) {
    const pageSize = 100
    const maxPages = 20
    const goods = []
    let complete = true
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const result = await this.call('bg.local.goods.list.query', {
        access_token: accessToken,
        pageNo,
        pageSize,
        goodsSearchType: 1,
        goodsStatusFilterType: 1,
      })
      const page = result.goodsList || result.pageItems || result.list || []
      goods.push(...page)
      if (page.length < pageSize) break
      if (pageNo === maxPages) complete = false
    }
    const items = []
    for (const good of goods) {
      const skus = good.skuList || good.skuInfoList || [good]
      for (const sku of skus) {
        const rawSku = String(sku.outSkuSn || sku.outGoodsSn || good.outGoodsSn || '').trim()
        items.push({
          sku: rawSku || String(sku.skuId || good.goodsId),
          rawSku,
          title: good.goodsName || sku.goodsName || 'Temu goods',
          description: '',
          price: temuMoney(sku.retailPrice ?? good.retailPrice ?? sku.price),
          stock: Number(sku.quantity || sku.stock || good.quantity || 0),
          images: [good.thumbUrl || good.imageUrl].filter(Boolean),
          category: '',
          brand: '',
          listingStatus: 'live',
          marketplaceStatus: 'ONSALE',
          externalListingId: sku.skuId && (good.goodsId || sku.goodsId)
            ? `${good.goodsId || sku.goodsId}:${sku.skuId}`
            : String(good.goodsId || sku.goodsId || sku.skuId),
        })
      }
    }
    return { inventoryItems: items, complete }
  },

  async createListing() {
    throw new Error('Temu listing publish uses the US Partner goods create API. Confirm the type in partner-us before sending a product.')
  },

  async updateStock(accessToken, sku, quantity, options = {}) {
    const [goodsId, skuId] = String(options.externalListingId || '').split(':')
    if (!goodsId || !skuId) throw new Error('Sync this Temu goods again so the SKU id is saved, then update stock.')
    const target = Math.max(0, Math.floor(Number(quantity)))
    const result = await this.call('bg.local.goods.stock.edit', {
      access_token: accessToken,
      goodsId: Number(goodsId),
      skuStockTargetList: [{ skuId: Number(skuId), stockTarget: target }],
    })
    const info = (result.skuStockEditStatusInfoList || []).find((row) => String(row.skuId) === String(skuId))
    if (result.operateResult === false || info?.stockEditStatus === false) {
      throw new Error(info?.errorMsg || result.msg || 'Temu could not update this SKU stock.')
    }
    return { success: true }
  },

  async reviseListing(accessToken, externalListingId, changes) {
    if (changes.quantity != null) await this.updateStock(accessToken, null, changes.quantity, { externalListingId })
    // Temu price changes go through Seller Center price review; text and images are edited there too.
    const skipped = ['price', 'title', 'description', 'images'].filter((key) => changes[key] != null && changes[key] !== '')
    return { success: true, ...(skipped.length ? { skipped } : {}) }
  },

  async applyListingAction(accessToken, action, listing) {
    const goodsId = String(listing.externalListingId || '').split(':')[0]
    if (!goodsId) throw new Error('This product is not on Temu yet.')
    const onsale = action === 'publish' ? 1 : action === 'unpublish' ? 0 : null
    if (onsale == null) throw new Error(`Temu cannot ${action} a listing.`)
    const result = await this.call('bg.local.goods.sale.status.set', {
      access_token: accessToken,
      goodsId: Number(goodsId),
      onsale,
    })
    if (result?.success === false) throw new Error('Temu could not change the sale status.')
    return {
      status: onsale ? (Number(listing.stock) > 0 ? 'live' : 'out_of_stock') : 'paused',
      marketplaceStatus: onsale ? 'ONSALE' : 'OFFSALE',
    }
  },

  /**
   * Updates SKU price on Temu
   */
  async updatePrice(accessToken, sku, price, currency = 'USD', options = {}) {
    const [goodsId, skuId] = String(options.externalListingId || '').split(':')
    if (!goodsId || !skuId) {
      throw new Error(`Temu price update needs a synced goods and SKU for ${sku}`)
    }
    const result = await this.call('bg.local.goods.priceorder.change.sku.price', {
      access_token: accessToken,
      goodsId: Number(goodsId),
      skuPriceList: [
        {
          skuId: Number(skuId),
          price: Number(price),
          currency: currency || 'USD',
        },
      ],
    })
    return result || { success: true }
  },
}
