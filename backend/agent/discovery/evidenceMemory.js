/**
 * Agent Evidence Memory Buffer
 *
 * Implements a 3-tier memory system:
 * - L1: In-process LRU cache (fast RAM, 24-hour TTL)
 * - L2: Persistent MongoDB store with 72-hour TTL expiration
 * - L3: Negative exclusion cache (brand-gated, counterfeit, 404 dead links)
 */

const crypto = require('crypto')
const EvidenceMemory = require('../../models/EvidenceMemory')

// --- L1 In-Memory LRU Cache ---
const L1_MAX_SIZE = 500
const L1_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const l1Cache = new Map()

function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function makeFingerprint(title, url = '') {
  const normTitle = normalizeKey(title)
  let normUrl = ''
  try {
    if (url) {
      const parsed = new URL(url)
      parsed.search = ''
      parsed.hash = ''
      normUrl = parsed.href.toLowerCase()
    }
  } catch {}

  const source = normUrl ? `${normTitle}::${normUrl}` : normTitle
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 32)
}

function l1Get(fingerprint) {
  const entry = l1Cache.get(fingerprint)
  if (!entry) return null
  if (Date.now() - entry.timestamp > L1_TTL_MS) {
    l1Cache.delete(fingerprint)
    return null
  }
  // Refresh LRU order (delete & re-insert)
  l1Cache.delete(fingerprint)
  l1Cache.set(fingerprint, entry)
  return entry.value
}

function l1Set(fingerprint, value) {
  if (l1Cache.size >= L1_MAX_SIZE) {
    const oldestKey = l1Cache.keys().next().value
    l1Cache.delete(oldestKey)
  }
  l1Cache.set(fingerprint, { value, timestamp: Date.now() })
}

/**
 * Check if a product title or URL was marked as negative/restricted/dead
 */
async function isExcluded(title, url = '') {
  const fp = makeFingerprint(title, url)
  const cached = l1Get(fp)
  if (cached && cached.status && cached.status !== 'verified') {
    return { excluded: true, reason: cached.rejectionReason || cached.status }
  }

  try {
    const doc = await EvidenceMemory.findOne({ fingerprint: fp }).lean()
    if (doc && doc.status !== 'verified') {
      l1Set(fp, doc)
      return { excluded: true, reason: doc.rejectionReason || doc.status }
    }
  } catch (err) {
    // Graceful degradation if MongoDB is unavailable
  }

  return { excluded: false }
}

/**
 * Retrieve verified evidence from memory buffer (L1 -> L2)
 */
async function getEvidence(title, url = '') {
  const fp = makeFingerprint(title, url)

  // 1. Check L1 Memory
  const l1Hit = l1Get(fp)
  if (l1Hit) {
    return l1Hit.status === 'verified' ? l1Hit.data : null
  }

  // 2. Check L2 Persistent DB
  try {
    const doc = await EvidenceMemory.findOne({ fingerprint: fp, status: 'verified' }).lean()
    if (doc && doc.data) {
      l1Set(fp, doc)
      return doc.data
    }
  } catch (err) {
    // Graceful fallback
  }

  return null
}

/**
 * Save verified product evidence to L1 and L2 memory
 */
async function saveVerifiedEvidence(candidate, evidenceData) {
  const fp = makeFingerprint(candidate.title, candidate.listingUrl)
  const normTitle = normalizeKey(candidate.title)

  const payload = {
    fingerprint: fp,
    title: candidate.title,
    normalizedTitle: normTitle,
    canonicalUrl: candidate.listingUrl || '',
    marketplace: candidate.observedMarketplace || 'ebay',
    status: 'verified',
    data: evidenceData,
    lastObservedAt: new Date(),
  }

  // Store in L1
  l1Set(fp, payload)

  // Store in L2 (upsert)
  try {
    await EvidenceMemory.updateOne(
      { fingerprint: fp },
      { $set: payload },
      { upsert: true },
    )
  } catch (err) {
    // Ignore transient DB write errors so agent never crashes
  }
}

/**
 * Save negative exclusion evidence (e.g. 404, brand-gated, compliance failure)
 */
async function saveNegativeEvidence(title, url = '', reason = 'rejected') {
  const fp = makeFingerprint(title, url)
  const normTitle = normalizeKey(title)

  const payload = {
    fingerprint: fp,
    title,
    normalizedTitle: normTitle,
    canonicalUrl: url,
    status: reason.includes('dead') ? 'dead_link' : reason.includes('restrict') ? 'restricted' : 'rejected',
    rejectionReason: reason,
    data: {},
    lastObservedAt: new Date(),
  }

  l1Set(fp, payload)

  try {
    await EvidenceMemory.updateOne(
      { fingerprint: fp },
      { $set: payload },
      { upsert: true },
    )
  } catch (err) {}
}

module.exports = {
  makeFingerprint,
  normalizeKey,
  getEvidence,
  saveVerifiedEvidence,
  saveNegativeEvidence,
  isExcluded,
}

