const mongoose = require('mongoose')
const { encrypt, decrypt } = require('../utils/recipientPii')

const identitySchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    marketplace: { type: String },
    externalBuyerId: { type: String },
    username: { type: String },
  },
  { _id: false },
)

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, set: encrypt, get: decrypt },
    city: { type: String, set: encrypt, get: decrypt },
    state: { type: String, set: encrypt, get: decrypt },
    zip: { type: String, set: encrypt, get: decrypt },
    country: { type: String, set: encrypt, get: decrypt },
  },
  { _id: false, toJSON: { getters: true }, toObject: { getters: true } },
)

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, set: encrypt, get: decrypt },
    email: { type: String, set: encrypt, get: decrypt },
    phone: { type: String, set: encrypt, get: decrypt },
    address: addressSchema,
    addresses: [addressSchema],
    identities: [identitySchema],
    orderCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastOrderAt: { type: Date },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } },
)

customerSchema.index(
  { 'identities.shopId': 1, 'identities.externalBuyerId': 1 },
  { unique: true, sparse: true },
)
customerSchema.index({ email: 1 }, { sparse: true })
customerSchema.index({ lastOrderAt: -1 })
customerSchema.index({ name: 'text', email: 'text' })

module.exports = mongoose.model('Customer', customerSchema, 'customers')
