const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    profileImageUrl: { type: String, default: '' },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['super_admin', 'sub_admin'], required: true },
    mainRoutes: {
      type: [String],
      enum: ['discovery', 'dashboard', 'analytics', 'products', 'inventory', 'orders', 'customers', 'inbox'],
      default: [],
    },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    // Soft delete (partial delete): row is kept for audit history,
    // login + all authenticated access are blocked when true.
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ shopId: 1, role: 1 })
userSchema.index({ isDeleted: 1, role: 1 })

module.exports = mongoose.model('User', userSchema, 'users')
