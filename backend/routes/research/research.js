const express = require('express')
const mongoose = require('mongoose')
const { requireAuth, loadAccess, requireMainRoute, requireRole } = require('../../middleware/auth')
const ResearchReport2 = require('../../models/ResearchReport2')
const Product = require('../../models/Product')
const Shop = require('../../models/Shop')
const Listing = require('../../models/Listing')
const marketplaceManager = require('../../services/marketplace')
const { canonicalMarketplace } = require('../../utils/marketplace')
const { runDiscoveryAgent } = require('../../agent/discovery/discoveryAgent')
const { productImages } = require('../../agent/discovery/listingImage')
const { generateRecommendationsExcel, verifiedLinks } = require('../../services/excelExport')

const SHOP_LABELS = {
  ebay: 'eBay',
  tiktok_shop: 'TikTok Shop',
  temu: 'Temu Shop',
}

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('market-research'))

// ─── GET /api/research/reports — list all reports ────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    const reports = await ResearchReport2.find()
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
    const report = await ResearchReport2.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }
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
    res.json(docs)
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
    const report = await ResearchReport2.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    res.json({
      report,
      recommendations: report.opportunities || [],
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
    const report = await ResearchReport2.findById(reportId).select(
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

    const report = await ResearchReport2.findById(reportId)
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

        // Generate clean preview SKU consistent with Product model pattern
        const catClean = (category || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'GEN'
        const sku = `BOT-${catClean}-${Date.now().toString().slice(-4)}${i + 1}`

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

    const current = await ResearchReport2.findById(reportId).select('status opportunities')
    if (!current) {
      return res.status(404).json({ error: 'Report not found' })
    }
    if (!['queued', 'running', 'stopping'].includes(current.status)) {
      return res.status(409).json({ error: 'This search has already finished.', status: current.status })
    }

    const found = current.opportunities?.length || 0
    const stopped = await ResearchReport2.findOneAndUpdate(
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
    const report = await ResearchReport2.findByIdAndDelete(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }
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

    // Accept both { categories: [...] } and legacy { category: "..." }
    const categories = Array.isArray(rawCategories) && rawCategories.length
      ? rawCategories.map((c) => c.trim()).filter(Boolean)
      : category?.trim()
        ? [category.trim()]
        : []

    if (!categories.length) {
      return res.status(400).json({ error: 'At least one product category is required' })
    }

    // Check if OPENAI_API or OPENAI_API_KEY is configured
    if (!process.env.OPENAI_API && !process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: 'OpenAI API key is not configured. Please set OPENAI_API in your environment variables.',
      })
    }

    // Rate Limit / Concurrency guard: Check if a run is already queued or running
    const activeRun = await ResearchReport2.findOne({
      status: { $in: ['queued', 'running'] },
    })
    if (activeRun) {
      return res.status(409).json({
        error: 'A research run is already in progress. Please wait for it to complete.',
        activeReportId: activeRun._id,
      })
    }

    // Client's target selling marketplaces (e.g. ['ebay', 'tiktok', 'temu'])
    const validMarkets = ['ebay', 'tiktok', 'temu']
    const targetMarketplaces = Array.isArray(rawTargetMarketplaces) && rawTargetMarketplaces.length
      ? rawTargetMarketplaces.map((m) => String(m).toLowerCase().trim()).filter((m) => validMarkets.includes(m))
      : ['ebay']

    // Create the parent ResearchReport2 record initially with reportDate = null
    const report = await ResearchReport2.create({
      runBy: req.user?.id || null,
      trigger: 'manual',
      reportDate: null,
      params: {
        marketplaces: targetMarketplaces,
        categories,
        category: categories[0],
        keywords: niche ? [niche] : [],
        instructions: instructions?.trim() || '',
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

// ─── POST /api/research/add-to-catalog — convert opportunity to catalog product
router.post('/add-to-catalog', requireRole('super_admin'), async (req, res) => {
  try {
    const { reportId, rank, title, price, stock, description, marketplace: rawMarketplace } = req.body
    const marketplace = canonicalMarketplace(rawMarketplace)
    if (!reportId || rank == null) {
      return res.status(400).json({ error: 'reportId and rank are required' })
    }
    if (!marketplace) {
      return res.status(400).json({ error: 'Select eBay, TikTok Shop, or Temu Shop' })
    }

    const report = await ResearchReport2.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Research report not found' })
    }

    const opp = report.opportunities.find((o) => o.rank === Number(rank))
    if (!opp) {
      return res.status(404).json({ error: `Opportunity with rank ${rank} not found in report` })
    }

    let product = opp.addedProductId ? await Product.findById(opp.addedProductId) : null

    // Generate collision-resistant unique SKU with crypto random suffix
    const catPrefix = (opp.metrics?.category || opp.category || 'GEN')
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, 'X')
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
    const sku = `BOT-${catPrefix}-${Date.now().toString().slice(-4)}${randomSuffix}`

    const sellingPrice = price != null ? Number(price) : opp.metrics?.averagePrice ?? opp.metrics?.price ?? 0
    const estCost = opp.metrics?.estimatedCost != null ? Number(opp.metrics.estimatedCost) : 0

    // Safely default stock to 0 to prevent ghost marketplace listing
    const safeStock = stock != null ? Number(stock) : 0

    const savedImages = Array.isArray(opp.images) && opp.images.length
      ? opp.images
      : opp.image
        ? [opp.image]
        : []

    if (!product) {
      product = await Product.create({
        sku,
        title: title || opp.title,
        description: description || opp.description || opp.title,
        category: opp.metrics?.category || opp.category || 'General',
        brand: opp.brand || 'Unbranded',
        images: savedImages,
        basePrice: sellingPrice,
        stock: safeStock,
        lowStockThreshold: 10,
        status: 'draft',
        source: 'research_bot',
        sourceReportId: report._id,
        attributes: {
          aiOpportunityScore: opp.opportunityScore,
          targetMarketplace: marketplace,
          listingUrl: opp.listingUrl,
          estimatedCost: estCost,
        },
      })
      opp.addedProductId = product._id
    }

    const listed = new Set(opp.listedShops || [])
    listed.add(marketplace)
    opp.listedShops = [...listed]
    await report.save()

    const shopLabel = SHOP_LABELS[marketplace] || marketplace
    const shop = await Shop.findOne({ marketplace }).select('+auth.accessTokenEnc')
    let listing = null
    let publishError = ''
    if (shop) {
      try {
        const publishRes = await marketplaceManager.publishListing(shop, product, {
          price: sellingPrice,
          title: product.title,
          description: product.description,
          images: product.images,
          brand: product.brand,
          condition: 'NEW',
        })
        listing = await Listing.findOneAndUpdate(
          { productId: product._id, shopId: shop._id },
          {
            productId: product._id,
            shopId: shop._id,
            marketplace,
            ...(publishRes?.externalListingId ? { externalListingId: publishRes.externalListingId } : {}),
            price: sellingPrice,
            status: publishRes?.status || 'pending',
            syncError: null,
            lastSyncedAt: new Date(),
          },
          { new: true, upsert: true, runValidators: true },
        )
      } catch (apiErr) {
        publishError = apiErr.message
        listing = await Listing.findOneAndUpdate(
          { productId: product._id, shopId: shop._id },
          {
            productId: product._id,
            shopId: shop._id,
            marketplace,
            price: sellingPrice,
            status: 'error',
            syncError: publishError,
            lastSyncedAt: new Date(),
          },
          { new: true, upsert: true, runValidators: true },
        )
      }
    }

    const message = !shop
      ? `Saved for ${shopLabel}. Connect ${shopLabel} in Settings to publish the listing.`
      : publishError
        ? `Saved for ${shopLabel}. The shop has not published it yet.`
        : `Listed on ${shopLabel}.`

    res.status(201).json({
      product,
      listing,
      listedShops: opp.listedShops,
      shopConnected: Boolean(shop),
      message,
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
