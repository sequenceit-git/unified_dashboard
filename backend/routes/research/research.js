const express = require('express')
const mongoose = require('mongoose')
const { requireAuth, loadAccess, requireMainRoute, requireRole } = require('../../middleware/auth')
const ResearchReport = require('../../models/ResearchReport')
const Product = require('../../models/Product')
const Shop = require('../../models/Shop')
const Listing = require('../../models/Listing')
const marketplaceManager = require('../../services/marketplace')
const { canonicalMarketplace } = require('../../utils/marketplace')
const { runDiscoveryAgent } = require('../../agent/discovery/discoveryAgent')
const { productImages } = require('../../agent/discovery/listingImage')
const { generateRecommendationsExcel, verifiedLinks } = require('../../services/excelExport')
const { getAiConfig } = require('../../services/aiSettings')
const { newSku } = require('../../utils/sku')

const SHOP_LABELS = {
  ebay: 'eBay',
  tiktok_shop: 'TikTok Shop',
  temu: 'Temu Shop',
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
      const prod = await Product.findById(opp.addedProductId).select('_id')
      if (!prod) {
        opp.addedProductId = null
        if (opp.listedShops && opp.listedShops.length > 0) {
          opp.listedShops = []
        }
        changed = true
      } else {
        const activeListings = await Listing.find({
          productId: prod._id,
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

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('market-research'))

/** Sub-admins may only stop or delete research runs they started themselves. */
function ownsReport(req, report) {
  if ((req.authUser || req.user).role !== 'sub_admin') return true
  return Boolean(report.runBy) && String(report.runBy) === String(req.user.id)
}

// ─── GET /api/research/reports — list all reports ────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    const reports = await ResearchReport.find()
      .sort({ createdAt: -1 })
      .limit(50)
    res.json(reports)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/recommendations/:reportId ──────────────────────────────
router.get('/recommendations/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(404).json({ error: 'Report not found' })
    }
    const report = await ResearchReport.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }
    await syncReportOpportunities(report)
    const docs = report.opportunities || []
    let imagesAdded = false
    await Promise.all(docs.map(async (opp) => {
      if (opp.image) return
      const pages = [opp.listingUrl, ...(opp.sources || []).map((source) => source.url)].filter(Boolean)
      const images = await productImages({ hinted: opp.images || [], pages, title: opp.title })
      if (!images.length) return
      opp.image = images[0]
      opp.images = images
      imagesAdded = true
    }))
    if (imagesAdded) await report.save()
    res.json(await withShopState(docs))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/report/:reportId — consolidated full report ────────────
router.get('/report/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(404).json({ error: 'Report not found' })
    }
    const report = await ResearchReport.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }
    await syncReportOpportunities(report)

    res.json({
      report,
      recommendations: await withShopState(report.opportunities || []),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/status/:reportId — poll report generation status ───────
router.get('/status/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' })
    }
    const report = await ResearchReport.findById(reportId).select(
      'status progress error summary startedAt finishedAt createdAt params reportDate',
    )
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }
    res.json(report)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/export/:reportId — download Excel or CSV ──────────────
