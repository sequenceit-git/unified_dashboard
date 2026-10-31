const mongoose = require('mongoose')

const conversationSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    marketplace: { type: String },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    externalThreadId: { type: String },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    aiEnabled: { type: Boolean, default: true },
    aiError: { type: String, default: '' },
    customerName: { type: String },
    // eBay system notices (FROM_EBAY) cannot be answered.
    replyable: { type: Boolean, default: true },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String },
    unreadCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

conversationSchema.index({ shopId: 1, externalThreadId: 1 }, { unique: true, sparse: true })
conversationSchema.index({ shopId: 1, status: 1, lastMessageAt: -1 })
conversationSchema.index({ customerId: 1 })

module.exports = mongoose.model('Conversation', conversationSchema, 'conversations')
