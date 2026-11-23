/** Category attribute helpers for this shop's listing forms. */
export function inferIdentifierFromGtin(rawGtin) {
  const code = String(rawGtin || '').trim()
  if (!code) return { type: '', code: '' }
  if (/^\d{12}$/.test(code)) return { type: 'UPC', code }
  if (/^\d{13}$/.test(code) || /^\d{8}$/.test(code)) return { type: 'EAN', code }
  if (/^\d{14}$/.test(code)) return { type: 'GTIN', code }
  return { type: '', code: '' }
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
