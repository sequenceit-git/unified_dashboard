const mongoose = require('mongoose')

const conversationSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    marketplace: { type: String, enum: ['ebay', 'sandbox', 'manual'], default: 'ebay' },

    // Customer reference
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    externalUserId: { type: String, default: 'sandbox_buyer' }, // eBay user ID or stable ID
    customerName: { type: String, default: 'Buyer' },

    // Link to marketplace thread / order
    externalThreadId: { type: String }, // eBay conversationId
    externalThreadType: { type: String, default: 'FROM_MEMBERS' }, // FROM_MEMBERS / FROM_EBAY
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    orderRef: { type: String, default: '' }, // e.g. #112-2938471
    listingRef: { type: String, default: '' }, // eBay item ID

    // Lifecycle
    status: { type: String, enum: ['open', 'escalated', 'closed', 'locked'], default: 'open' },
    aiEnabled: { type: Boolean, default: true }, // human agent can toggle off bot

    // Guardrail + escalation
    offTopicStrikes: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    escalationReason: { type: String, default: '' },

    // History helpers
    summary: { type: String, default: '' },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: '' },
    slaDueAt: { type: Date, default: null },
  },
  { timestamps: true },
)

conversationSchema.index(
  { shopId: 1, externalThreadId: 1 },
  { unique: true, partialFilterExpression: { externalThreadId: { $type: 'string' } } },
)
conversationSchema.index({ shopId: 1, status: 1, lastMessageAt: -1 })
conversationSchema.index({ customerId: 1, status: 1 })

module.exports = mongoose.models.Conversation2 || mongoose.model('Conversation2', conversationSchema, 'conversations_v2')
