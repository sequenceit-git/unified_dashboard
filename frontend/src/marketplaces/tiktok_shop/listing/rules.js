export const IDENTIFIER_TYPES = [
  { value: '', label: 'None' },
  { value: 'GTIN', label: 'GTIN (14 digits)' },
  { value: 'UPC', label: 'UPC (12 digits)' },
  { value: 'EAN', label: 'EAN (8, 13, or 14 digits)' },
  { value: 'ISBN', label: 'ISBN (13 digits or 8 + X)' },
  { value: 'JAN', label: 'JAN (8 or 13 digits)' },
]

export const SAVE_MODES = [
  { value: 'LISTING', label: 'Submit for review & publish (LISTING)' },
  { value: 'AS_DRAFT', label: 'Save as TikTok draft (AS_DRAFT)' },
]

const IDENTIFIER_PATTERNS = {
  GTIN: /^\d{14}$/,
  EAN: /^(\d{8}|\d{13}|\d{14})$/,
  UPC: /^\d{12}$/,
  ISBN: /^(\d{13}|\d{8}X)$/,
  JAN: /^(\d{8}|\d{13})$/,
}

export const IDENTIFIER_HINTS = {
  GTIN: '14 digits',
  EAN: '8, 13, or 14 digits',
  UPC: '12 digits',
  ISBN: '13 digits, or 8 digits ending in capital X',
  JAN: '8 or 13 digits',
}

export function validateIdentifierCode(idObj, prefix = '') {
  const code = String(idObj?.code || '').trim()
  if (!code) return ''
  const type = String(idObj?.type || '').trim().toUpperCase()
  const label = prefix ? `${prefix}: ` : ''
  if (!type || !IDENTIFIER_PATTERNS[type]) {
    return `${label}Choose an identifier type (GTIN, UPC, EAN, ISBN, or JAN) for "${code}".`
  }
  if (!IDENTIFIER_PATTERNS[type].test(code)) {
    return `${label}Invalid ${type} code "${code}" (expected ${IDENTIFIER_HINTS[type]}).`
  }
  return ''
}

export function inferIdentifierFromGtin(rawGtin) {
  const code = String(rawGtin || '').trim()
  if (!code) return { type: '', code: '' }
  if (/^\d{12}$/.test(code)) return { type: 'UPC', code }
  if (/^\d{13}$/.test(code) || /^\d{8}$/.test(code)) return { type: 'EAN', code }
  if (/^\d{14}$/.test(code)) return { type: 'GTIN', code }
  return { type: '', code: '' }
}

export function normalizeCategoryRules(raw) {
  if (Array.isArray(raw)) {
    return {
      certifications: raw,
      sizeChart: { required: false, supported: false },
      packageDimensionRequired: true,
      allowedSpecialProductTypes: [],
    }
  }
  return {
    certifications: Array.isArray(raw?.certifications) ? raw.certifications : [],
    sizeChart: {
      required: Boolean(raw?.sizeChart?.required),
      supported: Boolean(raw?.sizeChart?.supported),
    },
    packageDimensionRequired: raw?.packageDimensionRequired !== false,
    allowedSpecialProductTypes: Array.isArray(raw?.allowedSpecialProductTypes) ? raw.allowedSpecialProductTypes : [],
  }
}

export function isAttributeRequired(attr, aspects, schema) {
  if (!attr) return false
  if (attr.required) return true
  if (!attr.conditions?.length) return false
  return attr.conditions.some((condition) => {
    const parent = (schema || []).find((item) => item.id === condition.attributeId)
    const rawChosen = aspects?.[condition.attributeId]
    if (!parent || rawChosen == null) return false
    const chosenList = (Array.isArray(rawChosen) ? rawChosen : [rawChosen])
      .map((val) => String(val || '').trim())
      .filter(Boolean)
    return chosenList.some((val) => {
      const directId = parent.valueIds?.[val]
      if (directId && String(directId) === String(condition.valueId)) return true
      const lower = val.toLowerCase()
      return Object.entries(parent.valueIds || {}).some(
        ([label, id]) => String(label).toLowerCase() === lower && String(id) === String(condition.valueId),
      )
    })
  })
}

export function hasAspectValue(value) {
  if (Array.isArray(value)) return value.some((item) => String(item ?? '').trim() !== '')
  return value != null && String(value).trim() !== ''
}

export function aspectToText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
  return value != null ? String(value).trim() : ''
}

export function extractOptionGroups(variants = []) {
  if (!Array.isArray(variants) || !variants.length) return []
  const names = []
  for (const variant of variants) {
    for (const key of Object.keys(variant?.options || {})) {
      const clean = String(key || '').trim()
      if (clean && !names.includes(clean)) names.push(clean)
    }
  }
  return names.slice(0, 3).map((name, idx) => {
    const values = []
    const images = {}
    for (const variant of variants) {
      const val = String(variant?.options?.[name] ?? '').trim()
      if (!val) continue
      if (!values.includes(val)) values.push(val)
      if (idx === 0 && variant?.image && !images[val]) {
        images[val] = variant.image
      }
    }
    return { name, values, images }
  })
}

function comboSignature(options, names) {
  return names.map((name) => `${name.toLowerCase()}=${String(options?.[name] ?? '').trim().toLowerCase()}`).join('\u0000')
}

export function cleanSellerSku(value, fallback = 'TTS') {
  const cleaned = String(value || '').trim().replace(/\s+/g, '-').slice(0, 50)
  return cleaned || fallback
}

