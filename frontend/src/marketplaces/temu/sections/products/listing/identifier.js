/** Product identifier codes (GTIN / UPC / EAN / ISBN / JAN) for Temu variants. */
export const IDENTIFIER_TYPES = [
  { value: '', label: 'None' },
  { value: 'GTIN', label: 'GTIN (14 digits)' },
  { value: 'UPC', label: 'UPC (12 digits)' },
  { value: 'EAN', label: 'EAN (8, 13, or 14 digits)' },
  { value: 'ISBN', label: 'ISBN (13 digits or 8 + X)' },
  { value: 'JAN', label: 'JAN (8 or 13 digits)' },
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
