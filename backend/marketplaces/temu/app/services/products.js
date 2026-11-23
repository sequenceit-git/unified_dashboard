/** Generated from routes/catalog/products.js: business logic behind the routes; routes only handle HTTP. */
const { productAccess, ownDrafts } = require('../../../../services/productAccess')
const { paging, sortOf, paged, escapeRegex } = require('../../../../utils/query')
const Listing = require('../../../../models/Listing')
const Product = require('../../../../models/Product')
const Shop = require('../../../../models/Shop')
const ResearchReport = require('../../../../models/ResearchReport')
const marketplaceManager = require('../manager')

const { importProductFromUrl, fillShopAttributes } = require('./productImport')
const { listingUrl } = require('../../..')
const { HttpError } = require('../../../../utils/httpError')
const { shopFilter } = require('../../../../middleware/auth')
const { assertProductAccess } = require('../../../../services/productAccess')
const ADAPTER = require('../..')

const SORTABLE = ['createdAt', 'sku', 'title', 'basePrice', 'costPrice', 'stock']

/** Fields a dashboard edit should send on to live marketplace listings. */
function changedListingFields(before, after) {
  const changes = {}
  if (after.title !== before.title) changes.title = after.title
  if ((after.subtitle || '') !== (before.subtitle || '')) changes.subtitle = after.subtitle || ''
  if ((after.description || '') !== (before.description || '')) changes.description = after.description
  if ((after.conditionDescription || '') !== (before.conditionDescription || '')) {
    changes.conditionDescription = after.conditionDescription || ''
  }
  if (Number(after.basePrice) !== Number(before.basePrice)) changes.price = after.basePrice
  if (Number(after.stock) !== Number(before.stock)) changes.quantity = after.stock
  if (JSON.stringify(after.images || []) !== JSON.stringify(before.images || [])) changes.images = after.images
  if (after.weight != null && Number(after.weight) !== Number(before.weight)) changes.weight = after.weight
  const bd = before.dimensions || {}
  const ad = after.dimensions || {}
  if (
    Number(ad.length || 0) !== Number(bd.length || 0)
    || Number(ad.width || 0) !== Number(bd.width || 0)
    || Number(ad.height || 0) !== Number(bd.height || 0)
  ) {
    changes.dimensions = after.dimensions
  }
  const bv = before.variants || []
  const av = after.variants || []
  if (JSON.stringify(bv) !== JSON.stringify(av)) {
    changes.variants = av
    const bySku = new Map(bv.map((v) => [v.sku, v]))
    if (av.some((v) => Number(v.price) !== Number(bySku.get(v.sku)?.price))) {
      changes.variantPrices = true
    }
    if (av.some((v) => Number(v.stock) !== Number(bySku.get(v.sku)?.stock))) {
      changes.variantStocks = true
    }
  }
  return changes
}

// Sub-admins see products through listings of their own shop (schema note 6).
/** `listing` query: any listing status, or inactive (paused or in review). */
function listingStatusFilter(value) {
  switch (value) {
    case 'live':
    case 'out_of_stock':
    case 'pending':
    case 'paused':
    case 'ended':
    case 'error':
      return { status: value }
    case 'inactive': return { status: { $in: ['paused', 'pending'] } }
    default: return {}
  }
}

/** Sub-admins: products listed on their shops, plus their own drafts that aren't listed yet. */
async function scopedIds(req) {
  if (req.user.role !== 'sub_admin') return null
  const [rows, drafts] = await Promise.all([
    Listing.find({ shopId: { $in: req.allowedShopIds } }).select('productId'),
    ownDrafts(req),
  ])
  return [...rows.map((r) => r.productId), ...drafts.map((row) => row._id)]
}

