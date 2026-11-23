const express = require('express')

const router = express.Router()

const registry = require('../../marketplaces')

router.get('/health', (req, res) => {
  res.json({ message: 'OK — backend is running' })
})

// Each shop's public endpoints (webhooks, eBay account deletion), in registry order.
for (const adapter of registry.all()) adapter.routes?.(router)

module.exports = router
