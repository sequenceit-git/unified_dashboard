const express = require('express')

const router = express.Router()

const crypto = require('crypto')
const ebayDeletion = require('../../services/ebayAccountDeletion')
const ebayNotifications = require('../../services/ebayNotifications')

router.get('/health', (req, res) => {
  res.json({ message: 'OK — backend is running' })
})

// GET /api/ebay/deletion — eBay Marketplace Account Deletion challenge response
router.get('/ebay/deletion', (req, res) => {
  const challengeCode = req.query.challenge_code
  if (!challengeCode) {
    return res.status(400).json({ error: 'challenge_code required' })
  }

  const verificationToken = (process.env.EBAY_VERIFICATION_TOKEN || '').trim()
  if (!verificationToken) {
    return res.status(503).json({ error: 'EBAY_VERIFICATION_TOKEN is not configured' })
  }
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

// POST /api/ebay/deletion — verified eBay account-deletion notice; anonymises that buyer's data
router.post('/ebay/deletion', async (req, res) => {
  const valid = await ebayDeletion.verifySignature(req.get('x-ebay-signature'), req.rawBody)
  if (!valid) return res.status(412).json({ error: 'Invalid signature' })
  try {
    const data = req.body?.notification?.data || {}
    const result = await ebayDeletion.purgeUser({ username: data.username, userId: data.userId })
    console.log(`[ebay-deletion] notification ${req.body?.notification?.notificationId || ''} handled`, result)
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[ebay-deletion] purge failed:', err.message)
    return res.status(500).json({ error: 'Could not process notification' })
  }
})

// POST /api/ebay/notifications — eBay Platform Notifications (SOAP XML). Checks eBay's signature,
// queues a sync for the seller's shop and answers at once; the worker does the work.
router.post(
  '/ebay/notifications',
  express.text({ type: () => true, limit: '2mb' }),
  async (req, res) => {
    try {
      const result = await ebayNotifications.handle(req.body, req.get('soapaction'))
      if (result.status !== 200) console.warn(`[ebay-notify] ${result.message}`)
      res.status(result.status).send(result.message)
    } catch (err) {
      console.error('[ebay-notify] failed:', err.message)
      res.status(500).send('Could not process notification')
    }
  },
)

module.exports = router
