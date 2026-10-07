const mongoose = require('mongoose')

const syncLogSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    type: { type: String, enum: ['products', 'inventory', 'orders', 'messages', 'token_refresh'] },
    status: { type: String, enum: ['success', 'failed', 'partial'] },
    error: {
      code: { type: String },
      message: { type: String },
      httpStatus: { type: Number },
    },
    attempt: { type: Number, default: 0 },
    stats: {
      fetched: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { timestamps: true },
)

syncLogSchema.index({ shopId: 1, startedAt: -1 })
syncLogSchema.index({ status: 1, startedAt: -1 })
syncLogSchema.index({ startedAt: 1 }, { expireAfterSeconds: 7776000 }) // 90 days

module.exports = mongoose.model('SyncLog', syncLogSchema, 'sync_logs')
