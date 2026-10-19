const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation2', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },

    senderType: { type: String, enum: ['customer', 'ai', 'agent', 'system'], required: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // human agent
    senderName: { type: String, default: '' },
    text: { type: String, required: true },
    attachments: [{ type: String }],

    // Marketplace link
    externalMessageId: { type: String },
    deliveryStatus: { type: String, enum: ['received', 'sent', 'failed'], default: 'sent' },

    // AI trace: filled only for senderType 'ai'
    ai: {
      status: { type: String, enum: ['answered', 'not_found', 'escalate', 'fixed_reply'] },
      sourceIds: [{ type: String }], // faq / policy / product IDs used as evidence
      toolsCalled: [{ type: String }], // tool names only
      tokensIn: { type: Number, default: 0 },
      tokensOut: { type: Number, default: 0 },
      latencyMs: { type: Number, default: 0 },
      flags: [{ type: String }], // 'spam', 'off_topic', 'blocklist_hit', 'no_evidence', 'too_long', 'dispute'
    },

    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

messageSchema.index({ conversationId: 1, sentAt: 1 })
messageSchema.index(
  { shopId: 1, externalMessageId: 1 },
  { unique: true, partialFilterExpression: { externalMessageId: { $type: 'string' } } },
)

module.exports = mongoose.models.Message2 || mongoose.model('Message2', messageSchema, 'messages_v2')
