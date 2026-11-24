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
  if (after.attributes && JSON.stringify(after.attributes) !== JSON.stringify(before.attributes || {})) changes.attributes = after.attributes
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
/**
 * GET /counts — goods per Temu state for the Goods status pills:
 * `{ all, live, unlisted, out_of_stock, paused, ended, error, pending }` (each goods counted once).
 */
async function counts(ctx) {
    const ids = await scopedIds(ctx)
    const productFilter = { marketplace: 'temu', ...(ids ? { _id: { $in: ids } } : {}) }
    const productIds = new Set((await Product.distinct('_id', productFilter)).map(String))
    const listings = await Listing.find({ marketplace: 'temu', ...(ids ? { productId: { $in: ids } } : {}) }).select('productId status').lean()
    const out = { all: productIds.size, live: 0, unlisted: 0, out_of_stock: 0, paused: 0, ended: 0, error: 0, pending: 0 }
    const listed = new Set()
    for (const row of listings) {
      const id = String(row.productId)
      if (!productIds.has(id) || listed.has(id)) continue
      listed.add(id)
      if (row.status in out && !['all', 'unlisted'].includes(row.status)) out[row.status] += 1
    }
    out.unlisted = Math.max(0, out.all - listed.size)
    return out
}

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
      // A Temu goods id (digits) finds the goods listed under it (listings are "<goodsId>:<skuId>").
      if (/^\d{6,}$/.test(ctx.query.q.trim())) {
        const listed = await Listing.find({ marketplace: 'temu', externalListingId: { $regex: `^${q}(:|$)` } }).select('productId').lean()
        if (listed.length) filter.$or.push({ _id: { $in: listed.map((row) => row.productId) } })
      }
    }
    // Low stock: some left, at or under the alert (out of stock is its own filter).
    if (ctx.query.stock === 'low') {
      filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] }
      filter.stock = { $gt: 0 }
    }
    if (ctx.query.stock === 'out') filter.stock = 0
    const ids = await scopedIds(ctx)
    if (ids) filter._id = { $in: ids }
    // This shop's products only: each shop has its own products, stock and price.
    filter.marketplace = 'temu'
    const marketplace = 'temu'
    // Inventory (listed=1): only goods on Temu, as its stock counts are.
    if (ctx.query.listed === '1') {
      const onTemu = (await Listing.find({ marketplace }).select('productId').lean()).map((row) => row.productId)
      const allowed = ids ? new Set(ids.map(String)) : null
      filter._id = { $in: onTemu.filter((id) => !allowed || allowed.has(String(id))) }
    }
    if (ctx.query.listing === 'unlisted') {
      // Goods with no Temu listing yet (drafts, or never sent).
      const listed = (await Listing.find({ marketplace }).select('productId').lean()).map((row) => row.productId)
      const listedSet = new Set(listed.map(String))
      filter._id = ids ? { $in: ids.filter((id) => !listedSet.has(String(id))) } : { $nin: listed }
    } else if (ctx.query.listing && ctx.query.listing !== 'all') {
      const rows = await Listing.find({ marketplace, ...listingStatusFilter(ctx.query.listing) }).select('productId')
      const allowed = ids ? new Set(ids.map(String)) : null
      filter._id = { $in: rows.map((row) => row.productId).filter((id) => !allowed || allowed.has(String(id))) }
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
        return { ...plain, shopListing: byProduct.get(String(plain._id)) || null }
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
    return await Product.distinct('category', { marketplace: 'temu', ...(ids ? { _id: { $in: ids } } : {}) })
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
    const body = { ...ctx.body, marketplace: 'temu', createdBy: ctx.user.id }
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
    const marketplaceSync = Object.keys(changes).length ? await marketplaceManager.pushProductChanges(doc, changes) : []
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
    // A Temu goods holds every SKU: if another dashboard product lists a SKU of the same goods,
    // deleting this one product would remove theirs on Temu too, so it is refused.
    const goodsIds = [...new Set(listings.map((l) => String(l.externalListingId || '').split(':')[0]).filter((g) => /^\d+$/.test(g)))]
    for (const goodsId of goodsIds) {
      const others = (await Listing.find({ marketplace: 'temu', externalListingId: new RegExp(`^${goodsId}(:|$)`) }) || [])
        .filter((l) => String(l.productId) !== String(doc._id))
      if (others.length) {
        throw new HttpError(409, { error: `Temu goods ${goodsId} also holds SKUs of ${others.length} other products here. Delete those products too, or delete the goods in Temu Seller Center.` })
      }
    }
    // Temu deletes the goods first (once per goods); if Temu refuses (open orders, active promotion), nothing is removed here.
    const done = new Set()
    for (const listing of listings) {
      const goodsId = String(listing.externalListingId || '').split(':')[0]
      if (done.has(goodsId)) { listing.marketplaceStatus = 'DELETED'; continue }
      if (!listing.externalListingId || listing.status === 'ended' || listing.marketplaceStatus === 'DELETED') continue
      const shop = await Shop.findById(listing.shopId)
      if (!shop || shop.status !== 'connected') continue
      try {
        await marketplaceManager.withShopToken(shop, (token) => require('../../service').applyListingAction(token, 'delete', listing))
        listing.marketplaceStatus = 'DELETED'
        done.add(goodsId)
      } catch (err) {
        throw new HttpError(422, { error: `Temu did not delete this goods, so it was kept here: ${err.message}` })
      }
    }
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
      // This shop's stores only: the same SKU on another shop is that shop's own product.
      const shops = await Shop.find({ status: 'connected', marketplace: 'temu' }).select('_id')
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
      // The Temu listing form (marketplaces/temu/goodsPayload.js): category, attributes, SKUs.
      ...(ctx.body.temuForm && typeof ctx.body.temuForm === 'object' ? { temuForm: ctx.body.temuForm } : {}),
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
      throw new HttpError(422, { error: apiErr.message, missingSpecifics: apiErr.missingSpecifics || [], ...(apiErr.problems ? { problems: apiErr.problems } : {}) })
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
    // Temu puts the whole goods on or off sale: its other SKU rows change with it.
    const goodsId = String(listing.externalListingId).split(':')[0]
    if (['publish', 'unpublish'].includes(action) && /^\d+$/.test(goodsId)) {
      await Listing.updateMany(
        { shopId: listing.shopId, marketplace: 'temu', externalListingId: { $regex: new RegExp(`^${goodsId}:`) }, _id: { $ne: listing._id } },
        { $set: { status: listing.status, ...(listing.marketplaceStatus ? { marketplaceStatus: listing.marketplaceStatus } : {}), syncError: null, lastSyncedAt: listing.lastSyncedAt } },
      )
    }
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

    const results = await marketplaceManager.pushProductChanges(product, {
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

    const results = await marketplaceManager.pushProductChanges(product, { price: numPrice })
    return { product, pushedToMarketplaces: results.filter((item) => item.ok).length, marketplaceSync: results }
}

// Temu's goods status codes (product listing and delisting guide).
const GOODS_STATUS = { 2: 'Active', 3: 'Inactive', 4: 'Incomplete', 5: 'Draft', 6: 'Deleted' }
const GOODS_SUB_STATUS = {
  1: 'Sold out', 2: 'Delisted', 3: 'Blocked (penalty)', 4: 'Qualification documents due', 5: 'Processing',
  6: 'Qualification review', 7: 'Release failed', 8: 'On-shelf', 9: 'Price assessment rejected',
  10: 'Price assessment in process', 11: 'Audit processing', 12: 'Supplementary review', 13: 'Deleted',
  14: 'Deletion refused (price assessment)',
}

/** The user's connected Temu shop that lists this goods (never another shop's goods). */
async function temuShopForGoods(ctx, goodsId) {
    if (!/^\d+$/.test(String(goodsId || ''))) throw new HttpError(400, { error: 'goodsId must be a Temu goods id' })
    const filter = { marketplace: 'temu', status: 'connected' }
    if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
    const shop = await Shop.findOne(filter)
    if (!shop) throw new HttpError(404, { error: 'No connected Temu shop' })
    const listing = await Listing.findOne({ shopId: shop._id, marketplace: 'temu', externalListingId: { $in: [String(goodsId), new RegExp(`^${goodsId}:`)] } })
    if (!listing) throw new HttpError(404, { error: 'This shop has no such Temu goods' })
    return shop
}

const temuMoney = (amount, currency) => (amount != null && amount !== '' ? { value: Number(amount?.amount ?? amount), currency: amount?.currency || currency || 'USD' } : null)

/** GET /:goodsId/temu-detail — the goods as Temu has it: details, every SKU, publication status. */
async function temuDetail(ctx) {
    const goodsId = String(ctx.params.goodsId)
    const shop = await temuShopForGoods(ctx, goodsId)
    const temu = require('../../service')
    const [detail, skus, publish] = await marketplaceManager.withShopToken(shop, (token) => Promise.all([
      temu.call('bg.local.goods.detail.query', { access_token: token, goodsId: Number(goodsId) }),
      temu.call('bg.local.goods.sku.list.query', { access_token: token, pageNo: 1, pageSize: 100, skuSearchType: 1, searchText: goodsId }).catch(() => ({ skuList: [] })),
      temu.call('bg.local.goods.publish.status.get', { access_token: token, goodsIdList: [Number(goodsId)] }).catch(() => ({ goodsPublishStatusList: [] })),
    ]))
    const own = (skus.skuList || []).filter((s) => String(s.goodsId) === goodsId)
    const fromDetail = new Map((detail.skuList || []).map((s) => [String(s.skuId), s]))
    const st = (publish.goodsPublishStatusList || []).find((p) => String(p.goodsId) === goodsId) || {}
    return {
      goods: {
        title: detail.goodsName || '',
        category: detail.catName || '',
        images: detail.goodsGallery?.detailImage || detail.goodsGallery?.carouselImageUrls || [],
        attributes: (detail.goodsProperties || []).map((p) => ({ name: p.name || p.propName || '', value: p.value ?? p.propValue ?? '' })),
      },
      skus: (own.length ? own : detail.skuList || []).map((s) => {
        const d = fromDetail.get(String(s.skuId)) || {}
        return {
          skuId: String(s.skuId),
          spec: s.specName || (d.specNameList || []).join(' / ') || '',
          price: temuMoney(s.price ?? d.price, s.currency),
          stock: s.stock ?? null,
          sellerCode: s.skuSn ?? d.outSkuSn ?? '',
        }
      }),
      status: { state: GOODS_STATUS[st.status] || (st.status != null ? `Status ${st.status}` : 'Unknown'), detail: GOODS_SUB_STATUS[st.subStatus] || '' },
    }
}

/**
 * POST /:goodsId/sku-codes { codes: [{ skuId, code }] } — sets the seller's own SKU codes on Temu.
 * Checks every code with Temu first; if any is already used elsewhere, sets none.
 */
async function setSkuCodes(ctx) {
    const goodsId = String(ctx.params.goodsId)
    const codes = (Array.isArray(ctx.body?.codes) ? ctx.body.codes : [])
      .map((c) => ({ skuId: String(c.skuId || '').trim(), code: String(c.code || '').trim() }))
      .filter((c) => /^\d+$/.test(c.skuId) && c.code)
    if (!codes.length) throw new HttpError(400, { error: 'Enter at least one SKU code.' })
    const shop = await temuShopForGoods(ctx, goodsId)
    const temu = require('../../service')
    return marketplaceManager.withShopToken(shop, async (token) => {
      const checked = await temu.call('bg.local.goods.sku.out.sn.check', { access_token: token, outSkuSnList: codes.map((c) => c.code) })
      const taken = (checked.resultList || []).filter((r) => r.isDuplicate)
      if (taken.length) {
        throw new HttpError(400, { error: `Already used on Temu, nothing was saved: ${taken.map((r) => `${r.outSkuSn} (SKU ${r.duplicateSkuId})`).join(', ')}.` })
      }
      const set = await temu.call('bg.local.goods.sku.out.sn.set', { access_token: token, modifyList: codes.map((c) => ({ goodsId: Number(goodsId), skuId: Number(c.skuId), outSkuSn: c.code })) })
      const failed = (set.resultList || []).filter((r) => r.modifySuccess === false)
      const saved = codes.length - failed.length
      return { message: `Saved ${saved} seller code${saved === 1 ? '' : 's'} on Temu.${failed.length ? ` Not saved: ${failed.map((r) => r.outSkuSn).join(', ')}.` : ''}` }
    })
}

module.exports = { temuDetail, setSkuCodes, list, counts, importFromUrl, fillAttributes, categories, get, create, update, remove, listOnShop, listingAction, sync, updatePrice }
