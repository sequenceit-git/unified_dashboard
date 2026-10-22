const mongoose = require('mongoose')

const supportFaqSchema = new mongoose.Schema(
  {
    // Stable slug used by the seed files ("faq-where-is-my-order").
    code: { type: String, required: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String, required: true },
    marketplaces: [{ type: String }], // ['all'] or some of ebay | temu | tiktok_shop
    keywords: [{ type: String }],
    relatedPolicyCodes: [{ type: String }], // links back to SupportPolicy.code
    // How the AI should treat this FAQ:
    //   auto           — agent may answer fully on its own
    //   assisted       — agent drafts, human approves before sending
    //   human_required — escalate to a human immediately
    handling: { type: String, enum: ['auto', 'assisted', 'human_required'], default: 'auto' },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },
  },
  { timestamps: true },
)

supportFaqSchema.index({ code: 1 }, { unique: true })
supportFaqSchema.index({ status: 1, category: 1 })
supportFaqSchema.index({ question: 'text', answer: 'text', keywords: 'text' })

module.exports = mongoose.model('SupportFaq', supportFaqSchema, 'support_faqs')
