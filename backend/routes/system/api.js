const express = require('express')

const router = express.Router()

const crypto = require('crypto')

router.get('/health', (req, res) => {
  res.json({ message: 'OK — backend is running' })
})

// GET /api/ebay/deletion — eBay Marketplace Account Deletion challenge response
router.get('/ebay/deletion', (req, res) => {
  const challengeCode = req.query.challenge_code
  if (!challengeCode) {
    return res.status(400).json({ error: 'challenge_code required' })
  }

  const verificationToken = (process.env.EBAY_VERIFICATION_TOKEN || 'UnifiedDashboardVerificationToken2026!').trim()
  const configuredEndpoint = (process.env.EBAY_DELETION_ENDPOINT || '').trim()
  const endpointUrl = configuredEndpoint || `${req.protocol}://${req.get('host')}/api/ebay/deletion`

  const hash = crypto.createHash('sha256')
  hash.update(challengeCode)
  hash.update(verificationToken)
  hash.update(endpointUrl)
  const challengeResponse = hash.digest('hex')

  res.setHeader('Content-Type', 'application/json')
  return res.status(200).json({ challengeResponse })
})

// POST /api/ebay/deletion — eBay notification payload acknowledgment
router.post('/ebay/deletion', (req, res) => {
  console.log('eBay Account Deletion Notification received:', req.body)
  return res.status(200).json({ success: true })
})

module.exports = router

