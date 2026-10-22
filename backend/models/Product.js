const mongoose = require('mongoose')

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
    price: { type: Number },
    stock: { type: Number, default: 0 },
  },
  { _id: false },
)

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    category: { type: String },
    brand: { type: String },
    images: [{ type: String }],
    basePrice: { type: Number },
    costPrice: { type: Number, default: null },
    currency: { type: String, default: 'USD' },
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    weight: { type: Number, default: 1 }, // in lbs
    dimensions: {
      length: { type: Number, default: 10 },
      width: { type: Number, default: 10 },
      height: { type: Number, default: 5 },
      unit: { type: String, default: 'in' },
    },
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },

    variants: [variantSchema],
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    source: { type: String, enum: ['manual', 'bulk_upload', 'research_bot', 'marketplace_sync'], default: 'manual' },
    sourceReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchReport', default: null },
  },
  { timestamps: true },
)

productSchema.index({ sku: 1 }, { unique: true })
productSchema.index({ 'variants.sku': 1 }, { sparse: true })
productSchema.index({ status: 1, category: 1 })
productSchema.index({ title: 'text', sku: 'text' })
productSchema.index({ stock: 1 })
productSchema.index({ createdAt: -1 })
productSchema.index({ status: 1, createdAt: -1 })

module.exports = mongoose.model('Product', productSchema, 'products')
