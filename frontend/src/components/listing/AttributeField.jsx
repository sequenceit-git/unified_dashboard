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

/** Matches fetched page specs onto a shop's category fields, by name, case-insensitive. */
export function matchAspects(schema, known) {
  const byName = new Map(
    Object.entries(known || {})
      .filter(([, value]) => typeof value === 'string' && value.trim())
      .map(([name, value]) => [name.toLowerCase(), value.trim()]),
  )
  const next = {}
  for (const attr of schema || []) {
    const value = byName.get(String(attr.name).toLowerCase())
    if (!value) continue
    next[attr.id] = attr.freeText || !attr.values?.length || attr.values.includes(value) ? value : ''
  }
  return next
}
