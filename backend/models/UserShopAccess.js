const mongoose = require('mongoose')

const userShopAccessSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

userShopAccessSchema.index({ userId: 1, shopId: 1 }, { unique: true })
userShopAccessSchema.index({ userId: 1 })
userShopAccessSchema.index({ shopId: 1 })

module.exports = mongoose.model('UserShopAccess', userShopAccessSchema, 'user_shop_access')
