const mongoose = require('mongoose')

const marketAnalysisSchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    categories: {
      type: [String],
      required: true,
      index: true,
    },
    marketOverview: {
      summary: { type: String, required: true },
      demandLevel: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Unknown'],
        default: 'Unknown',
      },
      competitionLevel: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Unknown'],
        default: 'Unknown',
      },
      marketOutlook: { type: String, default: null },
    },
    trends: [
      {
        name: { type: String, required: true },
        direction: {
          type: String,
          enum: ['Growing', 'Stable', 'Declining', 'Uncertain'],
        },
        evidence: { type: String, default: null },
        sourceUrls: { type: [String], default: [] },
        confidence: {
          type: String,
          enum: ['Low', 'Medium', 'High'],
        },
      },
    ],
    profitAnalysis: [
      {
        category: { type: String, required: true },
        productName: { type: String, default: null },
        currency: { type: String, default: 'USD' },
        estimatedSellingPrice: { type: Number, default: null },
        estimatedProductCost: { type: Number, default: null },
        estimatedShippingCost: { type: Number, default: null },
        estimatedMarketplaceFees: { type: Number, default: null },
        estimatedMarketingCost: { type: Number, default: null },
        estimatedOtherCosts: { type: Number, default: null },
        estimatedProfitPerUnit: { type: Number, default: null },
        estimatedProfitMarginPercent: { type: Number, default: null },
        assumptions: { type: [String], default: [] },
      },
    ],
    opportunities: [
      {
        productName: { type: String, required: true },
        category: { type: String, required: true },
        opportunityScore: { type: Number, min: 0, max: 100 },
        demandScore: { type: Number, min: 0, max: 100 },
        competitionScore: { type: Number, min: 0, max: 100 },
        profitabilityScore: { type: Number, min: 0, max: 100 },
        trendScore: { type: Number, min: 0, max: 100 },
        reason: { type: String, required: true },
        sourceUrls: { type: [String], default: [] },
      },
    ],
    risks: { type: [String], default: [] },
    conclusion: { type: String, default: null },
  },
  { timestamps: true },
)

marketAnalysisSchema.index({ categories: 1, createdAt: -1 })

module.exports = mongoose.model(
  'MarketAnalysis',
  marketAnalysisSchema,
  'market_analyses',
)
