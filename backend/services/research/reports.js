/** Generated from routes/research/research.js: business logic behind the routes; routes only handle HTTP. */
const mongoose = require('mongoose')
const ResearchReport = require('../../models/ResearchReport')
const Product = require('../../models/Product')
const Shop = require('../../models/Shop')
const Listing = require('../../models/Listing')
const registry = require('../../marketplaces')

const { canonical: canonicalMarketplace } = registry
const { runDiscoveryAgent } = require('../../agent/discovery/discoveryAgent')
const { productImages } = require('../../agent/discovery/listingImage')
const cache = require('../core/cache')
const { getAiConfig } = require('../../services/system/aiSettings')
const { HttpError } = require('../../utils/httpError')
const { generateRecommendationsExcel, verifiedLinks } = require('../catalog/excelExport')
const { newSku } = require('../../utils/sku')

const SHOP_LABELS = registry.labels()

/**
 * Every shop's product made from this opportunity: products are per shop, so the same
 * opportunity added to eBay and Temu has two products (found by the stored id or the source page).
 */
async function oppProducts(opp, extra = {}) {
  const or = []
  if (opp.addedProductId) or.push({ _id: opp.addedProductId })
  if (opp.listingUrl) or.push({ source: 'research_bot', 'attributes.listingUrl': opp.listingUrl })
  if (!or.length) return []
  return Product.find({ $or: or, ...extra }).select('_id marketplace sku stock title')
}

async function syncReportOpportunities(report) {
  if (!report || !Array.isArray(report.opportunities) || report.opportunities.length === 0) return false
  let changed = false
  // The same item often turns up again in a later research run. Link it to the product already
  // made from it (same source listing URL), so it shows as listed instead of being listed twice.
  const unlinkedUrls = [...new Set(report.opportunities.filter((opp) => !opp.addedProductId && opp.listingUrl).map((opp) => opp.listingUrl))]
  if (unlinkedUrls.length) {
    const existing = await Product.find({ source: 'research_bot', 'attributes.listingUrl': { $in: unlinkedUrls } })
      .select('_id attributes.listingUrl').sort({ createdAt: 1 }).lean()
    const productByUrl = new Map()
    for (const prod of existing) {
      const url = prod.attributes?.listingUrl
      if (url && !productByUrl.has(url)) productByUrl.set(url, prod._id)
    }
    for (const opp of report.opportunities) {
      if (!opp.addedProductId && productByUrl.has(opp.listingUrl)) {
        opp.addedProductId = productByUrl.get(opp.listingUrl)
        changed = true
      }
    }
  }
  // Runs can find the same item on a different store page; fall back to the exact title.
  const unlinkedTitles = [...new Set(report.opportunities.filter((opp) => !opp.addedProductId && opp.title).map((opp) => opp.title.trim()))]
  if (unlinkedTitles.length) {
    const existing = await Product.find({ source: 'research_bot', title: { $in: unlinkedTitles } })
      .select('_id title').sort({ createdAt: 1 }).lean()
    const productByTitle = new Map()
    for (const prod of existing) if (!productByTitle.has(prod.title)) productByTitle.set(prod.title, prod._id)
    for (const opp of report.opportunities) {
      const title = opp.title?.trim()
      if (!opp.addedProductId && title && productByTitle.has(title)) {
        opp.addedProductId = productByTitle.get(title)
        changed = true
      }
    }
  }
  for (const opp of report.opportunities) {
    if (opp.addedProductId) {
      const prods = await oppProducts(opp)
      if (!prods.length) {
        opp.addedProductId = null
        if (opp.listedShops && opp.listedShops.length > 0) {
          opp.listedShops = []
        }
        changed = true
      } else {
        const activeListings = await Listing.find({
          productId: { $in: prods.map((row) => row._id) },
          status: { $in: ACTIVE_LISTING },
        }).select('marketplace')
        const activeMarkets = [...new Set(activeListings.map((l) => l.marketplace))]
        const currentMarkets = opp.listedShops || []
        const isSame = currentMarkets.length === activeMarkets.length && currentMarkets.every((m) => activeMarkets.includes(m))
        if (!isSame) {
          opp.listedShops = activeMarkets
          changed = true
        }
      }
    } else if (opp.listedShops && opp.listedShops.length > 0) {
      opp.listedShops = []
      changed = true
    }
  }
  if (changed) {
    report.markModified('opportunities')
    await report.save().catch((err) => console.warn('[research] Failed to save synced opportunities:', err.message))
  }
  return changed
}

