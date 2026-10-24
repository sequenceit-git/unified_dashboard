const mongoose = require('mongoose')

/** Workspace-wide settings, one document per `key` (e.g. "ai"). */
const appSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false },
)

module.exports = mongoose.model('AppSetting', appSettingSchema, 'app_settings')
