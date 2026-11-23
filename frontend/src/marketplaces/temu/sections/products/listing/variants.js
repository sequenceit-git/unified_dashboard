/** Variant (SKU) helpers for this shop's variant editor. */
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

function cleanSellerSku(value, fallback = 'TEMU') {
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

  const baseSku = cleanSellerSku(defaults.baseSku, 'TEMU')
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

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
}