/** Sub-admins may list on a marketplace when one of their shops (by marketplace or by direct grant) is on it. */
function canListOn(req, marketplace) {
  if (req.user.role !== 'sub_admin') return true
  return [...(req.shopMarkets?.values() || [])].includes(marketplace)
}

const ACTIVE_LISTING = ['live', 'pending', 'out_of_stock']

const RELISTABLE = ['ended', 'paused']

/**
 * Opportunities as sent to the browser, each with `relistShops`: shops where its product has an
 * ended listing (and no active one), so listing there again relists that listing.
 */
async function withShopState(opportunities) {
  const productIds = opportunities.map((opp) => opp.addedProductId).filter(Boolean)
  const ended = productIds.length
    ? await Listing.find({ productId: { $in: productIds }, status: { $in: RELISTABLE } }).select('productId marketplace').lean()
    : []
  return opportunities.map((opp) => {
    const plain = typeof opp.toObject === 'function' ? opp.toObject() : opp
    const listed = plain.listedShops || []
    const relistShops = [...new Set(ended
      .filter((row) => String(row.productId) === String(plain.addedProductId) && !listed.includes(row.marketplace))
      .map((row) => row.marketplace))]
    return { ...plain, relistShops }
  })
}

/** Sub-admins may only stop or delete research runs they started themselves. */
function ownsReport(req, report) {
  if ((req.authUser || req.user).role !== 'sub_admin') return true
  return Boolean(report.runBy) && String(report.runBy) === String(req.user.id)
}

/** GET /reports */
async function listReports(_ctx) {
    const reports = await ResearchReport.find()
      .sort({ createdAt: -1 })
      .limit(50)
    return reports
}

/** GET /recommendations/:reportId */
async function recommendations(ctx) {
    const { reportId } = ctx.params
    if (!mongoose.isValidObjectId(reportId)) {
      throw new HttpError(404, { error: 'Report not found' })
    }
    const report = await ResearchReport.findById(reportId)
    if (!report) {
      throw new HttpError(404, { error: 'Report not found' })
    }
    await syncReportOpportunities(report)
    const docs = report.opportunities || []
    let imagesAdded = false
    await Promise.all(docs.map(async (opp) => {
      if (opp.image) return
      // A product with no photo found is looked up again at most every 6 hours, not on every open.
      if (!(await cache.claim(`discovery:img:${report._id}:${opp._id || opp.rank || opp.title}`, 6 * 3600))) return
      const pages = [opp.listingUrl, ...(opp.sources || []).map((source) => source.url)].filter(Boolean)
      const images = await productImages({ hinted: opp.images || [], pages, title: opp.title })
      if (!images.length) return
      opp.image = images[0]
      opp.images = images
      imagesAdded = true
    }))
    if (imagesAdded) await report.save()
    return await withShopState(docs)
}

/** GET /report/:reportId */
async function report(ctx) {
    const { reportId } = ctx.params
    if (!mongoose.isValidObjectId(reportId)) {
      throw new HttpError(404, { error: 'Report not found' })
    }
    const report = await ResearchReport.findById(reportId)
    if (!report) {
      throw new HttpError(404, { error: 'Report not found' })
    }
    await syncReportOpportunities(report)

    return {
      report,
      recommendations: await withShopState(report.opportunities || []),
    }
}

