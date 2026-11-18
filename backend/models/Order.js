const mongoose = require('mongoose')
const { encrypt, decrypt } = require('../utils/recipientPii')

const shippingAddressSchema = new mongoose.Schema(
  {
    street: { type: String, set: encrypt, get: decrypt },
    city: { type: String, set: encrypt, get: decrypt },
    state: { type: String, set: encrypt, get: decrypt },
    zip: { type: String, set: encrypt, get: decrypt },
    country: { type: String, set: encrypt, get: decrypt },
  },
  { _id: false, toJSON: { getters: true }, toObject: { getters: true } },
)

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: { type: String },
    lineItemId: { type: String },
    title: { type: String },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number },
  },
  { _id: false },
)

const returnSchema = new mongoose.Schema(
  {
    reason: { type: String },
    status: { type: String, enum: ['requested', 'approved', 'received', 'rejected'] },
    refundAmount: { type: Number },
    refundedAt: { type: Date },
    requestedAt: { type: Date },
  },
  { _id: false },
)

const orderSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    marketplace: { type: String },
    externalOrderId: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    status: {
      type: String,
      enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded'],
      default: 'pending',
    },
    items: [orderItemSchema],
    buyer: {
      name: { type: String, set: encrypt, get: decrypt },
      username: { type: String, set: encrypt, get: decrypt },
      email: { type: String, set: encrypt, get: decrypt },
      phone: { type: String, set: encrypt, get: decrypt },
    },
    shippingAddress: shippingAddressSchema,
    totals: {
      subtotal: { type: Number },
      shipping: { type: Number },
      tax: { type: Number },
      discount: { type: Number },
      total: { type: Number },
      currency: { type: String, default: 'USD' },
    },
    shipping: {
      carrier: { type: String },
      trackingNumber: { type: String },
      shippedAt: { type: Date },
      deliveredAt: { type: Date },
      // True once the tracking number/carrier/date came from the marketplace's shipment record.
      trackingVerified: { type: Boolean },
    },
    returns: [returnSchema],
    placedAt: { type: Date },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } },
)

orderSchema.index({ shopId: 1, externalOrderId: 1 }, { unique: true })
orderSchema.index({ shopId: 1, placedAt: -1 })
orderSchema.index({ shopId: 1, status: 1, placedAt: -1 })
orderSchema.index({ customerId: 1, placedAt: -1 })
orderSchema.index({ 'items.productId': 1, placedAt: -1 })
orderSchema.index({ 'shipping.trackingNumber': 1 }, { sparse: true })
orderSchema.index({ placedAt: -1 })
orderSchema.index({ marketplace: 1, placedAt: -1 })
orderSchema.index({ status: 1, placedAt: -1 })

module.exports = mongoose.model('Order', orderSchema, 'orders')
