export const EBAY_IDENTIFIER_TYPES = [
  { value: '', label: 'None' },
  { value: 'UPC', label: 'UPC (12 digits)' },
  { value: 'EAN', label: 'EAN (8, 13, or 14 digits)' },
  { value: 'ISBN', label: 'ISBN (10 or 13 chars)' },
]

export const DISPATCH_TIMES = [
  { value: '', label: 'Shop default (from eBay)' },
  { value: '0', label: 'Same business day' },
  { value: '1', label: '1 business day' },
  { value: '2', label: '2 business days' },
  { value: '3', label: '3 business days' },
  { value: '4', label: '4 business days' },
  { value: '5', label: '5 business days' },
  { value: '10', label: '10 business days' },
  { value: '15', label: '15 business days' },
  { value: '20', label: '20 business days' },
  { value: '30', label: '30 business days' },
]

export const LEGACY_CONDITION_TO_ID = {
  NEW: '1000',
  LIKE_NEW: '1500',
  USED_EXCELLENT: '3000',
  USED_VERY_GOOD: '3000',
  USED_GOOD: '3000',
  FOR_PARTS_OR_NOT_WORKING: '7000',
}

const EBAY_ID_PATTERNS = {
  UPC: /^\d{12}$/,
  EAN: /^(\d{8}|\d{13}|\d{14})$/,
  ISBN: /^(\d{9}[\dX]|\d{13})$/,
}

export const EBAY_ID_HINTS = {
  UPC: '12 digits or "Does not apply"',
  EAN: '8, 13, or 14 digits or "Does not apply"',
  ISBN: '10 or 13 chars or "Does not apply"',
}

export function isNewCondition(value) {
  const raw = String(value || 'NEW').trim()
  if (/^\d{4}$/.test(raw)) {
    const n = Number(raw)
    return n >= 1000 && n < 1500
  }
  return raw.toUpperCase() === 'NEW'
}

export function normalizeEbayCategoryRules(raw) {
  if (!raw || Array.isArray(raw)) {
    return {
      variationsEnabled: true,
      conditionEnabled: 'Enabled',
      conditions: [],
      bestOfferEnabled: true,
      upcEnabled: 'Enabled',
      eanEnabled: 'Enabled',
      isbnEnabled: 'Enabled',
    }
  }
  return {
    variationsEnabled: raw.variationsEnabled !== false,
    conditionEnabled: raw.conditionEnabled || 'Enabled',
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    bestOfferEnabled: raw.bestOfferEnabled !== false,
    upcEnabled: raw.upcEnabled || 'Enabled',
    eanEnabled: raw.eanEnabled || 'Enabled',
    isbnEnabled: raw.isbnEnabled || 'Enabled',
  }
}

export function resolveEbayCondition(current, categoryConditions = []) {
  if (!Array.isArray(categoryConditions) || !categoryConditions.length) return current || 'NEW'
  const raw = String(current || 'NEW').trim()
  if (categoryConditions.some((c) => String(c.id) === raw)) return raw
  const mapped = LEGACY_CONDITION_TO_ID[raw.toUpperCase()]
  if (mapped && categoryConditions.some((c) => String(c.id) === mapped)) return mapped
  return String(categoryConditions[0].id)
}

export function validateEbayIdentifierCode(idObj, prefix = '') {
  const code = String(idObj?.code || '').trim()
  if (!code) return ''
  const type = String(idObj?.type || '').trim().toUpperCase()
  const label = prefix ? `${prefix}: ` : ''
  if (!type || !EBAY_ID_PATTERNS[type]) {
    return `${label}Choose UPC, EAN, or ISBN for "${code}".`
  }
  if (/^does\s+not\s+apply$/i.test(code)) return ''
  if (!EBAY_ID_PATTERNS[type].test(code)) {
    return `${label}Invalid ${type} "${code}" (${EBAY_ID_HINTS[type]}).`
  }
  return ''
}

export function validateVariantsForEbay(variants = [], { requireStock = true } = {}) {
  if (!Array.isArray(variants) || !variants.length) return ''
  if (variants.length > 250) return 'eBay allows at most 250 variations per listing.'

  const allKeys = [...new Set(variants.flatMap((v) => Object.keys(v?.options || {}).map((k) => String(k).trim()).filter(Boolean)))]
  if (allKeys.length < 1 || allKeys.length > 5) {
    return 'eBay multi-variation listings must have 1 to 5 variation option types.'
  }
  for (const key of allKeys) {
    if (key.length > 40) return `Variation option name "${key}" must be 40 characters or less.`
  }

  const valuesPerOption = new Map(allKeys.map((k) => [k, new Set()]))
  const seenCombos = new Set()
  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i] || {}
    const label = Object.values(v.options || {}).filter(Boolean).join(' / ') || `Variation ${i + 1}`
    const price = Number(v.price)
    if (!(price > 0)) return `${label}: price must be greater than 0.`
    const stock = Number(v.stock)
    if (!Number.isFinite(stock) || stock < (requireStock ? 1 : 0)) {
      return `${label}: stock must be at least ${requireStock ? 1 : 0}.`
    }
    const idErr = validateEbayIdentifierCode(v.identifierCode, label)
    if (idErr) return idErr
    const comboParts = []
    for (const key of allKeys) {
      const val = String(v.options?.[key] ?? '').trim()
      if (!val) return `${label}: missing value for "${key}".`
      if (val.length > 50) return `${label}: option value "${val}" must be 50 characters or less.`
      valuesPerOption.get(key).add(val)
      if (valuesPerOption.get(key).size > 50) {
        return `eBay allows at most 50 unique values for "${key}".`
      }
      comboParts.push(val.toLowerCase())
    }
    const sig = comboParts.join('\u0000')
    if (seenCombos.has(sig)) return `Duplicate eBay variation: ${label}.`
    seenCombos.add(sig)
  }
  return ''
}

export function validateBestOffer(bestOffer, minPrice) {
  if (!bestOffer?.enabled) return ''
  const floor = Number(minPrice)
  const hasFloor = Number.isFinite(floor) && floor > 0
  const autoAccept = bestOffer.autoAcceptPrice !== '' && bestOffer.autoAcceptPrice != null
    ? Number(bestOffer.autoAcceptPrice)
    : null
  const minOffer = bestOffer.minOfferPrice !== '' && bestOffer.minOfferPrice != null
    ? Number(bestOffer.minOfferPrice)
    : null
  if (autoAccept != null && (!Number.isFinite(autoAccept) || autoAccept <= 0 || (hasFloor && autoAccept >= floor))) {
    return hasFloor
      ? `Best Offer auto-accept must be between $0.01 and less than $${floor.toFixed(2)}.`
      : 'Best Offer auto-accept must be greater than $0.'
  }
  if (minOffer != null && (!Number.isFinite(minOffer) || minOffer <= 0 || (hasFloor && minOffer >= floor))) {
    return hasFloor
      ? `Minimum Best Offer must be between $0.01 and less than $${floor.toFixed(2)}.`
      : 'Minimum Best Offer must be greater than $0.'
  }
  if (autoAccept != null && minOffer != null && minOffer >= autoAccept) {
    return 'Minimum Best Offer price must be less than the auto-accept price.'
  }
  return ''
}
