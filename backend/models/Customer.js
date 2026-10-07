const mongoose = require('mongoose')

const identitySchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    marketplace: { type: String },
    externalBuyerId: { type: String },
    username: { type: String },
  },
  { _id: false },
)

const customerSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    identities: [identitySchema],
    orderCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastOrderAt: { type: Date },
  },
  { timestamps: true },
)

customerSchema.index(
  { 'identities.shopId': 1, 'identities.externalBuyerId': 1 },
  { unique: true, sparse: true },
)
customerSchema.index({ email: 1 }, { sparse: true })
customerSchema.index({ lastOrderAt: -1 })
customerSchema.index({ name: 'text', email: 'text' })

module.exports = mongoose.model('Customer', customerSchema, 'customers')
