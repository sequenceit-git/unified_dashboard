const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    type: { type: String, enum: ['low_stock', 'sync_failed', 'token_expiring', 'report_ready'] },
    title: { type: String },
    message: { type: String },
    refId: { type: mongoose.Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
)

notificationSchema.index({ shopId: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }) // 30 days

module.exports = mongoose.model('Notification', notificationSchema, 'notifications')
