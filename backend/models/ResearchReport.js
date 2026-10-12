const mongoose = require('mongoose')

const opportunitySchema = new mongoose.Schema(
  {
    rank: { type: Number },
    title: { type: String },
    marketplace: { type: String },
    sourceUrl: { type: String },
    image: { type: String },
    metrics: { type: mongoose.Schema.Types.Mixed },
    estimatedMargin: { type: Number },
    opportunityScore: { type: Number },
    aiNotes: { type: String },
    addedProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  },
  { _id: false },
)

const reportSchema = new mongoose.Schema(
  {
    runBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    trigger: { type: String, enum: ['manual', 'scheduled'], default: 'manual' },
    params: {
      marketplaces: [{ type: String }],
      categories: [{ type: String }],  // multi-category support
      category: { type: String },       // legacy single-category (kept for compat)
      keywords: [{ type: String }],
    },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
    error: { type: String },
    summary: { type: String },
    opportunities: [opportunitySchema],
    email: {
      to: [{ type: String }],
      sentAt: { type: Date },
      status: { type: String },
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { timestamps: true },
)

reportSchema.index({ createdAt: -1 })
reportSchema.index({ status: 1, createdAt: -1 })
reportSchema.index({ 'opportunities.addedProductId': 1 }, { sparse: true })

module.exports = mongoose.model('ResearchReport', reportSchema, 'research_reports')
