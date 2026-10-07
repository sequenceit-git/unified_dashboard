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
    currency: { type: String, default: 'USD' },
    stock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    variants: [variantSchema],
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    source: { type: String, enum: ['manual', 'bulk_upload', 'research_bot'], default: 'manual' },
    sourceReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchReport', default: null },
  },
  { timestamps: true },
)

productSchema.index({ sku: 1 }, { unique: true })
productSchema.index({ 'variants.sku': 1 }, { sparse: true })
productSchema.index({ status: 1, category: 1 })
productSchema.index({ title: 'text', sku: 'text' })
productSchema.index({ stock: 1 })

module.exports = mongoose.model('Product', productSchema, 'products')
