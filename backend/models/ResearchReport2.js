const mongoose = require('mongoose')

const opportunitySchema = new mongoose.Schema(
  {
    rank: { type: Number },
    title: { type: String },
    category: { type: String },
    marketplace: { type: String },
    listingUrl: { type: String },
    sourceUrl: { type: String },
    image: { type: String },
    images: [{ type: String }],
    description: { type: String, default: '' },
    highlights: [{ type: String }],
    specs: [{
      name: { type: String },
      value: { type: String },
    }],
    demandSignal: { type: String, default: '' },
    listedShops: [{ type: String, enum: ['ebay', 'tiktok_shop', 'temu'] }],
    brand: { type: String, default: '' },
    sources: [{
      label: { type: String },
      url: { type: String },
      kind: { type: String },
      price: { type: Number, default: null },
    }],
    metrics: { type: mongoose.Schema.Types.Mixed },
    validation: { type: mongoose.Schema.Types.Mixed },
    sourcing: { type: mongoose.Schema.Types.Mixed },
    estimatedMargin: { type: Number, default: null },
    opportunityScore: { type: Number, default: null },
    confidence: { type: String, enum: ['low', 'medium', 'high', 'unverified'], default: 'unverified' },
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
      type: String, // Normalized date string "YYYY-MM-DD" set upon agent completion
      index: true,
      default: null,
    },
    params: {
      marketplaces: [{ type: String }],
      categories: [{ type: String }],
      category: { type: String },
      keywords: [{ type: String }],
      instructions: { type: String },
      minMargin: { type: Number, default: null },
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