export function cartesianVariants(optionGroups = [], existingVariants = [], defaults = {}) {
  const active = (optionGroups || [])
    .map((group) => ({
      name: String(group?.name || '').trim(),
      values: [...new Set((group?.values || []).map((v) => String(v || '').trim()).filter(Boolean))],
      images: group?.images || {},
    }))
    .filter((group) => group.name && group.values.length > 0)
    .slice(0, 3)

  if (!active.length) return []

  let combos = [[]]
  for (const group of active) {
    const next = []
    for (const prefix of combos) {
      for (const val of group.values) {
        next.push([...prefix, [group.name, val]])
        if (next.length >= 300) break
      }
      if (next.length >= 300) break
    }
    combos = next
  }

  const names = active.map((g) => g.name)
  const existingBySig = new Map()
  for (const row of existingVariants || []) {
    const sig = comboSignature(row?.options, names)
    if (sig && !existingBySig.has(sig)) existingBySig.set(sig, row)
  }

  const baseSku = cleanSellerSku(defaults.baseSku, 'TTS')
  const primaryImages = active[0]?.images || {}

  return combos.map((pairs, idx) => {
    const options = Object.fromEntries(pairs)
    const sig = comboSignature(options, names)
    const prev = existingBySig.get(sig) || existingVariants[idx]
    const matchesPrev = prev && comboSignature(prev.options, names) === sig
    const val0 = pairs[0]?.[1]
    const image = (val0 && primaryImages[val0]) || (matchesPrev ? prev.image : '') || ''
    return {
      sku: (matchesPrev && prev.sku) ? prev.sku : cleanSellerSku(`${baseSku}-${idx + 1}`),
      ...(matchesPrev && prev.externalSkuId ? { externalSkuId: prev.externalSkuId } : {}),
      options,
      price: matchesPrev && prev.price !== undefined ? prev.price : (defaults.price ?? ''),
      listPrice: matchesPrev && prev.listPrice !== undefined ? prev.listPrice : (defaults.listPrice ?? ''),
      stock: matchesPrev && prev.stock !== undefined ? prev.stock : (defaults.stock ?? 1),
      ...(image ? { image } : {}),
      ...(matchesPrev && prev.identifierCode?.code ? { identifierCode: prev.identifierCode } : {}),
    }
  })
}

export function validateVariantsForTikTok(variants = [], { requireStock = true } = {}) {
  if (!Array.isArray(variants) || !variants.length) return ''
  if (variants.length > 300) return 'TikTok Shop allows at most 300 variant SKUs per product.'

  const allKeys = [...new Set(variants.flatMap((v) => Object.keys(v?.options || {}).map((k) => String(k).trim()).filter(Boolean)))]
  if (variants.length > 1 && (allKeys.length < 1 || allKeys.length > 3)) {
    return 'Multi-variant products must have 1 to 3 variant option types (e.g. Color, Size).'
  }
  if (allKeys.length > 3) return 'TikTok Shop allows at most 3 variant option types.'
  for (const key of allKeys) {
    if (key.length > 20) return `Variant option name "${key}" must be 20 characters or less.`
  }

  const seenCombos = new Set()
  const seenCodes = new Set()
  const primaryImages = new Map()

  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i] || {}
    const label = Object.values(v.options || {}).filter(Boolean).join(' / ') || `Variant ${i + 1}`
    const price = Number(v.price)
    if (!(price > 0 && price <= 7600)) {
      return `${label}: price must be between $0.01 and $7,600.00.`
    }
    if (v.listPrice != null && v.listPrice !== '' && Number(v.listPrice) > 0) {
      const lp = Number(v.listPrice)
      if (!(lp >= price && lp <= 7600)) {
        return `${label}: MSRP / list price must be between $${price.toFixed(2)} and $7,600.00.`
      }
    }
    const stock = Number(v.stock)
    if (!Number.isFinite(stock) || stock < (requireStock ? 1 : 0) || stock > 99999) {
      return `${label}: stock must be between ${requireStock ? 1 : 0} and 99,999.`
    }
    const idErr = validateIdentifierCode(v.identifierCode, label)
    if (idErr) return idErr
    const code = String(v.identifierCode?.code || '').trim()
    if (code) {
      if (seenCodes.has(code)) return `Duplicate identifier code "${code}" across variants.`
      seenCodes.add(code)
    }
    for (const key of allKeys) {
      const val = String(v.options?.[key] ?? '').trim()
      if (!val) return `${label}: missing value for "${key}".`
      if (val.length > 50) return `${label}: option value "${val}" must be 50 characters or less.`
    }
    const sig = comboSignature(v.options, allKeys)
    if (seenCombos.has(sig)) return `Duplicate variant combination: ${label}.`
    seenCombos.add(sig)

    if (allKeys.length) {
      const val0 = String(v.options?.[allKeys[0]] ?? '').trim()
      const img = String(v.image || '').trim()
      if (!primaryImages.has(val0)) primaryImages.set(val0, img)
      else if (!primaryImages.get(val0) && img) primaryImages.set(val0, img)
    }
  }

  if (allKeys.length) {
    const vals = [...primaryImages.values()]
    const withImg = vals.filter(Boolean).length
    if (withImg > 0 && withImg < vals.length) {
      return `Add an option image for every "${allKeys[0]}" value, or remove option images.`
    }
  }

  return ''
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
}
