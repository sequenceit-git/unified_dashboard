const express = require('express')
const { requireAuth, loadAccess, requireRole } = require('../../middleware/auth')
const { getPublicAiSettings, saveAiSettings } = require('../../services/aiSettings')

const router = express.Router()
router.use(requireAuth, loadAccess, requireRole('super_admin'))

// GET /api/settings/ai — model and whether a key is set (never the key)
router.get('/ai', async (req, res) => {
  try {
    res.json(await getPublicAiSettings())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/settings/ai — body: { model?, inboxModel?, apiKey?, clearApiKey? }
router.patch('/ai', async (req, res) => {
  try {
    const { model, inboxModel, apiKey, clearApiKey } = req.body || {}
    res.json(await saveAiSettings({ model, inboxModel, apiKey, clearApiKey: Boolean(clearApiKey) }, req.user?.id))
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

module.exports = router
