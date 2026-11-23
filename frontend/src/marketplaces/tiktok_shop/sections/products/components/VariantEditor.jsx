import { useState } from 'react'
import Button from '../../../../../components/ui/Button'
import { Input, Select } from '../../../../../components/ui/Input'
import IdentifierCodeField from '../listing/IdentifierCodeField'
import {
  cartesianVariants,
  extractOptionGroups,
  readFileAsDataUrl,
} from '../listing/rules'

/**
 * Multi-variant (SKU) editor shared by TikTok Shop and eBay listings:
 * - TikTok Shop: up to 3 option types, up to 300 SKUs, MSRP, primary swatch image, GTIN/UPC/EAN/ISBN/JAN
 * - eBay: up to 5 option types, up to 250 SKUs, optional variation pictures (hosted URLs), UPC/EAN/ISBN/Does not apply
 */
export default function VariantEditor({
  marketplace,
  variants = [],
  onChange,
  salesSchema = [],
  defaultPrice = '',
  defaultStock = 1,
  baseSku = '',
  lockedOptions = false,
  requireStock = true,
}) {
  const maxGroups = 3
  const maxNameLen = 20
  const maxSkus = 300

  const [groups, setGroups] = useState(() => extractOptionGroups(variants))
  const [draftValues, setDraftValues] = useState({})
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkListPrice, setBulkListPrice] = useState('')
  const [bulkStock, setBulkStock] = useState('')
  const [expandedCodes, setExpandedCodes] = useState({})

  const syncVariants = (nextGroups, currentVariants = variants) => {
    setGroups(nextGroups)
    onChange(
      cartesianVariants(nextGroups, currentVariants, {
        price: defaultPrice,
        stock: defaultStock,
        baseSku,
      }),
    )
  }

  const setVariantField = (idx, field, val) => {
    onChange(variants.map((row, i) => (i === idx ? { ...row, [field]: val } : row)))
  }

  if (lockedOptions) {
    if (!variants.length) return null
    return (
      <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Variants ({variants.length})</p>
          <span className="text-[11px] text-gray-500 dark:text-slate-400">Edit each variant&apos;s price &amp; stock</span>
        </div>
        <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {variants.map((v, idx) => {
            const label = Object.values(v.options || {}).filter(Boolean).join(' / ') || v.sku
            return (
              <div key={v.sku || idx} className="grid grid-cols-[minmax(0,1fr)_88px_76px] items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-gray-800 dark:text-slate-100">{label}</p>
                  <p className="truncate font-mono text-[10px] text-gray-400">{v.sku}</p>
                </div>
                <Input type="number" step="0.01" min="0" value={v.price ?? ''} onChange={(e) => setVariantField(idx, 'price', e.target.value)} aria-label={`Price for ${label}`} />
                <Input type="number" min="0" step="1" value={v.stock ?? 0} onChange={(e) => setVariantField(idx, 'stock', e.target.value)} aria-label={`Stock for ${label}`} />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const addOptionGroup = () => {
    if (groups.length >= maxGroups) return
    const usedNames = new Set(groups.map((g) => g.name.toLowerCase()))
    const suggested = salesSchema.find((attr) => !usedNames.has(String(attr.name).toLowerCase()))?.name
      || ['Color', 'Size', 'Style', 'Material', 'Pattern'].find((fallback) => !usedNames.has(fallback.toLowerCase()))
      || `Option ${groups.length + 1}`
    setGroups([...groups, { name: suggested, values: [], images: {} }])
  }

  const removeOptionGroup = (idx) => {
    const next = groups.filter((_, i) => i !== idx)
    syncVariants(next)
  }

  const renameOptionGroup = (idx, nextName) => {
    const next = groups.map((g, i) => (i === idx ? { ...g, name: nextName } : g))
    syncVariants(next)
  }

  const addOptionValue = (idx, rawValue) => {
    const clean = String(rawValue ?? draftValues[idx] ?? '').trim().slice(0, 50)
    if (!clean) return
    const target = groups[idx]
    if (!target || target.values.some((v) => v.toLowerCase() === clean.toLowerCase())) {
      setDraftValues((prev) => ({ ...prev, [idx]: '' }))
      return
    }
    const next = groups.map((g, i) => (i === idx ? { ...g, values: [...g.values, clean] } : g))
    setDraftValues((prev) => ({ ...prev, [idx]: '' }))
    syncVariants(next)
  }

  const removeOptionValue = (groupIdx, val) => {
    const next = groups.map((g, i) => {
      if (i !== groupIdx) return g
      const nextImages = { ...(g.images || {}) }
      delete nextImages[val]
      return { ...g, values: g.values.filter((item) => item !== val), images: nextImages }
    })
    syncVariants(next)
  }

  const setPrimaryValueImage = async (val, file) => {
    if (!file) return
    const dataUrl = await readFileAsDataUrl(file)
    let resolvedUrl = dataUrl
    const next = groups.map((g, i) => (
      i === 0 ? { ...g, images: { ...(g.images || {}), [val]: resolvedUrl } } : g
    ))
    syncVariants(next)
  }

  const clearPrimaryValueImage = (val) => {
    const next = groups.map((g, i) => {
      if (i !== 0) return g
      const nextImages = { ...(g.images || {}) }
      delete nextImages[val]
      return { ...g, images: nextImages }
    })
    syncVariants(next)
  }

  const applyBulk = () => {
    onChange(variants.map((row) => ({
      ...row,
      ...(bulkPrice !== '' ? { price: bulkPrice } : {}),
      ...(bulkListPrice !== '' ? { listPrice: bulkListPrice } : {}),
      ...(bulkStock !== '' ? { stock: bulkStock } : {}),
    })))
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xs dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {`Variants / SKUs (${variants.length})`}
          </h4>
          <p className="text-[11px] text-gray-500 dark:text-slate-400">
            Up to {maxGroups} option types (e.g. Color, Size) and up to {maxSkus} SKUs. Leave empty for a single-SKU listing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {variants.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setGroups([]); onChange([]) }}
            >
              Clear variants
            </Button>
          )}
          {groups.length < maxGroups && (
            <Button type="button" size="sm" variant="secondary" onClick={addOptionGroup}>
              + Add variant option
            </Button>
          )}
        </div>
      </div>

      {groups.map((group, idx) => {
        const matchedSalesAttr = salesSchema.find((a) => String(a.name).toLowerCase() === group.name.toLowerCase())
        const suggestionListId = `sales-opt-vals-${marketplace}-${idx}`
        return (
          <div key={idx} className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {salesSchema.length > 0 && (
                  <Select
                    label={`Option ${idx + 1} (${'TikTok sales attribute'})`}
                    value={matchedSalesAttr ? matchedSalesAttr.name : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value !== '__custom__') renameOptionGroup(idx, e.target.value)
                    }}
                    options={[
                      ...salesSchema.map((attr) => ({ value: attr.name, label: attr.name })),
                      { value: '__custom__', label: 'Custom option name…' },
                    ]}
                  />
                )}
                <Input
                  label={salesSchema.length > 0 ? `Option name (max ${maxNameLen} chars)` : `Option ${idx + 1} name`}
                  maxLength={maxNameLen}
                  value={group.name}
                  onChange={(e) => renameOptionGroup(idx, e.target.value)}
                  placeholder="e.g. Color, Size"
                />
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => removeOptionGroup(idx)}>
                Remove
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {group.values.map((val) => (
                <span key={val} className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200">
                  {idx === 0 && group.images?.[val] && (
                    <img src={group.images[val]} alt={val} className="h-4 w-4 rounded object-cover" />
                  )}
                  <span>{val}</span>
                  {idx === 0 && (
                    <label className="cursor-pointer text-[10px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300" title="Upload swatch image">
                      {group.images?.[val] ? 'Img' : '+Img'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => setPrimaryValueImage(val, e.target.files?.[0])}
                      />
                    </label>
                  )}
                  {idx === 0 && group.images?.[val] && (
                    <button type="button" onClick={() => clearPrimaryValueImage(val)} className="text-[10px] text-gray-500 hover:text-red-600" title="Clear swatch image">
                      (x)
                    </button>
                  )}
                  <button type="button" onClick={() => removeOptionValue(idx, val)} className="ml-0.5 text-indigo-500 hover:text-red-600" aria-label={`Remove ${val}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>

            {idx === 0 && group.values.length > 0 && (
              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                {`Option images are optional. If you upload an image for one "${group.name || 'option'}", upload one for every value in this group.`}
              </p>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder={`Add ${group.name || 'option'} value (e.g. Red, Large)…`}
                  maxLength={50}
                  list={matchedSalesAttr?.values?.length ? suggestionListId : undefined}
                  value={draftValues[idx] || ''}
                  onChange={(e) => setDraftValues((prev) => ({ ...prev, [idx]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addOptionValue(idx)
                    }
                  }}
                />
                {matchedSalesAttr?.values?.length > 0 && (
                  <datalist id={suggestionListId}>
                    {matchedSalesAttr.values.slice(0, 60).map((val) => <option key={val} value={val} />)}
                  </datalist>
                )}
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => addOptionValue(idx)}>
                Add
              </Button>
            </div>
          </div>
        )
      })}

      {variants.length > 1 && (
        <div className={`grid grid-cols-2 items-end gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2 dark:border-indigo-900/40 dark:bg-indigo-950/20 ${'sm:grid-cols-4'}`}>
          <Input label="All price ($)" type="number" step="0.01" min="0.01" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} />
          <Input label="All MSRP ($)" type="number" step="0.01" min="0" value={bulkListPrice} onChange={(e) => setBulkListPrice(e.target.value)} />
          <Input label="All stock" type="number" min={requireStock ? '1' : '0'} step="1" value={bulkStock} onChange={(e) => setBulkStock(e.target.value)} />
          <Button type="button" size="sm" variant="secondary" onClick={applyBulk}>
            Apply to all
          </Button>
        </div>
      )}

      {variants.length > 0 && (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {variants.map((v, idx) => {
            const label = Object.values(v.options || {}).filter(Boolean).join(' / ') || v.sku || `SKU ${idx + 1}`
            const showCode = Boolean(expandedCodes[idx] || v.identifierCode?.code)
            return (
              <div key={`${v.sku || idx}-${label}`} className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {v.image && <img src={v.image} alt={label} className="h-7 w-7 rounded object-cover border border-gray-200" />}
                    <span className="truncate text-xs font-semibold text-gray-800 dark:text-slate-100">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      onClick={() => setExpandedCodes((prev) => ({ ...prev, [idx]: !showCode }))}
                    >
                      {showCode ? ('Hide GTIN/UPC') : ('+ GTIN/UPC')}
                    </button>
                    {variants.length > 1 && (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-red-600 hover:underline"
                        onClick={() => onChange(variants.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className={`grid grid-cols-2 gap-2 ${'sm:grid-cols-4'}`}>
                  <Input
                    label="Price ($) *"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="7600"
                    value={v.price ?? ''}
                    onChange={(e) => setVariantField(idx, 'price', e.target.value)}
                  />
                  <Input
                      label="MSRP ($)"
                      type="number"
                      step="0.01"
                      min="0"
                      max="7600"
                      value={v.listPrice ?? ''}
                      onChange={(e) => setVariantField(idx, 'listPrice', e.target.value)}
                    />
                  <Input
                    label={`Stock${requireStock ? ' *' : ''}`}
                    type="number"
                    min={requireStock ? '1' : '0'}
                    max="99999"
                    step="1"
                    value={v.stock ?? 0}
                    onChange={(e) => setVariantField(idx, 'stock', e.target.value)}
                  />
                  <Input
                    label="Seller SKU"
                    maxLength={50}
                    value={v.sku ?? ''}
                    onChange={(e) => setVariantField(idx, 'sku', e.target.value)}
                  />
                </div>
                {showCode && (
                  <IdentifierCodeField
                      compact
                      label=""
                      value={v.identifierCode}
                      onChange={(val) => setVariantField(idx, 'identifierCode', val)}
                    />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
