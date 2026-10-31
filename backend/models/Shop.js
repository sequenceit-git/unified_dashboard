const mongoose = require('mongoose')

const shopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    marketplace: { type: String, enum: ['ebay', 'temu', 'tiktok_shop'], required: true },
    externalShopId: { type: String, required: true },
    shopCipher: { type: String },
    auth: {
      accessTokenEnc: { type: String, select: false },
      refreshTokenEnc: { type: String, select: false },
      expiresAt: { type: Date },
    },
    status: {
      type: String,
      enum: ['connected', 'error', 'disconnected'],
      default: 'disconnected',
    },
    lastSyncAt: { type: Date },
    aiReplyEnabled: { type: Boolean, default: false },
    // Seller's own marketplace username; eBay messages only carry usernames, not roles.
    accountUsername: { type: String },
    // Which dashboard sections this shop's token can reach: { sectionId: { ok, reason } }.
    apiAccess: { type: mongoose.Schema.Types.Mixed, default: undefined },
    apiAccessCheckedAt: { type: Date },
  },
  { timestamps: true },
)

shopSchema.index({ marketplace: 1, externalShopId: 1 }, { unique: true })
shopSchema.index({ status: 1 })
shopSchema.index({ 'auth.expiresAt': 1 })

module.exports = mongoose.model('Shop', shopSchema, 'shops')
