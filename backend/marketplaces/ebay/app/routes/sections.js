const express = require('express')
const { requireAuth, loadAccess, canUseSection } = require('../../../../middleware/auth')
const { onlyShop } = require('../../../../middleware/shopScope')
const Shop = require('../../../../models/Shop')
const marketplaceManager = require('../manager')
const profiles = require('../../../../services/marketplace/profiles')
const service = require('../services/sections')
const { HttpError, ctxOf } = require('../../../../utils/httpError')
const ADAPTER = require('../..')
const SERVICE = ADAPTER.service

/**
 * Guards a shop-section write: the user needs the section's main route and, when they have a
 * restricted `allowedSections` list, the section itself on that marketplace.
 */
function sectionGuard(sectionId) {
  return (req, res, next) => {
    const marketplace = 'ebay'
    const section = profiles.PROFILES[marketplace]?.sections.find((item) => item.id === sectionId)
    if (!section || !canUseSection(req.authUser || req.user, marketplace, sectionId, section.route)) {
      return res.status(403).json({ error: `You do not have access to ${section?.label || sectionId} on this shop` })
    }
    next()
  }
}

async function findConnectedShop(req, res, marketplace) {
  const filter = { marketplace, status: 'connected' }
  if (req.user.role === 'sub_admin') filter._id = { $in: req.allowedShopIds || [] }
  const shop = await Shop.findOne(filter)
  if (shop) return shop
  if (req.user.role === 'sub_admin' && await Shop.exists({ marketplace, status: 'connected' })) {
    res.status(403).json({ error: 'You do not have permission for this shop' })
  } else {
    res.status(404).json({ error: `No connected ${marketplace} shop` })
  }
  return null
}

/** /api/<shop>/sections: the shop's own sections (returns, promotions, offers, fulfillment, ...). */
function sectionsRoutes(shopKey) {
  const router = express.Router()
  router.use(requireAuth, loadAccess, onlyShop(shopKey))

  // GET /api/<shop>/sections/:sectionId?marketplace=ebay — data for a shop-specific section.
  router.get('/:sectionId', async (req, res) => {
    try {
      res.json(await service.section(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/offers/send — send discount offer to interested buyers on eBay
  router.post('/offers/send', sectionGuard('offers'), async (req, res) => {
    try {
      res.json(await service.sendOffer(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/returns/decide — approve or decline buyer return on eBay
  router.post('/returns-cases/decide', sectionGuard('returns-cases'), async (req, res) => {
    try {
      res.json(await service.decideReturn(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/offers/<offer-accept|offer-decline|offer-counter> — answer a buyer's Best Offer
  router.post('/offers/:actionId', sectionGuard('offers'), async (req, res) => {
    try {
      res.json(await service.offerAction(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/buyers/reply — reply to a buyer's feedback on eBay
  router.post('/buyers/reply', sectionGuard('buyers'), async (req, res) => {
    try {
      res.json(await service.replyToFeedback(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/returns-cases/<action> — mark received, refund, inquiry refund/tracking, accept dispute
  router.post('/returns-cases/:actionId', sectionGuard('returns-cases'), async (req, res) => {
    try {
      res.json(await service.caseAction(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/cancellations/decide — approve or reject cancellation request on eBay/TikTok
  router.post('/cancellations/decide', sectionGuard('returns-cases'), async (req, res) => {
    try {
      res.json(await service.decideCancellation(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/promotions/create — create promotional campaign on eBay/TikTok
  router.post('/promotions/create', sectionGuard('promotions'), async (req, res) => {
    try {
      res.json(await service.createPromotion(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/promotions/:id/pause — pause active promotion
  router.post('/promotions/:id/pause', sectionGuard('promotions'), async (req, res) => {
    try {
      res.json(await service.pausePromotion(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/promotions/:id/resume — resume paused promotion
  router.post('/promotions/:id/resume', sectionGuard('promotions'), async (req, res) => {
    try {
      res.json(await service.resumePromotion(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })

  // GET /api/<shop>/sections/fulfillment/:packageId/label — fetch package shipping document from TikTok Shop
  router.get('/fulfillment/:packageId/label', sectionGuard('fulfillment'), async (req, res) => {
    try {
      const marketplace = 'ebay'
      const shop = await findConnectedShop(req, res, marketplace)
      if (!shop) return

      const service = SERVICE
      if (typeof service.getShippingDocument !== 'function') {
        return res.status(400).json({ error: `${marketplace} does not support shipping document downloads` })
      }

      const doc = await marketplaceManager.withShopToken(shop, (token) =>
        service.getShippingDocument(token, req.params.packageId, { shop })
      )
      res.json(doc)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/fulfillment/:packageId/ship — ship a TikTok Shipping package (handover method)
  router.post('/fulfillment/:packageId/ship', sectionGuard('fulfillment'), async (req, res) => {
    try {
      res.json(await service.shipPackage(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(400).json({ error: err.message })
    }
  })
  // GET /api/<shop>/sections/:sectionId/:actionId?id= — a section file's own drill-down (after every named route).
  router.get('/:sectionId/:actionId', async (req, res) => {
    try {
      res.json(await service.sectionDetail(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(502).json({ error: err.message })
    }
  })

  // POST /api/<shop>/sections/:sectionId/:actionId {id, value} — a section file's own action.
  router.post('/:sectionId/:actionId', async (req, res) => {
    try {
      res.json(await service.sectionAction(ctxOf(req)))
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body)
      res.status(err.status && err.status < 500 ? err.status : 400).json({ error: err.message })
    }
  })

  return router
}

module.exports = sectionsRoutes
