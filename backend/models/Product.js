const mongoose = require('mongoose')
const { newSku } = require('../utils/sku')
const { KEYS } = require('../marketplaces')

const identifierCodeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['GTIN', 'EAN', 'UPC', 'ISBN', 'JAN'] },
    code: { type: String },
  },
  { _id: false },
)

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    externalSkuId: { type: String },
    options: { type: mongoose.Schema.Types.Mixed, default: {} },
    price: { type: Number },
    listPrice: { type: Number },
    stock: { type: Number, default: 0 },
    image: { type: String },
    identifierCode: identifierCodeSchema,
  },
  { _id: false },
)

const productSchema = new mongoose.Schema(
  {
    /** The shop this product belongs to: each shop has its own products, stock and price. */
    marketplace: { type: String, enum: KEYS, index: true },
    /** Set on products split from a shared product by scripts/split-products-per-shop.js. */
    splitFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: undefined },
    sku: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String },
    description: { type: String },
    category: { type: String },
    brand: { type: String },
    brandId: { type: String },
    mpn: { type: String },
    // eBay condition code (NEW, USED_GOOD, ... or numeric ConditionID 1000..7000), used as the default when listing.
    condition: { type: String },
    conditionDescription: { type: String },
    dispatchTimeMax: { type: Number },
    bestOffer: {
      enabled: { type: Boolean, default: false },
      autoAcceptPrice: { type: Number },
      minOfferPrice: { type: Number },
    },
    // Who pays the delivery charge on the eBay listing (set by that shop's adapter on sync); `type`
    // and `policy` tell the listing form what it may change.
    ebayShipping: {
      paidBy: { type: String, enum: ['buyer', 'seller'] },
      cost: { type: Number },
      type: { type: String },
      policy: { type: String },
    },
    images: [{ type: String }],
    basePrice: { type: Number },
    listPrice: { type: Number },
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
    identifierCode: identifierCodeSchema,
    sizeChart: {
      image: { type: String },
      templateId: { type: String },
    },
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Who made it in the dashboard. Lets a sub-admin see their own drafts before they are listed.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    variants: [variantSchema],
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    source: { type: String, enum: ['manual', 'bulk_upload', 'research_bot', 'marketplace_sync', 'url_import'], default: 'manual' },
    sourceReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResearchReport', default: null },
  },
  { timestamps: true },
)

function cleanIdentifierCode(idObj) {
  const raw = String(idObj?.code || '').trim()
  if (!raw) return undefined
  const code = /^does\s+not\s+apply$/i.test(raw) ? 'Does not apply' : raw
  const type = String(idObj?.type || '').trim().toUpperCase()
  return { ...(type ? { type } : {}), code }
}

// SKUs are generated when left blank, so nobody has to type one.
productSchema.pre('validate', async function assignSku() {
  if (!String(this.sku || '').trim()) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const sku = newSku(this.marketplace || this.attributes?.targetMarketplace)
      if (!(await this.constructor.exists({ marketplace: this.marketplace, sku }))) {
        this.sku = sku
        break
      }
    }
  }
  this.identifierCode = cleanIdentifierCode(this.identifierCode)
  this.variants.forEach((variant, index) => {
    if (!String(variant.sku || '').trim()) variant.sku = `${this.sku}-${index + 1}`
    variant.identifierCode = cleanIdentifierCode(variant.identifierCode)
  })
})

// A SKU is unique within a shop; the same SKU may exist once on each shop.
productSchema.index({ marketplace: 1, sku: 1 }, { unique: true })
productSchema.index({ createdBy: 1 })
productSchema.index({ 'variants.sku': 1 }, { sparse: true })
productSchema.index({ status: 1, category: 1 })
productSchema.index({ title: 'text', sku: 'text' })
productSchema.index({ stock: 1 })
productSchema.index({ createdAt: -1 })
productSchema.index({ status: 1, createdAt: -1 })

module.exports = mongoose.model('Product', productSchema, 'products')
