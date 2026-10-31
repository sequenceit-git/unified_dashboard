const mongoose = require('mongoose')
const { newSku } = require('../utils/sku')

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
    // eBay condition code (NEW, USED_GOOD, ...), used as the default when listing.
    condition: { type: String },
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
    source: { type: String, enum: ['manual', 'bulk_upload', 'research_bot', 'marketplace_sync', 'url_import'], default: 'manual' },
    sourceReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchReport', default: null },
  },
  { timestamps: true },
)

// SKUs are generated when left blank, so nobody has to type one.
productSchema.pre('validate', async function assignSku() {
  if (!String(this.sku || '').trim()) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const sku = newSku(this.attributes?.targetMarketplace)
      if (!(await this.constructor.exists({ sku }))) {
        this.sku = sku
        break
      }
    }
  }
  this.variants.forEach((variant, index) => {
    if (!String(variant.sku || '').trim()) variant.sku = `${this.sku}-${index + 1}`
  })
})

productSchema.index({ sku: 1 }, { unique: true })
productSchema.index({ 'variants.sku': 1 }, { sparse: true })
productSchema.index({ status: 1, category: 1 })
productSchema.index({ title: 'text', sku: 'text' })
productSchema.index({ stock: 1 })
productSchema.index({ createdAt: -1 })
productSchema.index({ status: 1, createdAt: -1 })

module.exports = mongoose.model('Product', productSchema, 'products')
