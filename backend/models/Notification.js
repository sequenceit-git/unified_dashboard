const mongoose = require('mongoose')

const TYPES = [
  'low_stock',
  'new_order',
  'new_message',
  'listing_failed',
  'sync_failed',
  'token_expiring',
  'report_ready',
]

const notificationSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    type: { type: String, enum: TYPES, required: true },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    href: { type: String, default: '' },
    key: { type: String, required: true },
    refId: { type: mongoose.Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
)

notificationSchema.index({ shopId: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ key: 1, isRead: 1 })
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 })

module.exports = mongoose.model('Notification', notificationSchema, 'notifications')
module.exports.TYPES = TYPES
