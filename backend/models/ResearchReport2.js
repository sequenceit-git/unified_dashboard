const mongoose = require('mongoose')

const opportunitySchema = new mongoose.Schema(
  {
    rank: { type: Number },
    title: { type: String },
    category: { type: String },
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

const report2Schema = new mongoose.Schema(
  {
    runBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    trigger: { type: String, enum: ['manual', 'scheduled'], default: 'manual' },
    reportDate: {
      type: String, // Normalized date string "YYYY-MM-DD" for fast date-wise clustering
      index: true,
      default: () => new Date().toISOString().slice(0, 10),
    },
    params: {
      marketplaces: [{ type: String }],
      categories: [{ type: String }],
      category: { type: String },
      keywords: [{ type: String }],
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'queued',
    },
    progress: {
      stage: { type: String, default: 'Queued' },
      step: { type: Number, default: 0 },
      totalSteps: { type: Number, default: 0 },
      percent: { type: Number, default: 0 },
      currentItem: { type: String, default: '' },
    },
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

report2Schema.index({ reportDate: -1, createdAt: -1 })
report2Schema.index({ createdAt: -1 })
report2Schema.index({ status: 1, createdAt: -1 })
report2Schema.index({ 'opportunities.addedProductId': 1 }, { sparse: true })

module.exports = mongoose.model('ResearchReport2', report2Schema, 'research_reports2')
