const mongoose = require('mongoose')

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: { type: String },
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
      name: { type: String },
      email: { type: String },
      phone: { type: String },
    },
    shippingAddress: { type: mongoose.Schema.Types.Mixed },
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
    },
    returns: [returnSchema],
    placedAt: { type: Date },
  },
  { timestamps: true },
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
