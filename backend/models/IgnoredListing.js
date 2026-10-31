const mongoose = require('mongoose')

/**
 * A shop product the seller removed from the catalog. TikTok keeps deleted products
 * in Search Products (status DELETED), so without this the next sync creates them again.
 */
const ignoredListingSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    productKey: { type: String, required: true },
  },
  { timestamps: true },
)

ignoredListingSchema.index({ shopId: 1, productKey: 1 }, { unique: true })

module.exports = mongoose.model('IgnoredListing', ignoredListingSchema, 'ignored_listings')
