const mongoose = require('mongoose')

// One rule = one atomic fact the support AI may cite
// (e.g. { title: 'Return window', detail: '30 calendar days from delivery' }).
const policyRuleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    detail: { type: String, required: true },
  },
  { _id: false },
)

const supportPolicySchema = new mongoose.Schema(
  {
    // Stable slug used by the seed files and future agent lookups ("returns-general").
    code: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    marketplaces: [{ type: String }], // ['all'] or some of ebay | temu | tiktok_shop
    summary: { type: String, required: true }, // 1–2 sentences the AI can quote directly
    rules: [policyRuleSchema],
    exceptions: [{ type: String }],
    responseTemplate: { type: String }, // suggested customer-facing phrasing with {{placeholders}}
    keywords: [{ type: String }],
    version: { type: Number, default: 1 },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active' },
  },
  { timestamps: true },
)

supportPolicySchema.index({ code: 1 }, { unique: true })
supportPolicySchema.index({ status: 1, category: 1 })
supportPolicySchema.index({ title: 'text', summary: 'text', keywords: 'text' })

module.exports = mongoose.model('SupportPolicy', supportPolicySchema, 'support_policies')