/** GET /status/:reportId */
async function status(ctx) {
    const { reportId } = ctx.params
    if (!mongoose.isValidObjectId(reportId)) {
      throw new HttpError(400, { error: 'Invalid report ID' })
    }
    const report = await ResearchReport.findById(reportId).select(
      'status progress error summary startedAt finishedAt createdAt params reportDate',
    )
    if (!report) {
      throw new HttpError(404, { error: 'Report not found' })
    }
    return report
}

/** POST /stop/:reportId */
async function stop(ctx) {
    const { reportId } = ctx.params
    if (!mongoose.isValidObjectId(reportId)) {
      throw new HttpError(400, { error: 'Invalid report ID' })
    }

    const current = await ResearchReport.findById(reportId).select('status opportunities runBy')
    if (!current) {
      throw new HttpError(404, { error: 'Report not found' })
    }
    if (!ownsReport(ctx, current)) throw new HttpError(403, { error: 'Only the person who started this search can stop it.' })
    if (!['queued', 'running', 'stopping'].includes(current.status)) {
      throw new HttpError(409, { error: 'This search has already finished.', status: current.status })
    }

    const found = current.opportunities?.length || 0
    const stopped = await ResearchReport.findOneAndUpdate(
      { _id: reportId, status: { $in: ['queued', 'running', 'stopping'] } },
      {
        $set: {
          status: 'stopped',
          finishedAt: new Date(),
          summary: found
            ? `Search stopped. ${found} product${found === 1 ? '' : 's'} saved.`
            : 'Search stopped before any products were saved.',
          'progress.stage': 'Stopped',
          'progress.currentItem': 'Search stopped. Products found so far were saved.',
        },
      },
      { new: true },
    )
    if (!stopped) {
      throw new HttpError(409, { error: 'This search has already finished.' })
    }
    return stopped
}

/** DELETE /reports/:reportId */
async function deleteReport(ctx) {
    const { reportId } = ctx.params
    if (!mongoose.isValidObjectId(reportId)) {
      throw new HttpError(400, { error: 'Invalid report ID' })
    }
    const report = await ResearchReport.findById(reportId).select('runBy')
    if (!report) {
      throw new HttpError(404, { error: 'Report not found' })
    }
    if (!ownsReport(ctx, report)) throw new HttpError(403, { error: 'Only the person who started this search can delete it.' })
    await ResearchReport.deleteOne({ _id: reportId })
    return { ok: true }
}

/** POST /generate */
async function generate(ctx) {
    const { categories: rawCategories, category, niche, instructions, targetMarketplaces: rawTargetMarketplaces } = ctx.body

    const validMarkets = registry.KEYS.map(registry.urlId)
    const targetMarketplaces = Array.isArray(rawTargetMarketplaces) && rawTargetMarketplaces.length
      ? rawTargetMarketplaces.map((m) => String(m).toLowerCase().trim()).filter((m) => validMarkets.includes(m))
      : [validMarkets[0]]

    // Accept both { categories: [...] } and legacy { category: "..." }
    const categories = Array.isArray(rawCategories) && rawCategories.length
      ? rawCategories.map((c) => c.trim()).filter(Boolean)
      : category?.trim()
        ? [category.trim()]
        : []

    if (!categories.length) {
      throw new HttpError(400, { error: 'At least one product category is required' })
    }

    const aiConfig = await getAiConfig()
    if (!aiConfig.apiKey) {
      throw new HttpError(503, {
        error: 'OpenAI API key is not configured. Add it in Settings > AI agent.',
      })
    }

    // Rate Limit / Concurrency guard: Check if a run is already queued or running
    const activeRun = await ResearchReport.findOne({
      status: { $in: ['queued', 'running'] },
    })
    if (activeRun) {
      throw new HttpError(409, {
        error: 'A research run is already in progress. Please wait for it to complete.',
        activeReportId: activeRun._id,
      })
    }

    // Create the parent ResearchReport record initially with reportDate = null
    const report = await ResearchReport.create({
      runBy: ctx.user?.id || null,
      trigger: 'manual',
      reportDate: null,
      params: {
        marketplaces: targetMarketplaces,
        categories,
        category: categories[0],
        keywords: niche ? [niche] : [],
        instructions: instructions?.trim() || '',
        model: aiConfig.model,
      },
      status: 'queued',
      startedAt: new Date(),
    })

    // Run the agent asynchronously
    setImmediate(() => {
      runDiscoveryAgent({
        categories,
        niche: niche?.trim() || '',
        instructions: instructions?.trim() || '',
        marketplaces: targetMarketplaces,
        reportId: report._id,
        user: ctx.user,
      }).catch((err) => {
        console.error('[research route] Agent run failed:', err.message)
      })
    })

    // Answer at once so the UI can start polling; the agent runs after this returns.
    return {
      _id: report._id,
      status: 'queued',
      message: 'Research job queued. Poll /api/research/status/:id for updates.',
      params: report.params,
      createdAt: report.createdAt,
    }

}

