const mongoose = require('mongoose')

const listingSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    marketplace: { type: String },
    externalListingId: { type: String },
    price: { type: Number },
    status: {
      type: String,
      enum: ['pending', 'live', 'paused', 'error', 'ended'],
      default: 'pending',
    },
    syncError: { type: String },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true },
)

listingSchema.index({ productId: 1, shopId: 1 }, { unique: true })
listingSchema.index({ shopId: 1, status: 1 })
listingSchema.index({ shopId: 1, externalListingId: 1 })

module.exports = mongoose.model('Listing', listingSchema, 'listings')
