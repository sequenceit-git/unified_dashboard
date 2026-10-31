const express = require('express')
const { requireAuth, loadAccess } = require('../../middleware/auth')
const Notification = require('../../models/Notification')

const router = express.Router()
router.use(requireAuth, loadAccess)

function visible(req) {
  if (req.user.role !== 'sub_admin') return {}
  return { $or: [{ shopId: { $in: req.allowedShopIds || [] } }, { shopId: null }] }
}

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100)
    const unread = await Notification.countDocuments({ ...visible(req), isRead: false })
    const items = await Notification.find(visible(req)).sort({ createdAt: -1 }).limit(limit).lean()
    res.json({ unread, items })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/read-all', async (req, res) => {
  try {
    const result = await Notification.updateMany({ ...visible(req), isRead: false }, { isRead: true })
    res.json({ updated: result.modifiedCount || 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id/read', async (req, res) => {
  try {
    const doc = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...visible(req) },
      { isRead: true },
      { new: true },
    )
    if (!doc) return res.status(404).json({ error: 'Notification not found' })
    res.json(doc)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
