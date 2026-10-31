const express = require('express')
const { requireAuth, loadAccess } = require('../../middleware/auth')
const events = require('../../services/events')

const router = express.Router()

// GET /api/events — server-sent events, e.g. "the inbox of shop X has new messages".
// Sub-admins only get events for their own shops.
router.get('/', requireAuth, loadAccess, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  res.write('retry: 5000\n\n')

  const allowed = req.user.role === 'sub_admin' ? new Set((req.allowedShopIds || []).map(String)) : null
  const unsubscribe = events.subscribe((event) => {
    if (allowed && event.shopId && !allowed.has(event.shopId)) return
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  })
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000)
  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

module.exports = router
