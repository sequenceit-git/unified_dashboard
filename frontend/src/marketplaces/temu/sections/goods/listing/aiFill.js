/** Product Discovery finds: what the Temu form asks the AI to fill, and how its answers map to Temu value ids. */
import { visibleAttributes } from './temuForm'

const filledValue = (v) => Boolean(v && ((v.vids || []).length || String(v.value ?? '').trim()))
const compact = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Empty required template properties shown now, by name with their allowed values (not ones needing a unit). */
export function missingForAi(template, form) {
  return visibleAttributes(template, form)
    .filter((a) => a.required && !(a.units || []).length && !filledValue(form.attributes?.[a.templatePid]))
    .slice(0, 25)
    .map((a) => ({ id: String(a.templatePid), name: a.name, required: true, values: (a.values || []).map((v) => v.value), freeText: !(a.values || []).length }))
}

/** The AI's answers fill only empty properties: listed values become their vid, free text stays text. */
export function applyAiFill(template, form, answers) {
  const attributes = { ...(form.attributes || {}) }
  const filled = []
  for (const [pid, answer] of Object.entries(answers || {})) {
    const attr = (template?.attributes || []).find((a) => String(a.templatePid) === String(pid))
    if (!attr || (attr.units || []).length || filledValue(attributes[attr.templatePid]) || !String(answer ?? '').trim()) continue
    if ((attr.values || []).length) {
      const hit = attr.values.find((v) => compact(v.value) === compact(answer))
      if (!hit) continue
      attributes[attr.templatePid] = { vids: [hit.vid] }
    } else {
      attributes[attr.templatePid] = { value: String(answer).trim() }
    }
    filled.push(String(attr.templatePid))
  }
  return { attributes, filled }
}