/** GET / */
async function list(ctx) {
    const filter = {}
    if (ctx.query.status) filter.status = ctx.query.status
    if (ctx.query.category) filter.category = ctx.query.category
    if (ctx.query.source) filter.source = ctx.query.source
    if (ctx.query.q) {
      const q = escapeRegex(ctx.query.q.trim())
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { sku: { $regex: q, $options: 'i' } },
      ]
    }
    if (ctx.query.stock === 'low') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] }
    if (ctx.query.stock === 'out') filter.stock = 0
    const ids = await scopedIds(ctx)
    if (ids) filter._id = { $in: ids }
    let marketplace = null
    if (ctx.query.marketplace && !ctx.query.shop) {
      marketplace = 'temu'
      if (!marketplace) throw new HttpError(400, { error: 'Unknown marketplace' })
      const listingFilter = { marketplace, ...listingStatusFilter(ctx.query.listing) }
      const rows = await Listing.find(listingFilter).select('productId')
      let productIds = rows.map((row) => row.productId)
      if (ids) {
        const allowed = new Set(ids.map(String))
        productIds = productIds.filter((id) => allowed.has(String(id)))
      }
      const unlisted = !ids && (!ctx.query.listing || ctx.query.listing === 'all')
      // A sub-admin's own drafts show on the tab of the shop they're meant for (or every tab if none).
      if (ids && (!ctx.query.listing || ctx.query.listing === 'all')) {
        const drafts = await ownDrafts(ctx)
        for (const row of drafts) {
          const target = row.attributes?.targetMarketplace
          if (!target || target === marketplace) productIds.push(row._id)
        }
      }
      if (unlisted) {
        filter.$and = [{ $or: [{ _id: { $in: productIds } }, { 'attributes.targetMarketplace': marketplace }] }]
      } else {
        filter._id = { $in: productIds }
      }
    }
    if (ctx.query.shop) {
      const shopId = ctx.user.role === 'sub_admin' && !ctx.allowedShopIds.some((id) => String(id) === ctx.query.shop)
        ? null
        : ctx.query.shop
      const rows = shopId ? await Listing.find({ shopId }).select('productId') : []
      filter._id = { $in: rows.map((r) => r.productId) }
    }
    const pg = paging(ctx)
    const result = await paged(Product, filter, pg, sortOf(ctx, SORTABLE))
    if (marketplace) {
      const listings = await Listing.find({ marketplace, productId: { $in: result.data.map((row) => row._id) } })
        .select('productId status marketplaceStatus syncError externalListingId listingUrl lastSyncedAt').lean()
      const byProduct = new Map(listings.map((row) => [String(row.productId), {
        ...row,
        listingUrl: listingUrl(marketplace, row.externalListingId, row.listingUrl, { status: row.status }),
      }]))
      result.data = result.data.map((row) => {
        const plain = typeof row.toObject === 'function' ? row.toObject() : row
        return { ...plain, shopListing: byProduct.get(String(plain._id)) }
      })
    }
    return result
}

/** POST /import-url */
async function importFromUrl(ctx) {
    return await importProductFromUrl(ctx.body.url, {
      useAi: ctx.body.useAi !== false,
      marketplace: 'temu',
    })
}

/** POST /fill-attributes */
async function fillAttributes(ctx) {
    return await fillShopAttributes({
      title: ctx.body.title,
      description: ctx.body.description,
      brand: ctx.body.brand,
      attributes: ctx.body.attributes,
      schema: ctx.body.schema,
    })
}

/** GET /categories */
async function categories(ctx) {
    const ids = await scopedIds(ctx)
    return await Product.distinct('category', ids ? { _id: { $in: ids } } : {})
}

/** GET /:id */
async function get(ctx) {
    const listingFilter = { productId: ctx.params.id, ...shopFilter(ctx, Listing) }
    const listings = await Listing.find(listingFilter).populate('shopId', 'name marketplace')
    if (ctx.user.role === 'sub_admin' && !(await productAccess(ctx, ctx.params.id)).visible) {
      throw new HttpError(404, { error: 'Not found' })
    }
    const doc = await Product.findById(ctx.params.id)
    if (!doc) throw new HttpError(404, { error: 'Not found' })
    return { ...doc.toObject(), listings }
}

/** POST / */
async function create(ctx) {
    const body = { ...ctx.body, createdBy: ctx.user.id }
    if (Array.isArray(body.variants) && body.variants.length > 0) {
      body.variants = body.variants.map((v) => ({
        ...v,
        price: v.price === '' || v.price == null ? undefined : Number(v.price),
        listPrice: v.listPrice === '' || v.listPrice == null ? undefined : Number(v.listPrice),
        stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
      }))
      body.stock = body.variants.reduce((sum, v) => sum + v.stock, 0)
      if (body.basePrice == null || body.basePrice === '' || !Number.isFinite(Number(body.basePrice))) {
        const positive = body.variants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
        if (positive.length) body.basePrice = Math.min(...positive)
      }
    }
    return await Product.create(body)
}

