const mongoose = require('mongoose')

const marketplaceResearchSchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
      index: true,
    },
    categories: {
      type: [String],
      required: true,
      index: true,
    },
    productName: { type: String, required: true },
    marketplace: { type: String, required: true, index: true },
    productUrl: { type: String, required: true },
    price: { type: Number, default: null },
    currency: { type: String, default: 'USD' },
    estimatedMonthlySales: { type: Number, default: null },
    salesDataType: {
      type: String,
      enum: ['actual', 'estimated', 'unavailable'],
      default: 'unavailable',
    },
    searchRanking: { type: Number, default: null },
    rankingKeyword: { type: String, default: null },
    rating: { type: Number, default: null },
    reviewCount: { type: Number, default: null },
    reviewSummary: {
      positive: { type: [String], default: [] },
      negative: { type: [String], default: [] },
    },
    sourceUrl: { type: String, default: null },
    dataCollectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

marketplaceResearchSchema.index({
  reportId: 1,
  marketplace: 1,
})

module.exports = mongoose.model(
  'MarketplaceResearch',
  marketplaceResearchSchema,
  'marketplace_researches',
)