/** POST /relist */
async function relist(ctx) {
    const { reportId, rank } = ctx.body
    const marketplace = canonicalMarketplace(ctx.body.marketplace)
    if (!reportId || rank == null || !marketplace) throw new HttpError(400, { error: 'reportId, rank and marketplace are required' })
    if (!canListOn(ctx, marketplace)) {
      throw new HttpError(403, { error: `You do not have permission to list on ${SHOP_LABELS[marketplace] || marketplace}` })
    }
    const report = await ResearchReport.findById(reportId)
    if (!report) throw new HttpError(404, { error: 'Research report not found' })
    await syncReportOpportunities(report)
    const opp = report.opportunities.find((o) => o.rank === Number(rank))
    const [own] = opp ? await oppProducts(opp, { marketplace }) : []
    if (!own) throw new HttpError(404, { error: 'This product has not been listed before.' })

    const shopFilter = { marketplace, status: 'connected' }
    if (ctx.user.role === 'sub_admin') shopFilter._id = { $in: ctx.allowedShopIds }
    const shop = await Shop.findOne(shopFilter)
    if (!shop) throw new HttpError(404, { error: `No connected ${SHOP_LABELS[marketplace] || marketplace} shop` })
    const listing = await Listing.findOne({ productId: own._id, shopId: shop._id, status: { $in: RELISTABLE } })
    if (!listing) throw new HttpError(404, { error: `No ended ${SHOP_LABELS[marketplace] || marketplace} listing to relist.` })
    const product = own
    const quantity = Math.floor(Number(product?.stock) || 0)
    if (quantity < 1) {
      throw new HttpError(400, { error: `"${product?.title || 'This product'}" has no stock. Add stock in Inventory, then relist it.` })
    }

    const app = registry.get(shop.marketplace).app
    const result = await app.catalog.listingAction(shop, listing, 'relist', { quantity })
    const { listingUrl } = require('../../marketplaces')
    listing.status = result.status || 'live'
    if (result.marketplaceStatus) listing.marketplaceStatus = result.marketplaceStatus
    if (result.externalListingId) listing.externalListingId = result.externalListingId
    listing.listingUrl = listingUrl(shop.marketplace, listing.externalListingId, listing.listingUrl, { status: listing.status })
    listing.stock = quantity
    listing.syncError = null
    listing.lastSyncedAt = new Date()
    await listing.save()
    await app.catalog.remember(shop._id, [product?.sku, listing.externalListingId, `EBAY-${listing.externalListingId}`])
    await require('../../services/core/notify').listingStatusChanged(listing, shop, {}).catch(() => {})
    await syncReportOpportunities(report)
    return { success: true, listedShops: opp.listedShops || [], listingUrl: listing.listingUrl }
}

