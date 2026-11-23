const tiktokNotifications = require('./webhooks')

/** TikTok Shop's public endpoint under /api: webhook events. */
function mount(router) {
  // POST /api/tiktok/webhooks — TikTok Shop webhook events. Verifies HMAC-SHA256 signature and queues a push sync.
  router.post('/tiktok/webhooks', async (req, res) => {
    try {
      const result = await tiktokNotifications.handle(
        req.rawBody,
        req.body,
        req.get('authorization'),
        req.query.topic,
      )
      if (result.status !== 200) console.warn(`[tiktok-webhook] ${result.message}`)
      res.status(result.status).json({ message: result.message })
    } catch (err) {
      console.error('[tiktok-webhook] failed:', err.message)
      res.status(500).json({ error: 'Could not process webhook' })
    }
  })
}

module.exports = mount
