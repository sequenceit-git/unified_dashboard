const mongoose = require('mongoose')

const productRecommendationSchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    categories: {
      type: [String],
      required: true,
      index: true,
    },
    rank: { type: Number, required: true },
    productName: { type: String, required: true },
    category: { type: String, required: true, index: true },
    marketplace: { type: String, required: true },
    productUrl: { type: String, required: true },
    price: { type: Number, default: null },
    currency: { type: String, default: 'USD' },
    estimatedMonthlySales: { type: Number, default: null },
    estimatedMonthlyRevenue: { type: Number, default: null },
    rating: { type: Number, default: null },
    reviewCount: { type: Number, default: null },
    competitionLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Unknown'],
      default: 'Unknown',
    },
    estimatedProfitMarginPercent: { type: Number, default: null },
    opportunityScore: { type: Number, min: 0, max: 100, default: null },
    recommendationReason: { type: String, required: true },
  },
  { timestamps: true },
)

productRecommendationSchema.index(
  { reportId: 1, rank: 1 },
  { unique: true },
)

module.exports = mongoose.model(
  'ProductRecommendation',
  productRecommendationSchema,
  'product_recommendations',
)