router.get('/export/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    const format = (req.query.format || 'xlsx').toLowerCase()

    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' })
    }

    const report = await ResearchReport.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    const recommendations = report.opportunities || []
    if (!recommendations.length) {
      return res.status(404).json({ error: 'No recommendations found for this report' })
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

      const rows = recommendations.map((r, i) => {
        const title = r.title || r.productName || ''
        const category = r.category || r.metrics?.category || ''
        const basePrice = r.metrics?.price != null ? r.metrics.price : (r.price ?? r.metrics?.averagePrice ?? '')
        const description = r.aiNotes || r.recommendationReason || ''
        const { sourceUrl, listingUrl, otherUrl } = verifiedLinks(r)
        const margin = r.estimatedMargin != null ? r.estimatedMargin : (r.estimatedProfitMarginPercent ?? '')
        const score = r.opportunityScore ?? ''

        // Generate clean preview SKU using official marketplace format
        const sku = newSku(r.targetMarketplace || 'ebay')

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
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
      return res.send(csvContent)
    }

    const categories = report.params?.categories || [report.params?.category].filter(Boolean)
    const niche = report.params?.keywords?.[0] || ''

    const buffer = await generateRecommendationsExcel(recommendations, {
      categories,
      niche,
      generatedAt: report.finishedAt || report.createdAt,
    })

    const safeName = `product_recommendations_${reportId.slice(-8)}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/research/stop/:reportId — stop a search that is still running ─
router.post('/stop/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' })
    }

    const current = await ResearchReport.findById(reportId).select('status opportunities runBy')
    if (!current) {
      return res.status(404).json({ error: 'Report not found' })
    }
    if (!ownsReport(req, current)) return res.status(403).json({ error: 'Only the person who started this search can stop it.' })
    if (!['queued', 'running', 'stopping'].includes(current.status)) {
      return res.status(409).json({ error: 'This search has already finished.', status: current.status })
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
      return res.status(409).json({ error: 'This search has already finished.' })
    }
    res.json(stopped)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── DELETE /api/research/reports/:reportId — remove a saved research run ────
router.delete('/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params
    if (!mongoose.isValidObjectId(reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' })
    }
    const report = await ResearchReport.findById(reportId).select('runBy')
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }
    if (!ownsReport(req, report)) return res.status(403).json({ error: 'Only the person who started this search can delete it.' })
    await ResearchReport.deleteOne({ _id: reportId })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/research/generate — trigger AI research run ───────────────────
//
// Body: { categories: string[], niche?: string, instructions?: string }
// (Legacy single-category: { category: string, niche?, instructions? })
//
// The agent runs asynchronously. The response immediately returns the new
// ResearchReport (status: 'queued'). The frontend should poll
// GET /api/research/status/:reportId to track progress.
//
router.post('/generate', async (req, res) => {
  try {
    const { categories: rawCategories, category, niche, instructions, targetMarketplaces: rawTargetMarketplaces } = req.body

    const validMarkets = ['ebay', 'tiktok', 'temu']
    const targetMarketplaces = Array.isArray(rawTargetMarketplaces) && rawTargetMarketplaces.length
      ? rawTargetMarketplaces.map((m) => String(m).toLowerCase().trim()).filter((m) => validMarkets.includes(m))
      : ['ebay']

    // Accept both { categories: [...] } and legacy { category: "..." }
    const categories = Array.isArray(rawCategories) && rawCategories.length
      ? rawCategories.map((c) => c.trim()).filter(Boolean)
      : category?.trim()
        ? [category.trim()]
        : []

    if (!categories.length) {
      return res.status(400).json({ error: 'At least one product category is required' })
    }

    const aiConfig = await getAiConfig()
    if (!aiConfig.apiKey) {
      return res.status(503).json({
        error: 'OpenAI API key is not configured. Add it in Settings > AI agent.',
      })
    }

    // Rate Limit / Concurrency guard: Check if a run is already queued or running
    const activeRun = await ResearchReport.findOne({
      status: { $in: ['queued', 'running'] },
    })
    if (activeRun) {
      return res.status(409).json({
        error: 'A research run is already in progress. Please wait for it to complete.',
        activeReportId: activeRun._id,
      })
    }

    // Create the parent ResearchReport record initially with reportDate = null
    const report = await ResearchReport.create({
      runBy: req.user?.id || null,
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

    // Respond immediately so the UI can start polling
    res.status(202).json({
      _id: report._id,
      status: 'queued',
      message: 'Research job queued. Poll /api/research/status/:id for updates.',
      params: report.params,
      createdAt: report.createdAt,
    })

    // Run the agent asynchronously
    setImmediate(() => {
      runDiscoveryAgent({
        categories,
        niche: niche?.trim() || '',
        instructions: instructions?.trim() || '',
        marketplaces: targetMarketplaces,
        reportId: report._id,
        user: req.user,
      }).catch((err) => {
        console.error('[research route] Agent run failed:', err.message)
      })
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/research/relist — put the product's ended listing back on sale ──
router.post('/relist', async (req, res) => {
  try {
    const { reportId, rank } = req.body
    const marketplace = canonicalMarketplace(req.body.marketplace)
    if (!reportId || rank == null || !marketplace) return res.status(400).json({ error: 'reportId, rank and marketplace are required' })
    if (!canListOn(req, marketplace)) {
      return res.status(403).json({ error: `You do not have permission to list on ${SHOP_LABELS[marketplace] || marketplace}` })
    }
    const report = await ResearchReport.findById(reportId)
    if (!report) return res.status(404).json({ error: 'Research report not found' })
    await syncReportOpportunities(report)
    const opp = report.opportunities.find((o) => o.rank === Number(rank))
    if (!opp?.addedProductId) return res.status(404).json({ error: 'This product has not been listed before.' })

    const shopFilter = { marketplace, status: 'connected' }
    if (req.user.role === 'sub_admin') shopFilter._id = { $in: req.allowedShopIds }
    const shop = await Shop.findOne(shopFilter)
    if (!shop) return res.status(404).json({ error: `No connected ${SHOP_LABELS[marketplace] || marketplace} shop` })
    const listing = await Listing.findOne({ productId: opp.addedProductId, shopId: shop._id, status: { $in: RELISTABLE } })
    if (!listing) return res.status(404).json({ error: `No ended ${SHOP_LABELS[marketplace] || marketplace} listing to relist.` })
    const product = await Product.findById(opp.addedProductId).select('sku stock title')
    const quantity = Math.floor(Number(product?.stock) || 0)
    if (quantity < 1) {
      return res.status(400).json({ error: `"${product?.title || 'This product'}" has no stock. Add stock in Inventory, then relist it.` })
    }

    const result = await marketplaceManager.applyListingAction(shop, listing, 'relist', { quantity })
    const { listingUrl } = require('../../utils/listingUrl')
    listing.status = result.status || 'live'
    if (result.marketplaceStatus) listing.marketplaceStatus = result.marketplaceStatus
    if (result.externalListingId) listing.externalListingId = result.externalListingId
    listing.listingUrl = listingUrl(shop.marketplace, listing.externalListingId, listing.listingUrl, { status: listing.status })
    listing.stock = quantity
    listing.syncError = null
    listing.lastSyncedAt = new Date()
    await listing.save()
    await marketplaceManager.rememberListing(shop._id, [product?.sku, listing.externalListingId, `EBAY-${listing.externalListingId}`])
    await require('../../services/notify').listingStatusChanged(listing, shop, {}).catch(() => {})
    await syncReportOpportunities(report)
    res.json({ success: true, listedShops: opp.listedShops || [], listingUrl: listing.listingUrl })
  } catch (err) {
    res.status(422).json({ error: err.message })
  }
})

// ─── POST /api/research/add-to-catalog — convert opportunity to catalog product
router.post('/add-to-catalog', async (req, res) => {
  try {
    const { reportId, rank, title, price, stock, description, marketplace: rawMarketplace } = req.body
    const marketplace = canonicalMarketplace(rawMarketplace)
    if (!reportId || rank == null) {
      return res.status(400).json({ error: 'reportId and rank are required' })
    }
    if (!marketplace) {
      return res.status(400).json({ error: 'Select eBay, TikTok Shop, or Temu Shop' })
    }

    if (!canListOn(req, marketplace)) {
      return res.status(403).json({ error: `You do not have permission to list on ${SHOP_LABELS[marketplace] || marketplace}` })
    }

    const report = await ResearchReport.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Research report not found' })
    }

    // Fresh listed state (and any product made from this item in another run) before listing.
    await syncReportOpportunities(report)
    const opp = report.opportunities.find((o) => o.rank === Number(rank))
    if (!opp) {
      return res.status(404).json({ error: `Opportunity with rank ${rank} not found in report` })
    }
    if ((opp.listedShops || []).includes(marketplace)) {
      return res.status(409).json({ error: `This product is already listed on ${SHOP_LABELS[marketplace] || marketplace}.`, listedShops: opp.listedShops })
    }
    // An ended listing is put back on sale with Relist, never listed a second time.
    if (opp.addedProductId && await Listing.exists({ productId: opp.addedProductId, marketplace, status: { $in: RELISTABLE } })) {
      return res.status(409).json({ error: `This product has an ended ${SHOP_LABELS[marketplace] || marketplace} listing. Relist it instead of listing it again.`, relist: true })
    }

    let product = opp.addedProductId ? await Product.findById(opp.addedProductId) : null

    const sellingPrice = price != null ? Number(price) : opp.metrics?.averagePrice ?? opp.metrics?.price ?? 0
    const estCost = opp.metrics?.estimatedCost != null ? Number(opp.metrics.estimatedCost) : 0
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
      product = await Product.create({
        title: title || opp.title,
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
    const capabilities = marketplaceManager.listingCapabilities(marketplace)
    res.status(201).json({
      product,
      listedShops: opp.listedShops || [],
      shopConnected: Boolean(shop),
      canList: Boolean(shop && capabilities.canList),
      message: !shop
        ? `Saved to Products. Connect ${SHOP_LABELS[marketplace] || marketplace} in Settings to list it.`
        : !capabilities.canList
          ? `Saved to Products. ${capabilities.note}`
          : '',
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
