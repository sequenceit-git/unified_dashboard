import { Input, Select } from '../ui/Input'

/** One input per marketplace attribute: a dropdown when only listed values are allowed. */
export default function AttributeField({ attr, value, onChange }) {
  const label = `${attr.name}${attr.required ? ' *' : ''}`
  if (!attr.freeText && attr.values?.length) {
    return (
      <Select
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[{ value: '', label: 'Choose…' }, ...attr.values.map((item) => ({ value: item, label: item }))]}
      />
    )
  }
  const listId = `attr-${attr.id}`.replace(/\W/g, '-')
  return (
    <>
      <Input label={label} value={value} list={attr.values?.length ? listId : undefined} onChange={(e) => onChange(e.target.value)} />
      {attr.values?.length > 0 && (
        <datalist id={listId}>
          {attr.values.map((item) => <option key={item} value={item} />)}
        </datalist>
      )}
    </>
  )
}

const ALIASES = {
  brand: ['brand', 'brand name', 'product brand', 'manufacturer'],
  color: ['color', 'colour', 'main color', 'item color', 'product color'],
  material: ['material', 'main material', 'item material'],
  model: ['model', 'model name', 'item model number', 'mpn'],
  size: ['size', 'item size', 'product size'],
  type: ['type', 'item type', 'product type'],
  capacity: ['capacity', 'volume', 'number of cups'],
  pieces: ['number of pieces', 'piece count', 'quantity'],
  scent: ['scent', 'fragrance', 'fragrance name'],
}

function tokens(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function aliasKey(name) {
  const n = tokens(name)
  for (const [canon, aliases] of Object.entries(ALIASES)) {
    if (aliases.includes(n) || aliases.some((alias) => n === alias || n.includes(alias) || alias.includes(n))) return canon
  }
  return n
}

function pickAllowed(attr, value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (attr.freeText || !attr.values?.length || attr.values.includes(text)) return text
  const compact = (item) => String(item).toLowerCase().replace(/[^a-z0-9]+/g, '')
  const target = compact(text)
  const exact = attr.values.find((item) => compact(item) === target)
  if (exact) return exact
  const close = attr.values.filter((item) => {
    const key = compact(item)
    return key.includes(target) || target.includes(key)
  })
  return close.length === 1 ? close[0] : ''
}

/** Matches fetched page specs onto a shop's category fields, by name or a close alias. */
export function matchAspects(schema, known) {
  const byName = new Map()
  const byAlias = new Map()
  for (const [name, value] of Object.entries(known || {})) {
    if (typeof value !== 'string' || !value.trim()) continue
    const text = value.trim()
    byName.set(tokens(name), text)
    const alias = aliasKey(name)
    if (alias && !byAlias.has(alias)) byAlias.set(alias, text)
  }
  const next = {}
  for (const attr of schema || []) {
    const value = byName.get(tokens(attr.name)) || byAlias.get(aliasKey(attr.name))
    const picked = pickAllowed(attr, value)
    if (picked) next[attr.id] = picked
  }
  return next
}
