const mongoose = require('mongoose')

const evidenceMemorySchema = new mongoose.Schema(
  {
    fingerprint: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedTitle: {
      type: String,
      required: true,
      index: true,
    },
    canonicalUrl: {
      type: String,
      default: '',
    },
    marketplace: {
      type: String,
      default: 'ebay',
    },
    status: {
      type: String,
      enum: ['verified', 'rejected', 'restricted', 'dead_link'],
      default: 'verified',
      index: true,
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastObservedAt: {
      type: Date,
      default: Date.now,
      // Automatic TTL expiration after 72 hours (259200 seconds)
      expires: 259200,
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model('EvidenceMemory', evidenceMemorySchema, 'discovery_evidence_memory')

