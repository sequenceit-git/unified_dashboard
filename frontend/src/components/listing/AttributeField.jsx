import { useState } from 'react'
import { Input, Select } from '../ui/Input'

/** One input per marketplace attribute: supports single/multi-select and dropdown/freeText modes. */
export default function AttributeField({ attr, value, onChange, requiredOverride }) {
  const [draft, setDraft] = useState('')
  const isRequired = Boolean(requiredOverride ?? attr.required)
  const label = `${attr.name}${isRequired ? ' *' : ''}`

  if (attr.multiple) {
    const selected = (Array.isArray(value) ? value : value ? [value] : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
    const addValue = (nextVal) => {
      const clean = String(nextVal || '').trim()
      if (!clean || selected.some((item) => item.toLowerCase() === clean.toLowerCase())) return
      onChange([...selected, clean])
      setDraft('')
    }
    const removeValue = (target) => {
      onChange(selected.filter((item) => item !== target))
    }
    const available = (attr.values || []).filter((item) => !selected.includes(item))
    const listId = `attr-multi-${attr.id}`.replace(/\W/g, '-')

    return (
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold text-gray-600 dark:text-slate-300">{label}</span>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200"
              >
                <span>{item}</span>
                <button type="button" onClick={() => removeValue(item)} className="text-indigo-500 hover:text-red-600" aria-label={`Remove ${item}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {!attr.freeText && attr.values?.length > 0 ? (
          <Select
            aria-label={attr.name}
            value=""
            onChange={(e) => addValue(e.target.value)}
            options={[{ value: '', label: selected.length ? 'Add another…' : 'Choose…' }, ...available.map((item) => ({ value: item, label: item }))]}
          />
        ) : (
          <div className="flex gap-1.5">
            <div className="flex-1">
              <Input
                aria-label={attr.name}
                value={draft}
                placeholder={selected.length ? 'Add another value…' : 'Type or pick a value…'}
                list={available.length ? listId : undefined}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addValue(draft)
                  }
                }}
              />
              {available.length > 0 && (
                <datalist id={listId}>
                  {available.slice(0, 80).map((item) => <option key={item} value={item} />)}
                </datalist>
              )}
            </div>
            <button
              type="button"
              onClick={() => addValue(draft)}
              className="rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Add
            </button>
          </div>
        )}
      </div>
    )
  }

  const textValue = Array.isArray(value) ? value[0] || '' : (value || '')
  if (!attr.freeText && attr.values?.length) {
    return (
      <Select
        label={label}
        value={textValue}
        onChange={(e) => onChange(e.target.value)}
        options={[{ value: '', label: 'Choose…' }, ...attr.values.map((item) => ({ value: item, label: item }))]}
      />
    )
  }
  const listId = `attr-${attr.id}`.replace(/\W/g, '-')
  return (
    <>
      <Input label={label} value={textValue} list={attr.values?.length ? listId : undefined} onChange={(e) => onChange(e.target.value)} />
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
    if (attr.type === 'sales') continue
    const value = byName.get(tokens(attr.name)) || byAlias.get(aliasKey(attr.name))
    const picked = pickAllowed(attr, value)
    if (picked) next[attr.id] = attr.multiple ? [picked] : picked
  }
  return next
}