/** PATCH /:id */
async function update(ctx) {
    await assertProductAccess(ctx, ctx.params.id)
    const before = await Product.findById(ctx.params.id).lean()
    if (!before) throw new HttpError(404, { error: 'Not found' })
    // The SKU links the product to its marketplace listings, so it never changes. The creator
    // decides who sees a draft, so it can't be edited either.
    const { sku, createdBy, ...update } = ctx.body
    if (Array.isArray(update.variants) && update.variants.length > 0) {
      update.stock = update.variants.reduce((sum, v) => sum + Math.max(0, Math.floor(Number(v.stock) || 0)), 0)
      if (update.basePrice == null || Number(update.basePrice) === Number(before.basePrice)) {
        const positive = update.variants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
        if (positive.length) update.basePrice = Math.min(...positive)
      }
    }
    const doc = await Product.findByIdAndUpdate(ctx.params.id, update, { new: true, runValidators: true })
    const changes = changedListingFields(before, doc)
    const marketplaceSync = Object.keys(changes).length ? await require('../../../../services/catalog/fanOut').pushProductChanges(doc, changes) : []
    if (changes.quantity != null) {
      await require('../../../../services/core/notify').stockChangedOnShops(doc, { was: before.stock, stock: doc.stock }).catch(() => {})
    }
    return { ...doc.toObject(), marketplaceSync }
}

/** DELETE /:id */
async function remove(ctx) {
    const doc = await Product.findById(ctx.params.id)
    if (!doc) throw new HttpError(404, { error: 'Not found' })
    // A sub-admin only removes their own shops' listings; the product itself goes once none are left.
    const access = await productAccess(ctx, doc._id)
    if (!access.visible) throw new HttpError(404, { error: 'Not found' })
    const partial = access.mine !== null && access.others > 0
    const listings = access.mine
      ? await Listing.find({ _id: { $in: access.mine.map((row) => row._id) } })
      : await Listing.find({ productId: doc._id })
    for (const listing of listings) {
      await marketplaceManager.forgetListing(listing, [doc.sku])
      const shop = await Shop.findById(listing.shopId)
      if (shop) await marketplaceManager.removeFromShop(shop, listing)
    }
    if (partial) {
      await Listing.deleteMany({ _id: { $in: listings.map((row) => row._id) } })
      return { deleted: false, removedListings: listings.length, note: 'The product is still listed on shops outside your access.' }
    }
    if (!listings.length) {
      const shops = await Shop.find({ status: 'connected' }).select('_id')
      for (const shop of shops) await marketplaceManager.forgetListing({ shopId: shop._id }, [doc.sku])
    }
    await Product.findByIdAndDelete(doc._id)
    await Listing.deleteMany({ productId: doc._id })
    await ResearchReport.updateMany(
      { 'opportunities.addedProductId': doc._id },
      { $set: { 'opportunities.$.addedProductId': null, 'opportunities.$.listedShops': [] } },
    ).catch(() => {})
    return { deleted: true }
}

