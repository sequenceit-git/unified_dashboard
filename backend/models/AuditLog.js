const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    action: { type: String, required: true },
    entity: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    meta: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

auditLogSchema.index({ userId: 1, createdAt: -1 })
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 })
auditLogSchema.index({ shopId: 1, createdAt: -1 })
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 }) // 180 days

module.exports = mongoose.model('AuditLog', auditLogSchema, 'audit_logs')
