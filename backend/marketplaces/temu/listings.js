/** Temu goods: inventory, stock, sale status, price. Methods use `this.call` (see service.js). */
const { temuMoney } = require('./format')
const { buildGoodsAdd } = require('./goodsPayload')
const { mapTemplate } = require('./goodsTemplate')

const filled = (v) => v !== undefined && v !== null && String(v).trim() !== ''
const badRequest = (message, extra = {}) => Object.assign(new Error(message), { status: 400, ...extra })

module.exports = {
  async getInventory(accessToken, _options = {}) {
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

  /**
   * Lists a new goods on Temu US from the dashboard's Temu form (`opts.temuForm`, see
   * goodsPayload.js): the category's template is read again, the form is built into Temu's add
   * body (problems by field → 400), Temu checks the attributes, then bg.local.goods.add. Temu
   * reviews new goods, so the listing starts as pending ("Under review").
   */
  async createListing(accessToken, product, opts = {}) {
    const form = opts.temuForm
    if (!form || typeof form !== 'object') throw badRequest('Use the Temu listing form to list goods on Temu.')
    const raw = await this.call('bg.local.goods.template.get', { access_token: accessToken, catId: Number(form.catId) })
    const template = mapTemplate(raw)
    const body = buildGoodsAdd(form, template)
    const normalPropertyList = template.attributes.flatMap((a) => (body.goodsProperty.goodsProperties
      .filter((p) => p.templatePid === a.templatePid && p.vid != null)
      .map((p) => ({ pid: a.pid, refPid: a.refPid, vid: p.vid }))))
    if (normalPropertyList.length) {
      const check = await this.call('bg.local.goods.compliance.property.check', { access_token: accessToken, normalPropertyList })
      if (check.isMatch === false) throw badRequest(check.errorMsg || 'Temu does not accept these attributes for this category.', { problems: [{ field: 'attributes', message: check.errorMsg || 'Temu does not accept these attributes for this category.' }] })
    }
    const res = await this.call('bg.local.goods.add', { access_token: accessToken, ...body })
    const goodsId = String(res.goodsId)
    const temuSkus = (res.skuInfoList || []).map((s) => ({ skuId: String(s.skuId), outSkuSn: s.outSkuSn || '', externalListingId: `${goodsId}:${s.skuId}` }))
    return {
      externalListingId: temuSkus[0]?.externalListingId || goodsId,
      status: 'pending',
      marketplaceStatus: 'Under review',
      temuSkus,
      ...(res.warnings?.length ? { warnings: res.warnings.map((w) => w.message).filter(Boolean) } : {}),
    }
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

  /**
   * Sends a dashboard edit to Temu: stock (stock.edit), title/photos/description (one partial
   * update — Temu's recommended edit; photos are re-uploaded so goods use Temu's urls) and
   * attributes (attributes.edit). Price changes still go through Temu's price review (Price reviews).
   */
  async reviseListing(accessToken, externalListingId, changes) {
    const goodsId = Number(String(externalListingId || '').split(':')[0])
    if (changes.quantity != null) await this.updateStock(accessToken, null, changes.quantity, { externalListingId })
    const basic = {}
    if (filled(changes.title)) basic.goodsName = String(changes.title).trim()
    if (Array.isArray(changes.images) && changes.images.length) {
      const urls = []
      for (const fileUrl of changes.images.slice(0, 49)) urls.push((await this.call('bg.local.goods.image.upload', { access_token: accessToken, fileUrl })).url)
      basic.goodsGallery = { goodsCarouselImage: urls, detailImage: urls }
    }
    const partial = {
      ...(Object.keys(basic).length ? { goodsBasic: basic } : {}),
      ...(changes.description != null && changes.description !== '' ? { goodsDesc: String(changes.description) } : {}),
    }
    if (Object.keys(partial).length) {
      if (!goodsId) throw new Error('Sync this Temu goods again so its id is saved, then edit it.')
      await this.call('bg.local.goods.partial.update', { access_token: accessToken, goodsId, ...partial })
    }
    if (changes.attributes && typeof changes.attributes === 'object') {
      // Plain name → value(s) only; structured dashboard data (objects) isn't a Temu attribute.
      const attributes = Object.entries(changes.attributes)
        .filter(([, value]) => value === null || typeof value !== 'object' || Array.isArray(value))
        .map(([name, value]) => ({ name, value: (Array.isArray(value) ? value : [value]).map((v) => String(v ?? '').trim()).filter(Boolean) }))
        .filter((a) => a.name && a.value.length)
      if (attributes.length) await this.call('temu.local.goods.attributes.edit', { access_token: accessToken, goodsId, attributes })
    }
    const skipped = ['price'].filter((key) => changes[key] != null && changes[key] !== '')
    return { success: true, ...(skipped.length ? { skipped } : {}) }
  },

  async applyListingAction(accessToken, action, listing) {
    const goodsId = String(listing.externalListingId || '').split(':')[0]
    if (!goodsId) throw new Error('This product is not on Temu yet.')
    if (action === 'delete') {
      const res = await this.call('temu.local.goods.delete', { access_token: accessToken, goodsId: Number(goodsId) })
      if (res?.success === false) throw new Error(res.errorMsg || 'Temu did not delete this goods.')
      return { status: 'ended', marketplaceStatus: 'DELETED' }
    }
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
