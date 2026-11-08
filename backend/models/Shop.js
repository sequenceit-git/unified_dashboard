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
    // Why the shop's login stopped working (status 'error'); cleared by the next connect.
    authError: { type: String },
    lastSyncAt: { type: Date },
    // Newest order change already imported; the next order sync only asks for changes after it.
    ordersSyncedAt: { type: Date },
    aiReplyEnabled: { type: Boolean, default: false },
    // Seller's own marketplace username; eBay messages only carry usernames, not roles.
    accountUsername: { type: String },
    // Seller account the stored login belongs to, read from the marketplace when connecting.
    // A reconnect as a different account is refused.
    accountId: { type: String },
    // eBay push notifications: { enabled, url, events, enabledAt, checkedAt, error }.
    liveUpdates: { type: mongoose.Schema.Types.Mixed, default: undefined },
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
