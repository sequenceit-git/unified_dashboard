const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    senderType: { type: String, enum: ['customer', 'ai', 'agent'], required: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    text: { type: String },
    attachments: [{ type: String }],
    externalMessageId: { type: String },
    deliveryStatus: { type: String, enum: ['sent', 'delivered', 'failed'], default: 'sent' },
    sentAt: { type: Date, default: Date.now },
    // Set once the auto-reply has taken this inbound message, so two servers never answer it twice.
    aiHandled: { type: Boolean, default: false },
  },
  { timestamps: true },
)

messageSchema.index({ conversationId: 1, sentAt: 1 })
messageSchema.index(
  { shopId: 1, externalMessageId: 1 },
  { unique: true, partialFilterExpression: { externalMessageId: { $type: 'string' } } },
)

module.exports = mongoose.model('Message', messageSchema, 'messages')
