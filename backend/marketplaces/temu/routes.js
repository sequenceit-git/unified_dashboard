const express = require('express')
const temuNotifications = require('./webhooks')

/** Temu's public endpoint under /api: webhook events. */
function mount(router) {
  // POST /api/temu/webhooks — Temu webhook events (callback URL set in the Temu Partner Platform).
  // Checks the signature, decrypts eventData and answers at once (Temu allows 500 ms), then queues
  // an orders sync for the shop; the order data itself is fetched from Temu.
  router.post(
    '/temu/webhooks',
    express.text({ type: () => true, limit: '1mb' }),
    (req, res) => {
      let opened
      try {
        opened = temuNotifications.open(req.body, req.headers)
      } catch (err) {
        console.error('[temu-webhook] failed:', err.message)
        return res.status(500).json({ success: false, error: 'Could not process webhook' })
      }
      if (opened.status !== 200) {
        console.warn(`[temu-webhook] ${opened.message}`)
        return res.status(opened.status).json({ success: false, message: opened.message })
      }
      res.status(200).json({ result: {} })
      temuNotifications.process(opened.eventCode, opened.data, opened.signature)
        .then((result) => console.log(`[temu-webhook] ${result.message}`))
        .catch((err) => console.error('[temu-webhook] failed:', err.message))
    },
  )
}

module.exports = mount
