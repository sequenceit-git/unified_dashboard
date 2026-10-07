const mongoose = require('mongoose')

const templateSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    title: { type: String, required: true },
    body: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

templateSchema.index({ shopId: 1 })

module.exports = mongoose.model('MessageTemplate', templateSchema, 'message_templates')