/** POST /:id/list */
async function listOnShop(ctx) {
    const product = await Product.findById(ctx.params.id)
    if (!product) throw new HttpError(404, { error: 'Product not found' })
    await assertProductAccess(ctx, product._id)

    const shop = await Shop.findById(ctx.body.shopId).select('+auth.accessTokenEnc')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })

    if (ctx.user.role === 'sub_admin') {
      // Allowed shops already cover both a marketplace grant and a direct shop grant.
      const isAllowedShop = ctx.allowedShopIds?.some((id) => String(id) === String(shop._id))
      if (!isAllowedShop) {
        throw new HttpError(403, { error: 'You do not have permission to list on this shop' })
      }
    }

    const rawVariants = Array.isArray(ctx.body.variants)
      ? ctx.body.variants
      : (Array.isArray(product.variants) ? product.variants.map((v) => (typeof v.toObject === 'function' ? v.toObject() : v)) : [])
    const hasVariants = rawVariants.length > 0
    const normalizedVariants = hasVariants
      ? rawVariants.map((v) => ({
          ...v,
          price: v.price === '' || v.price == null ? undefined : Number(v.price),
          listPrice: v.listPrice === '' || v.listPrice == null ? undefined : Number(v.listPrice),
          stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
        }))
      : []

    const positiveVariantPrices = normalizedVariants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
    const price = hasVariants && positiveVariantPrices.length
      ? Math.min(...positiveVariantPrices)
      : (ctx.body.price !== undefined && ctx.body.price !== '' ? Number(ctx.body.price) : product.basePrice)

    // Prepare marketplace-tailored listing options
    let images = ctx.body.images
    if (typeof images === 'string') {
      images = images.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    } else if (!Array.isArray(images) || images.length === 0) {
      images = product.images || []
    }

    const stock = hasVariants
      ? normalizedVariants.reduce((sum, v) => sum + v.stock, 0)
      : (ctx.body.stock !== undefined && ctx.body.stock !== '' ? Number(ctx.body.stock) : product.stock)
    const listingOptions = {
      price,
      listPrice: ctx.body.listPrice !== undefined && ctx.body.listPrice !== '' ? Number(ctx.body.listPrice) : product.listPrice,
      stock,
      title: ctx.body.title || product.title,
      subtitle: ctx.body.subtitle !== undefined ? ctx.body.subtitle : product.subtitle,
      description: ctx.body.description || product.description,
      categoryId: ctx.body.categoryId,
      condition: ctx.body.condition || product.condition || 'NEW',
      conditionEnabled: ctx.body.conditionEnabled,
      conditionDescription: ctx.body.conditionDescription !== undefined ? ctx.body.conditionDescription : product.conditionDescription,
      weight: ctx.body.weight !== undefined && ctx.body.weight !== '' ? Number(ctx.body.weight) : (product.weight || 1),
      dimensions: ctx.body.dimensions || product.dimensions,
      images,
      aspects: ctx.body.aspects,
      brand: ctx.body.brand || product.brand,
      brandId: ctx.body.brandId !== undefined ? ctx.body.brandId : product.brandId,
      mpn: ctx.body.mpn !== undefined ? ctx.body.mpn : product.mpn,
      dispatchTimeMax: ctx.body.dispatchTimeMax !== undefined && ctx.body.dispatchTimeMax !== '' ? Number(ctx.body.dispatchTimeMax) : product.dispatchTimeMax,
      bestOffer: ctx.body.bestOffer !== undefined ? ctx.body.bestOffer : product.bestOffer,
      certifications: ctx.body.certifications,
      variants: hasVariants ? normalizedVariants : undefined,
      identifierCode: ctx.body.identifierCode !== undefined ? ctx.body.identifierCode : product.identifierCode,
      sizeChart: ctx.body.sizeChart !== undefined ? ctx.body.sizeChart : product.sizeChart,
      saveMode: ctx.body.saveMode,
      sellerSku: ctx.body.sellerSku,
    }

    const capabilities = marketplaceManager.listingCapabilities(shop.marketplace)
    if (!capabilities.canList) throw new HttpError(422, { error: capabilities.note || `Listing on ${shop.name} is not available.` })

    const existing = await Listing.findOne({ productId: product._id, shopId: shop._id })
    if (existing?.externalListingId && ['live', 'pending', 'out_of_stock'].includes(existing.status)) {
      throw new HttpError(409, { error: `Already listed on ${shop.name}. Edit the product to update the listing.` })
    }

    let publishRes
    try {
      publishRes = await marketplaceManager.publishListing(shop, product, listingOptions)
    } catch (apiErr) {
      console.warn(`Marketplace [${shop.marketplace}] listing error:`, apiErr.message)
      const failed = await Listing.findOneAndUpdate(
        { productId: product._id, shopId: shop._id },
        { productId: product._id, shopId: shop._id, marketplace: shop.marketplace, price, status: 'error', syncError: apiErr.message, lastSyncedAt: new Date() },
        { new: true, upsert: true, runValidators: true },
      )
      await require('../../../../services/core/notify').listingStatusChanged(failed, shop, {}).catch(() => {})
      throw new HttpError(422, { error: apiErr.message, missingSpecifics: apiErr.missingSpecifics || [] })
    }

    // A shop may rename a draft SKU once the listing exists (eBay: EBAY-<item ID>).
    const finalSku = ADAPTER.hooks?.publishedSku?.(product, publishRes) || product.sku

    const productUpdates = {
      stock,
      status: 'active',
      ...(finalSku !== product.sku ? { sku: finalSku } : {}),
      ...(listingOptions.title ? { title: listingOptions.title } : {}),
      ...(listingOptions.subtitle !== undefined ? { subtitle: listingOptions.subtitle } : {}),
      ...(price !== undefined && price !== '' ? { basePrice: price } : {}),
      ...(listingOptions.listPrice > 0 ? { listPrice: listingOptions.listPrice } : {}),
      ...(Array.isArray(listingOptions.images) && listingOptions.images.length > 0 ? { images: listingOptions.images } : {}),
      ...(listingOptions.brand ? { brand: listingOptions.brand } : {}),
      ...(listingOptions.brandId ? { brandId: listingOptions.brandId } : {}),
      ...(listingOptions.mpn !== undefined ? { mpn: listingOptions.mpn } : {}),
      ...(listingOptions.description ? { description: listingOptions.description } : {}),
      ...(listingOptions.condition ? { condition: listingOptions.condition } : {}),
      ...(listingOptions.conditionDescription !== undefined ? { conditionDescription: listingOptions.conditionDescription } : {}),
      ...(listingOptions.dispatchTimeMax != null && Number.isFinite(Number(listingOptions.dispatchTimeMax)) ? { dispatchTimeMax: Number(listingOptions.dispatchTimeMax) } : {}),
      ...(listingOptions.bestOffer !== undefined ? { bestOffer: listingOptions.bestOffer } : {}),
      ...(listingOptions.weight ? { weight: listingOptions.weight } : {}),
      ...(listingOptions.dimensions ? { dimensions: listingOptions.dimensions } : {}),
      ...(Array.isArray(publishRes.variants) ? { variants: publishRes.variants } : hasVariants ? { variants: normalizedVariants } : {}),
      ...(listingOptions.identifierCode?.code ? { identifierCode: listingOptions.identifierCode } : {}),
      ...(listingOptions.sizeChart && (listingOptions.sizeChart.templateId || listingOptions.sizeChart.image)
        ? { sizeChart: listingOptions.sizeChart }
        : {}),
      ...(listingOptions.aspects && Object.keys(listingOptions.aspects).length > 0
        ? { attributes: { ...product.attributes, ...listingOptions.aspects } }
        : {}),
    }
    const updatedProduct = await Product.findByIdAndUpdate(
      product._id,
      { $set: productUpdates },
      { new: true },
    )

    const listing = await Listing.findOneAndUpdate(
      { productId: product._id, shopId: shop._id },
      {
        productId: product._id,
        shopId: shop._id,
        marketplace: shop.marketplace,
        externalListingId: publishRes.externalListingId,
        listingUrl: listingUrl(shop.marketplace, publishRes.externalListingId, null, { status: publishRes.status || 'pending' }),
        price,
        stock: Math.max(0, Math.floor(Number(stock) || 0)),
        status: publishRes.status || 'pending',
        ...(publishRes.marketplaceStatus ? { marketplaceStatus: publishRes.marketplaceStatus } : {}),
        syncError: null,
        lastSyncedAt: new Date(),
      },
      { new: true, upsert: true, runValidators: true },
    )
    if (product.sourceReportId) {
      await ResearchReport.updateOne(
        { _id: product.sourceReportId, 'opportunities.addedProductId': product._id },
        { $addToSet: { 'opportunities.$.listedShops': shop.marketplace } },
      )
    }
    await marketplaceManager.rememberListing(shop._id, [product.sku, finalSku, publishRes.externalListingId].filter(Boolean))
    await require('../../../../services/core/notify').listingStatusChanged(listing, shop, {}).catch(() => {})
    const out = listing.toObject ? listing.toObject() : { ...listing }
    out.product = updatedProduct || product
    if (publishRes.warnings?.length) out.warnings = publishRes.warnings
    return out
}