/** POST /add-to-catalog */
async function addToCatalog(ctx) {
    const { reportId, rank, title, price, stock, description, marketplace: rawMarketplace } = ctx.body
    const marketplace = canonicalMarketplace(rawMarketplace)
    if (!reportId || rank == null) {
      throw new HttpError(400, { error: 'reportId and rank are required' })
    }
    if (!marketplace) {
      throw new HttpError(400, { error: 'Select eBay, TikTok Shop, or Temu Shop' })
    }

    if (!canListOn(ctx, marketplace)) {
      throw new HttpError(403, { error: `You do not have permission to list on ${SHOP_LABELS[marketplace] || marketplace}` })
    }

    const report = await ResearchReport.findById(reportId)
    if (!report) {
      throw new HttpError(404, { error: 'Research report not found' })
    }

    // Fresh listed state (and any product made from this item in another run) before listing.
    await syncReportOpportunities(report)
    const opp = report.opportunities.find((o) => o.rank === Number(rank))
    if (!opp) {
      throw new HttpError(404, { error: `Opportunity with rank ${rank} not found in report` })
    }
    if ((opp.listedShops || []).includes(marketplace)) {
      throw new HttpError(409, { error: `This product is already listed on ${SHOP_LABELS[marketplace] || marketplace}.`, listedShops: opp.listedShops })
    }
    // An ended listing is put back on sale with Relist, never listed a second time.
    const [own] = await oppProducts(opp, { marketplace })
    if (own && await Listing.exists({ productId: own._id, marketplace, status: { $in: RELISTABLE } })) {
      throw new HttpError(409, { error: `This product has an ended ${SHOP_LABELS[marketplace] || marketplace} listing. Relist it instead of listing it again.`, relist: true })
    }

    // Each shop has its own product: reuse this shop's, never another shop's.
    let product = own ? await Product.findById(own._id) : null

    const sellingPrice = price != null ? Number(price) : opp.metrics?.averagePrice ?? opp.metrics?.price ?? 0
    // The agent's sourcing cost, when it found one, becomes the base price (margin in every shop's form).
    const costOf = [opp.sourcing?.unitCost, opp.sourcing?.landedCost, opp.metrics?.estimatedCost].map(Number).find((n) => Number.isFinite(n) && n > 0)
    const estCost = costOf ?? 0
    const savedImages = Array.isArray(opp.images) && opp.images.length
      ? opp.images
      : opp.image
        ? [opp.image]
        : []
    // Specs found by the agent become item specifics, so each shop's List form starts filled in.
    const specifics = Object.fromEntries((opp.specs || [])
      .filter((spec) => spec?.name && spec?.value)
      .map((spec) => [String(spec.name).trim(), String(spec.value).trim()]))
    const highlights = (opp.highlights || []).filter(Boolean)
    const baseDescription = description || opp.description || opp.title
    const fullDescription = highlights.length
      ? `${baseDescription}\n\n${highlights.map((line) => `- ${line}`).join('\n')}`
      : baseDescription

    if (!product) {
      // Each shop shapes its own title (length and style) from the agent's facts; the rest is shared.
      const shopHooks = registry.get(marketplace)?.hooks
      const shaped = typeof shopHooks?.researchListing === 'function'
        ? await shopHooks.researchListing({ title: title || opp.title, description: fullDescription, brand: opp.brand || '' }).catch(() => null)
        : null
      const { specMeasurements } = require('./measurements')
      product = await Product.create({
        marketplace,
        title: shaped?.title || title || opp.title,
        ...specMeasurements(opp.specs),
        ...(costOf ? { costPrice: costOf } : {}),
        description: fullDescription,
        category: opp.metrics?.category || opp.category || 'General',
        brand: opp.brand || 'Unbranded',
        condition: 'NEW',
        images: savedImages,
        basePrice: sellingPrice,
        stock: stock != null ? Math.max(0, Number(stock) || 0) : 0,
        lowStockThreshold: 10,
        status: 'draft',
        source: 'research_bot',
        sourceReportId: report._id,
        createdBy: ctx.user.id,
        attributes: {
          ...specifics,
          ...(opp.brand ? { Brand: opp.brand } : {}),
          targetMarketplace: marketplace,
          aiOpportunityScore: opp.opportunityScore,
          listingUrl: opp.listingUrl,
          estimatedCost: estCost,
        },
      })
      opp.addedProductId = product._id
      await report.save()
    }

    const shop = await Shop.findOne({ marketplace, status: 'connected' }).select('_id')
    const capabilities = registry.get(marketplace).app.catalog.capabilities()
    return {
      product,
      listedShops: opp.listedShops || [],
      shopConnected: Boolean(shop),
      canList: Boolean(shop && capabilities.canList),
      message: !shop
        ? `Saved to Products. Connect ${SHOP_LABELS[marketplace] || marketplace} in Settings to list it.`
        : !capabilities.canList
          ? `Saved to Products. ${capabilities.note}`
          : '',
    }
}

