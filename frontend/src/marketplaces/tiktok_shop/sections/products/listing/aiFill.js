/** Product Discovery finds: what this shop's List form asks the AI to fill, and how its answers apply. */
import { hasAspectValue } from './rules'

/** Empty required or recommended fields of the category, in the shape the AI fill takes. */
export function missingForAi(attributes, aspects) {
  return (attributes || [])
    .filter((attr) => (attr.required || attr.recommended) && !hasAspectValue(aspects?.[attr.id]))
    .slice(0, 25)
    .map((attr) => ({ id: attr.id, name: attr.name, required: Boolean(attr.required), values: attr.values || [], freeText: Boolean(attr.freeText) }))
}

/** The AI's answers fill only fields still empty; `filled` lists the ones it filled (to highlight). */
export function applyAiFill(aspects, answers) {
  const next = { ...(aspects || {}) }
  const filled = []
  for (const [id, value] of Object.entries(answers || {})) {
    if (hasAspectValue(next[id]) || !hasAspectValue(value)) continue
    next[id] = value
    filled.push(id)
  }
  return { aspects: next, filled }
}
