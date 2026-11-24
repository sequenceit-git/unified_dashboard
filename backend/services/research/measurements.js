/**
 * Weight (lb) and size (in) from the facts the discovery agent found ("Item Weight: 500 g",
 * "Product Dimensions: 20 x 10 x 5 cm"), so a shop's listing form starts with them.
 */
const round1 = (n) => Math.round(n * 10) / 10
const TO_LB = { g: 1 / 453.592, gram: 1 / 453.592, grams: 1 / 453.592, kg: 2.20462, kilogram: 2.20462, kilograms: 2.20462, oz: 1 / 16, ounce: 1 / 16, ounces: 1 / 16, lb: 1, lbs: 1, pound: 1, pounds: 1 }
const TO_IN = { cm: 1 / 2.54, mm: 1 / 25.4, m: 39.37, in: 1, inch: 1, inches: 1, ft: 12, foot: 12, feet: 12, '"': 1 }

function weightOf(text) {
  const m = String(text).toLowerCase().match(/(\d+(?:\.\d+)?)\s*(kilograms?|kg|grams?|g|ounces?|oz|pounds?|lbs?)\b/)
  if (!m) return null
  const lb = Number(m[1]) * TO_LB[m[2]]
  return lb > 0 ? Math.max(0.1, round1(lb)) : null
}

function sizeOf(text) {
  const m = String(text).toLowerCase().match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(cm|mm|inches|inch|in|feet|foot|ft|m|")?(?![a-z])/)
  if (!m) return null
  const k = TO_IN[m[4] || 'in']
  const [length, width, height] = [m[1], m[2], m[3]].map((n) => Math.max(0.1, round1(Number(n) * k)))
  return { length, width, height }
}

function specMeasurements(specs) {
  const out = {}
  for (const spec of Array.isArray(specs) ? specs : []) {
    const name = String(spec?.name || '')
    // "Weight capacity" / "Max load" say what it holds, not what it weighs.
    if (out.weight == null && /weight/i.test(name) && !/capacity|load|max|support/i.test(name)) {
      const w = weightOf(spec.value)
      if (w != null) out.weight = w
    }
    if (!out.dimensions && /dimension/i.test(name)) {
      const d = sizeOf(spec.value)
      if (d) out.dimensions = d
    }
  }
  return out
}

module.exports = { specMeasurements }