/** GET /export/:reportId: the report as a CSV or Excel download (`{ headers, body }`). */
async function exportReport(ctx) {
  const { reportId } = ctx.params
  const format = (ctx.query.format || 'xlsx').toLowerCase()

  if (!mongoose.isValidObjectId(reportId)) {
    throw new HttpError(400, { error: 'Invalid report ID' })
  }

  const report = await ResearchReport.findById(reportId)
  if (!report) {
    throw new HttpError(404, { error: 'Report not found' })
  }

  const recommendations = report.opportunities || []
  if (!recommendations.length) {
    throw new HttpError(404, { error: 'No recommendations found for this report' })
  }

  if (format === 'csv') {
    const headers = [
      'sku',
      'title',
      'description',
      'category',
      'brand',
      'basePrice',
      'currency',
      'stock',
      'lowStockThreshold',
      'weight',
      'status',
      'source',
      'sourceUrl',
      'listingUrl',
      'otherUrl',
      'estimatedMarginPercent',
      'opportunityScore',
    ]

    // Protect against CSV formula injection
    const sanitizeCell = (val) => {
      if (val == null || val === '') return '""'
      let str = String(val).trim()
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`
      }
      return `"${str.replace(/"/g, '""')}"`
    }

    const rows = recommendations.map((r) => {
      const title = r.title || r.productName || ''
      const category = r.category || r.metrics?.category || ''
      const basePrice = r.metrics?.price != null ? r.metrics.price : (r.price ?? r.metrics?.averagePrice ?? '')
      const description = r.aiNotes || r.recommendationReason || ''
      const { sourceUrl, listingUrl, otherUrl } = verifiedLinks(r)
      const margin = r.estimatedMargin != null ? r.estimatedMargin : (r.estimatedProfitMarginPercent ?? '')
      const score = r.opportunityScore ?? ''

      // Generate clean preview SKU using official marketplace format
      const sku = newSku(r.targetMarketplace || registry.KEYS[0])

      return [
        sanitizeCell(sku),
        sanitizeCell(title),
        sanitizeCell(description),
        sanitizeCell(category),
        sanitizeCell(''), // brand (left blank for client to customize)
        basePrice !== '' ? Number(basePrice) : '',
        'USD',
        0, // stock (draft items default to 0)
        5, // lowStockThreshold
        1, // weight
        'draft',
        'research_bot',
        sanitizeCell(sourceUrl),
        sanitizeCell(listingUrl),
        sanitizeCell(otherUrl),
        margin !== '' ? Number(margin) : '',
        score !== '' ? Number(score) : '',
      ]
    })

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const safeName = `product_catalog_export_${reportId.slice(-8)}.csv`
    return {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${safeName}"` },
      body: csvContent,
    }
  }

  const categories = report.params?.categories || [report.params?.category].filter(Boolean)
  const niche = report.params?.keywords?.[0] || ''

  const buffer = await generateRecommendationsExcel(recommendations, {
    categories,
    niche,
    generatedAt: report.finishedAt || report.createdAt,
  })

  const safeName = `product_recommendations_${reportId.slice(-8)}.xlsx`
  return {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': buffer.length,
    },
    body: buffer,
  }
}

module.exports = { exportReport, listReports, recommendations, report, status, stop, deleteReport, generate, relist, addToCatalog }