/** POST /:id/listing-action */
async function listingAction(ctx) {
    const action = String(ctx.body.action || '')
    const listing = await Listing.findOne({
      productId: ctx.params.id,
      ...shopFilter(ctx, Listing),
      ...(ctx.body.marketplace ? { marketplace: ctx.body.marketplace } : {}),
    })
    if (!listing?.externalListingId) throw new HttpError(404, { error: 'This product is not listed on a shop yet.' })
    const shop = await Shop.findById(listing.shopId)
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    const product = await Product.findById(listing.productId).select('sku stock sourceReportId')
    const result = await marketplaceManager.applyListingAction(shop, listing, action, { quantity: product?.stock })
    listing.status = result.status || listing.status
    if (result.marketplaceStatus) listing.marketplaceStatus = result.marketplaceStatus
    if (result.externalListingId) listing.externalListingId = result.externalListingId
    if (result.stock != null) {
      listing.stock = result.stock
    } else if (action === 'relist' && product?.stock > 0) {
      listing.stock = Math.floor(Number(product.stock))
    }
    listing.listingUrl = listingUrl(shop.marketplace, listing.externalListingId, listing.listingUrl, { status: listing.status })
    listing.syncError = null
    listing.lastSyncedAt = new Date()
    await listing.save()
    if (action === 'delete' || action === 'end') {
      await marketplaceManager.forgetListing(listing, [product?.sku, listing.externalListingId, `EBAY-${listing.externalListingId}`])
      if (product?.sourceReportId) {
        const remainingOnMarket = await Listing.countDocuments({
          productId: product._id,
          marketplace: shop.marketplace,
          status: { $in: ['live', 'pending', 'out_of_stock'] },
          _id: { $ne: listing._id },
        })
        if (remainingOnMarket === 0) {
          await ResearchReport.updateOne(
            { _id: product.sourceReportId, 'opportunities.addedProductId': product._id },
            { $pull: { 'opportunities.$.listedShops': shop.marketplace } },
          ).catch(() => {})
        }
      }
    }
    if (action === 'publish' || action === 'relist' || action === 'recover') {
      await marketplaceManager.rememberListing(shop._id, [product?.sku, listing.externalListingId, `EBAY-${listing.externalListingId}`])
    }
    await require('../../../../services/core/notify').listingStatusChanged(listing, shop, {}).catch(() => {})
    return {
      ...listing.toObject(),
      listingUrl: listing.listingUrl,
    }
}

