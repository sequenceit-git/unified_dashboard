const mongoose = require('mongoose')

const inventoryLogSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    variantSku: { type: String },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    change: { type: Number, required: true },
    stockBefore: { type: Number },
    stockAfter: { type: Number },
    reason: { type: String, enum: ['sale', 'return', 'manual', 'sync', 'restock'] },
    refId: { type: mongoose.Schema.Types.ObjectId },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

inventoryLogSchema.index({ productId: 1, createdAt: -1 })
inventoryLogSchema.index({ shopId: 1, createdAt: -1 })

module.exports = mongoose.model('InventoryLog', inventoryLogSchema, 'inventory_logs')
