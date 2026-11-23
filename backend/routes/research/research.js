const express = require('express')
const { requireAuth, loadAccess, requireMainRoute } = require('../../middleware/auth')

const service = require('../../services/research/reports')
const { HttpError, ctxOf } = require('../../utils/httpError')

const router = express.Router()
router.use(requireAuth, loadAccess, requireMainRoute('market-research'))

// ─── GET /api/research/reports — list all reports ────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    res.json(await service.listReports(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/recommendations/:reportId ──────────────────────────────
router.get('/recommendations/:reportId', async (req, res) => {
  try {
    res.json(await service.recommendations(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/report/:reportId — consolidated full report ────────────
router.get('/report/:reportId', async (req, res) => {
  try {
    res.json(await service.report(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/status/:reportId — poll report generation status ───────
router.get('/status/:reportId', async (req, res) => {
  try {
    res.json(await service.status(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/research/export/:reportId — download Excel or CSV ──────────────
router.get('/export/:reportId', async (req, res) => {
  try {
    const file = await service.exportReport(ctxOf(req))
    for (const [name, value] of Object.entries(file.headers)) res.setHeader(name, value)
    res.send(file.body)
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/research/stop/:reportId — stop a search that is still running ─
router.post('/stop/:reportId', async (req, res) => {
  try {
    res.json(await service.stop(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(500).json({ error: err.message })
  }
})

// ─── DELETE /api/research/reports/:reportId — remove a saved research run ────
router.delete('/reports/:reportId', async (req, res) => {
  try {
    res.json(await service.deleteReport(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
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
    res.status(202).json(await service.generate(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/research/relist — put the product's ended listing back on sale ──
router.post('/relist', async (req, res) => {
  try {
    res.json(await service.relist(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(422).json({ error: err.message })
  }
})

// ─── POST /api/research/add-to-catalog — convert opportunity to catalog product
router.post('/add-to-catalog', async (req, res) => {
  try {
    res.status(201).json(await service.addToCatalog(ctxOf(req)))
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body)
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