/** PATCH /:id/sync */
async function sync(ctx) {
    await assertProductAccess(ctx, ctx.params.id)
    const product = await Product.findById(ctx.params.id)
    if (!product) throw new HttpError(404, { error: 'Product not found' })

    const results = await require('../../../../services/catalog/fanOut').pushProductChanges(product, {
      price: product.basePrice,
      quantity: product.stock,
      variants: product.variants,
      variantStocks: Boolean(product.variants?.length),
      variantPrices: Boolean(product.variants?.length),
    })
    return {
      listingsUpdated: results.length,
      pushedToMarketplaces: results.filter((item) => item.ok).length,
      marketplaceSync: results,
    }
}

/** PATCH /:id/price */
async function updatePrice(ctx) {
    const { price } = ctx.body
    if (price === undefined || price === null || isNaN(Number(price))) {
      throw new HttpError(400, { error: 'Valid price is required' })
    }

    await assertProductAccess(ctx, ctx.params.id)
    const numPrice = Number(price)
    const product = await Product.findByIdAndUpdate(ctx.params.id, { basePrice: numPrice }, { new: true })
    if (!product) throw new HttpError(404, { error: 'Product not found' })

    const results = await require('../../../../services/catalog/fanOut').pushProductChanges(product, { price: numPrice })
    return { product, pushedToMarketplaces: results.filter((item) => item.ok).length, marketplaceSync: results }
}

module.exports = { list, importFromUrl, fillAttributes, categories, get, create, update, remove, listOnShop, listingAction, sync, updatePrice }
