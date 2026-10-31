import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ImageDropzone from '../../components/ui/ImageDropzone'
import AttributeField, { matchAspects } from '../../components/listing/AttributeField'
import { useShopProfile } from '../../hooks/useShopProfiles'
import { useApi } from '../../hooks/useApi'
import { CONDITIONS } from '../../lib/listingConditions'

const SOURCE_LABEL = {
  ebay_api: 'Read from eBay',
  page: 'Read from the page',
  ai_web_search: 'Found by AI web search',
}

const textareaClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'
const HIDDEN = new Set(['targetMarketplace', 'sourceUrl', 'gtin', 'aiOpportunityScore', 'listingUrl', 'estimatedCost'])

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function asText(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(', ')
  if (typeof value === 'object') return asText(value.value ?? value.name ?? value.text)
  return ''
}

function attributeMap(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map((row) => [row.name, asText(row.value)]).filter(([name, value]) => name && value))
  }
  return Object.fromEntries(
    Object.entries(raw || {})
      .filter(([name]) => !HIDDEN.has(name))
      .map(([name, value]) => [name, asText(value)])
      .filter(([, value]) => value),
  )
}

/**
 * Paste a product link, review the details it brings back, then create the product.
 * The fields follow this shop: eBay item specifics, TikTok attributes + package, Temu basics.
 */
export default function DirectListModal({ shopLabel, marketplace, onClose, onCreated }) {
  const { token } = useAuth()
  const { profile } = useShopProfile(marketplace)
  const shopsRes = useApi('/api/shops')
  const shop = (shopsRes.data || []).find((item) => item.marketplace === marketplace && item.status === 'connected')
  const form = profile?.productForm || {}
  const caps = shop?.listing || {}
  const titleMax = form.titleMax || caps.titleMax || 255
  const maxImages = form.maxImages || caps.maxImages || 12
  const specifics = form.specifics
  const packageDetails = form.packageDetails
  const packageRequired = Boolean(packageDetails?.required)

  const [url, setUrl] = useState('')
  const [useAi, setUseAi] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [draft, setDraft] = useState(null)
  const [stock, setStock] = useState(1)
  const [weight, setWeight] = useState(1)
  const [length, setLength] = useState(10)
  const [width, setWidth] = useState(10)
  const [height, setHeight] = useState(5)
  const [schema, setSchema] = useState([])
  const [aspects, setAspects] = useState({})
  const [extras, setExtras] = useState([])
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [categoryState, setCategoryState] = useState({ loading: false, error: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const categoryQuery = useDebounced((draft?.title || '').trim().slice(0, 80), 600)

  const fetchDetails = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    setFetching(true)
    setError('')
    try {
      const data = await api.post('/api/products/import-url', { url: url.trim(), useAi, marketplace }, token)
      const attrs = attributeMap(data.attributes)
      setDraft({
        ...data,
        title: String(data.title || '').slice(0, titleMax),
        price: data.price ?? '',
        brand: data.brand || attrs.Brand || '',
        condition: data.condition || 'NEW',
        attributes: attrs,
      })
      setSchema([])
      setAspects({})
      setExtras(Object.entries(attrs).map(([name, value]) => ({ name, value })))
      setCategories([])
      setCategoryId('')
    } catch (err) {
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    if (!draft || !shop?._id || !(caps.categorySearch || caps.categoryAutoPick) || !categoryQuery) return undefined
    let cancelled = false
    setCategoryState({ loading: true, error: '' })
    api.get(`/api/shops/${shop._id}/categories?q=${encodeURIComponent(categoryQuery)}`, token)
      .then((list) => {
        if (cancelled) return
        setCategories(list || [])
        setCategoryId((current) => (current && list.some((item) => item.categoryId === current) ? current : list[0]?.categoryId || ''))
        setCategoryState({ loading: false, error: list?.length ? '' : 'No category matches this title. Try a more specific title.' })
      })
      .catch((err) => !cancelled && setCategoryState({ loading: false, error: err.message }))
    return () => { cancelled = true }
  }, [draft, shop?._id, caps.categorySearch, caps.categoryAutoPick, categoryQuery, token])

  useEffect(() => {
    if (!draft || !shop?._id || !specifics || !categoryId) {
      if (draft && !categoryId) setSchema([])
      return undefined
    }
    let cancelled = false
    api.get(`/api/shops/${shop._id}/categories/${categoryId}/attributes`, token)
      .then((list) => {
        if (cancelled) return
        setSchema(list || [])
        const matched = matchAspects(list, draft.attributes)
        setAspects((prev) => ({ ...matched, ...prev }))
        const used = new Set((list || []).map((attr) => String(attr.name).toLowerCase()))
        setExtras(Object.entries(draft.attributes)
          .filter(([name]) => !used.has(name.toLowerCase()))
          .map(([name, value]) => ({ name, value })))
      })
      .catch(() => {
        if (!cancelled) setSchema([])
      })
    return () => { cancelled = true }
  }, [draft, shop?._id, specifics, categoryId, token])

  const set = (key) => (e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))
  const setAspect = (id, value) => setAspects((prev) => ({ ...prev, [id]: value }))
  const setExtra = (index, field, value) => setExtras((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))

  const required = schema.filter((attr) => attr.required)
  const optional = schema.filter((attr) => !attr.required && attr.recommended)
  const selectedCategory = categories.find((item) => item.categoryId === categoryId)

  const create = async () => {
    if (!draft.title.trim()) return setError('Add a title.')
    if (draft.title.length > titleMax) return setError(`${shopLabel} titles can be at most ${titleMax} characters.`)
    if (!(Number(draft.price) > 0)) return setError('Set your selling price.')
    if (!draft.images.length) return setError('Add at least one image.')
    if (packageRequired && !(Number(weight) > 0)) return setError(`${shopLabel} needs the package weight and size.`)
    const named = {
      ...Object.fromEntries(schema.map((attr) => [attr.name, aspects[attr.id]]).filter(([, value]) => asText(value))),
      ...Object.fromEntries(extras.map((row) => [row.name.trim(), asText(row.value)]).filter(([name, value]) => name && value)),
    }
    const missing = required.filter((attr) => !asText(aspects[attr.id]))
    if (missing.length) return setError(`Fill in: ${missing.map((attr) => attr.name).join(', ')}.`)
    setSaving(true)
    setError('')
    try {
      const product = await api.post('/api/products', {
        title: draft.title.trim(),
        description: draft.description,
        brand: draft.brand.trim() || named.Brand || 'Unbranded',
        category: selectedCategory?.path || draft.category,
        basePrice: Number(draft.price),
        costPrice: draft.sourcePrice || null,
        stock: Math.max(0, Math.floor(Number(stock) || 0)),
        images: draft.images.slice(0, maxImages),
        ...(form.condition ? { condition: draft.condition || 'NEW' } : {}),
        ...(packageDetails ? {
          weight: Number(weight) || 1,
          dimensions: { length: Number(length) || 10, width: Number(width) || 10, height: Number(height) || 5, unit: 'in' },
        } : {}),
        attributes: {
          ...named,
          sourceUrl: draft.sourceUrl,
          ...(marketplace ? { targetMarketplace: marketplace } : {}),
          ...(draft.gtin ? { gtin: draft.gtin } : {}),
        },
        source: 'url_import',
        status: 'draft',
      }, token)
      onCreated(product, {
        condition: draft.condition,
        aspects: { ...named, ...Object.fromEntries(Object.entries(aspects).filter(([, value]) => asText(value))) },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Direct listing · ${shopLabel}`} onClose={onClose} size="5xl">
      <form onSubmit={fetchDetails} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Product link"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.ebay.com/itm/…, an Amazon page, a brand store page…"
              required
            />
          </div>
          <Button type="submit" disabled={fetching || !url.trim()}>
            {fetching ? 'Reading the page…' : draft ? 'Fetch again' : 'Fetch details'}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
          Use AI to clean up the title and description, fill in {specifics?.label?.toLowerCase() || 'item specifics'}, and look the page up if the site blocks it
        </label>
        {fetching && <p className="text-xs text-gray-500">This can take up to 30 seconds with AI.</p>}
      </form>

      {draft && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">{SOURCE_LABEL[draft.source] || draft.source}</span>
            {draft.aiUsed && <span className="rounded bg-purple-100 px-2 py-0.5 font-medium text-purple-700">Cleaned up by AI</span>}
            <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="truncate text-indigo-600 hover:underline">{draft.sourceUrl}</a>
          </div>
          {draft.warnings?.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <Input
                label={`Title * (${draft.title.length}/${titleMax})`}
                value={draft.title}
                onChange={set('title')}
                maxLength={titleMax}
              />
              <div className={`grid grid-cols-1 gap-3 ${form.condition ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                <Input label="Your price ($) *" type="number" step="0.01" min="0.01" value={draft.price} onChange={set('price')} />
                <Input label="Stock *" type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
                {!form.condition && <Input label="Brand" value={draft.brand} onChange={set('brand')} />}
              </div>
              {form.condition && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select label="Condition" value={draft.condition || 'NEW'} onChange={set('condition')} options={CONDITIONS} />
                  <Input label="Brand" value={draft.brand} onChange={set('brand')} />
                </div>
              )}
              {draft.sourcePrice && (
                <p className="text-xs text-gray-500">The page sells it for ${Number(draft.sourcePrice).toFixed(2)}. That is saved as the base price.</p>
              )}
              {caps.categorySearch ? (
                <Select
                  label={`${shopLabel} category *`}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  options={
                    categories.length
                      ? categories.map((item) => ({ value: item.categoryId, label: item.path || item.categoryName }))
                      : [{ value: '', label: categoryState.loading ? 'Finding categories from the title…' : 'No category yet' }]
                  }
                />
              ) : caps.categoryAutoPick ? (
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Category: </span>
                  {categoryState.loading ? 'Asking for a suggestion…' : selectedCategory?.path || draft.category || 'Picked when you publish'}
                </p>
              ) : (
                <Input label="Category" value={draft.category} onChange={set('category')} />
              )}
              {categoryState.error && <p className="text-xs text-red-600">{categoryState.error}</p>}
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-gray-600">Description</span>
                <textarea rows={8} className={textareaClass} value={draft.description} onChange={set('description')} />
              </div>
              {packageDetails && (
                <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Package{packageRequired ? ' *' : ''}</p>
                    <p className="text-[11px] text-gray-500">{packageDetails.note}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input label="Weight (lbs)" type="number" step="0.1" min={packageRequired ? '0.01' : undefined} value={weight} onChange={(e) => setWeight(e.target.value)} required={packageRequired} />
                    <Input label="Length (in)" type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} required={packageRequired} />
                    <Input label="Width (in)" type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} required={packageRequired} />
                    <Input label="Height (in)" type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} required={packageRequired} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <ImageDropzone
                images={draft.images}
                onChange={(images) => setDraft((prev) => ({ ...prev, images }))}
                maxImages={maxImages}
                label={`Images (up to ${maxImages})`}
              />

              {specifics && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{specifics.label}</p>
                    <p className="text-[11px] text-gray-500">{specifics.hint}</p>
                  </div>
                  {required.length > 0 && (
                    <div className="grid grid-cols-1 gap-2">
                      {required.map((attr) => (
                        <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
                      ))}
                    </div>
                  )}
                  {optional.length > 0 && (
                    <details open={optional.some((attr) => asText(aspects[attr.id]))}>
                      <summary className="cursor-pointer text-xs font-semibold text-gray-700">More {specifics.label.toLowerCase()} buyers filter by</summary>
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        {optional.slice(0, 20).map((attr) => (
                          <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
                        ))}
                      </div>
                    </details>
                  )}
                  {extras.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-gray-600">From the product page</p>
                      <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                        {extras.map((row, index) => (
                          <div key={`${row.name}-${index}`} className="flex gap-1.5">
                            <input className={`${textareaClass} w-2/5`} value={row.name} onChange={(e) => setExtra(index, 'name', e.target.value)} />
                            <input className={`${textareaClass} flex-1`} value={row.value} onChange={(e) => setExtra(index, 'value', e.target.value)} />
                            <button type="button" className="px-1 text-sm text-gray-400 hover:text-red-600" onClick={() => setExtras((prev) => prev.filter((_, i) => i !== index))}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!schema.length && extras.length === 0 && (
                    <p className="text-xs text-gray-500">
                      {categoryState.loading ? `Loading ${specifics.label.toLowerCase()} for this ${shopLabel} category…` : `None found yet. ${shopLabel} will ask for any it still needs when you list.`}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        {draft && (
          <Button type="button" onClick={create} disabled={saving}>
            {saving ? 'Saving…' : caps.canList === false ? `Save to ${shopLabel}` : form.listAction || `Save and list on ${shopLabel}`}
          </Button>
        )}
      </div>
    </Modal>
  )
}
