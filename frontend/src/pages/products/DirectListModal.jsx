import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ImageDropzone from '../../components/ui/ImageDropzone'
import AttributeField, { matchAspects } from '../../components/listing/AttributeField'
import { listingFormFor, useShopProfile } from '../../hooks/useShopProfiles'
import { clearDirectListing, startDirectFetch, useDirectListing } from '../../hooks/useDirectListing'
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
 * Paste a product link, then review it in that shop's own listing format.
 */
export default function DirectListModal({ shopLabel, marketplace, onClose, onCreated }) {
  const { token } = useAuth()
  const { profile } = useShopProfile(marketplace)
  const shopsRes = useApi('/api/shops')
  const shop = (shopsRes.data || []).find((item) => item.marketplace === marketplace && item.status === 'connected')
  const layout = listingFormFor(marketplace, profile, shop?.listing || {})
  const titleMax = layout.titleMax
  const maxImages = layout.maxImages
  const packageRequired = layout.package === 'required'

  const { session, update } = useDirectListing(marketplace)
  const {
    url, useAi, fetching, draft, stock, weight, length, width, height,
    schema, aspects, extras, categories, categoryId, categoryState, error, saving,
  } = session

  const categoryQuery = useDebounced((draft?.title || '').trim().slice(0, 80), 600)

  const fetchDetails = async (e) => {
    e.preventDefault()
    if (!url.trim() || fetching) return
    await startDirectFetch(marketplace, { url, useAi, token, titleMax, attributeMap })
  }

  useEffect(() => {
    if (!draft || !shop?._id || !['search', 'auto'].includes(layout.category) || !categoryQuery) return undefined
    let cancelled = false
    update({ categoryState: { loading: true, error: '' } })
    api.get(`/api/shops/${shop._id}/categories?q=${encodeURIComponent(categoryQuery)}`, token)
      .then((list) => {
        if (cancelled) return
        update((current) => ({
          categories: list || [],
          categoryId: current.categoryId && list.some((item) => item.categoryId === current.categoryId) ? current.categoryId : list[0]?.categoryId || '',
          categoryState: { loading: false, error: list?.length ? '' : 'No category matches this title. Try a more specific title.' },
        }))
      })
      .catch((err) => !cancelled && update({ categoryState: { loading: false, error: err.message } }))
    return () => { cancelled = true }
  }, [draft, shop?._id, layout.category, categoryQuery, token, update])

  useEffect(() => {
    if (!draft || !shop?._id || !layout.specifics || !categoryId) {
      if (draft && !categoryId) update({ schema: [] })
      return undefined
    }
    let cancelled = false
    api.get(`/api/shops/${shop._id}/categories/${categoryId}/attributes`, token)
      .then((list) => {
        if (cancelled) return
        const matched = matchAspects(list, draft.attributes)
        const used = new Set((list || []).map((attr) => String(attr.name).toLowerCase()))
        update((current) => ({
          schema: list || [],
          aspects: { ...matched, ...current.aspects },
          extras: Object.entries(draft.attributes)
            .filter(([name]) => !used.has(name.toLowerCase()))
            .map(([name, value]) => ({ name, value })),
        }))
      })
      .catch(() => {
        if (!cancelled) update({ schema: [] })
      })
    return () => { cancelled = true }
  }, [draft, shop?._id, layout.specifics, categoryId, token, update])

  const set = (key) => (e) => update((current) => ({ draft: { ...current.draft, [key]: e.target.value } }))
  const setAspect = (id, value) => update((current) => ({ aspects: { ...current.aspects, [id]: value } }))
  const setExtra = (index, field, value) => update((current) => ({ extras: current.extras.map((row, i) => (i === index ? { ...row, [field]: value } : row)) }))
  const setDraftImages = (images) => update((current) => ({ draft: { ...current.draft, images } }))

  const required = schema.filter((attr) => attr.required)
  const optional = schema.filter((attr) => !attr.required && attr.recommended)
  const selectedCategory = categories.find((item) => item.categoryId === categoryId)

  const namedValues = () => ({
    ...Object.fromEntries(schema.map((attr) => [attr.name, aspects[attr.id]]).filter(([, value]) => asText(value))),
    ...Object.fromEntries(extras.map((row) => [row.name.trim(), asText(row.value)]).filter(([name, value]) => name && value)),
  })

  const create = async () => {
    if (!draft.title.trim()) return update({ error: 'Add a title.' })
    if (draft.title.length > titleMax) return update({ error: `${shopLabel} titles can be at most ${titleMax} characters.` })
    if (!(Number(draft.price) > 0)) return update({ error: 'Set your selling price.' })
    if (!draft.images.length) return update({ error: 'Add at least one image.' })
    if (packageRequired && !(Number(weight) > 0)) return update({ error: `${shopLabel} needs the package weight and size.` })
    if (layout.category === 'search' && layout.canList && !categoryId) return update({ error: `Pick a ${shopLabel} category.` })
    const named = namedValues()
    const missing = required.filter((attr) => !asText(aspects[attr.id]))
    if (missing.length) return update({ error: `Fill in: ${missing.map((attr) => attr.name).join(', ')}.` })
    if (layout.canList && !shop?._id) return update({ error: `Connect ${shopLabel} in Settings first.` })
    update({ saving: true, error: '' })
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
        ...(layout.condition ? { condition: draft.condition || 'NEW' } : {}),
        ...(layout.package !== 'hidden' ? {
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

      if (layout.canList && shop?._id) {
        await api.post(`/api/products/${product._id}/list`, {
          shopId: shop._id,
          price: Number(draft.price),
          stock: Math.max(1, Math.floor(Number(stock) || 1)),
          title: draft.title.trim(),
          description: draft.description,
          images: draft.images.slice(0, maxImages),
          ...(layout.package !== 'hidden' ? {
            weight: Number(weight) || 1,
            dimensions: { length: Number(length) || 10, width: Number(width) || 10, height: Number(height) || 5, unit: 'in' },
          } : {}),
          ...(layout.condition ? { condition: draft.condition || 'NEW', brand: draft.brand.trim() || named.Brand || 'Unbranded' } : {}),
          ...(categoryId ? { categoryId } : {}),
          aspects: { ...named, ...Object.fromEntries(Object.entries(aspects).filter(([, value]) => asText(value))) },
        }, token)
        clearDirectListing(marketplace)
        onCreated(product, { listed: true })
        return
      }
      clearDirectListing(marketplace)
      onCreated(product, { listed: false })
    } catch (err) {
      update({ error: err.message, saving: false })
    }
  }

  const categoryField = (
    <>
      {layout.category === 'search' ? (
        <Select
          label={`${shopLabel} category *`}
          value={categoryId}
          onChange={(e) => update({ categoryId: e.target.value })}
          options={
            categories.length
              ? categories.map((item) => ({ value: item.categoryId, label: item.path || item.categoryName }))
              : [{ value: '', label: categoryState.loading ? 'Finding categories from the title…' : 'No category yet' }]
          }
        />
      ) : layout.category === 'auto' ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <span className="font-semibold">Category: </span>
          {categoryState.loading ? 'Asking TikTok for a suggestion…' : selectedCategory?.path || draft?.category || 'Picked when you publish'}
        </p>
      ) : (
        <Input label="Category" value={draft.category} onChange={set('category')} />
      )}
      {categoryState.error && <p className="text-xs text-red-600">{categoryState.error}</p>}
    </>
  )

  const packageFields = (
    <div className={`space-y-2 rounded-lg p-3 ${packageRequired ? 'border border-indigo-200 bg-indigo-50/50' : 'border border-gray-200 bg-gray-50/70'}`}>
      <div>
        <p className="text-xs font-semibold text-gray-700">Package{packageRequired ? ' *' : ''}</p>
        <p className="text-[11px] text-gray-500">{layout.packageNote}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input label="Weight (lbs)" type="number" step="0.1" min={packageRequired ? '0.01' : undefined} value={weight} onChange={(e) => update({ weight: e.target.value })} required={packageRequired} />
        <Input label="Length (in)" type="number" step="0.1" value={length} onChange={(e) => update({ length: e.target.value })} required={packageRequired} />
        <Input label="Width (in)" type="number" step="0.1" value={width} onChange={(e) => update({ width: e.target.value })} required={packageRequired} />
        <Input label="Height (in)" type="number" step="0.1" value={height} onChange={(e) => update({ height: e.target.value })} required={packageRequired} />
      </div>
    </div>
  )

  const specificsFields = layout.specifics && (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700">{layout.specifics.label}</p>
        <p className="text-[11px] text-gray-500">{layout.specifics.hint}</p>
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
          <summary className="cursor-pointer text-xs font-semibold text-gray-700">More {layout.specifics.label.toLowerCase()} buyers filter by</summary>
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
                <button type="button" className="px-1 text-sm text-gray-400 hover:text-red-600" onClick={() => update((current) => ({ extras: current.extras.filter((_, i) => i !== index) }))}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!schema.length && extras.length === 0 && (
        <p className="text-xs text-gray-500">
          {categoryState.loading ? `Loading ${layout.specifics.label.toLowerCase()} for this ${shopLabel} category…` : `None found yet. ${shopLabel} will ask for any it still needs when you list.`}
        </p>
      )}
    </div>
  )

  const titleField = draft ? (
    <Input
      label={`Title * (${draft.title.length}/${titleMax})`}
      value={draft.title}
      onChange={set('title')}
      maxLength={titleMax}
    />
  ) : null

  const ebayFields = draft && (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        {titleField}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Condition *" value={draft.condition || 'NEW'} onChange={set('condition')} options={CONDITIONS} />
          <Input label="Brand *" value={draft.brand} onChange={set('brand')} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Your price ($) *" type="number" step="0.01" min="0.01" value={draft.price} onChange={set('price')} />
          <Input label="Stock *" type="number" min="0" step="1" value={stock} onChange={(e) => update({ stock: e.target.value })} />
        </div>
        {draft.sourcePrice && (
          <p className="text-xs text-gray-500">The page sells it for ${Number(draft.sourcePrice).toFixed(2)}. That is saved as the base price.</p>
        )}
        {categoryField}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-gray-600">Description</span>
          <textarea rows={8} className={textareaClass} value={draft.description} onChange={set('description')} />
        </div>
        {layout.package === 'optional' && <details><summary className="cursor-pointer text-xs font-semibold text-gray-700">Package for calculated shipping (optional)</summary><div className="mt-2">{packageFields}</div></details>}
      </div>
      <div className="space-y-3">
        <ImageDropzone images={draft.images} onChange={setDraftImages} maxImages={maxImages} label={`Images (up to ${maxImages})`} />
        {specificsFields}
      </div>
    </div>
  )

  const tiktokFields = draft && (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        {titleField}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Your price ($) *" type="number" step="0.01" min="0.01" value={draft.price} onChange={set('price')} />
          <Input label="Stock *" type="number" min="1" step="1" value={stock} onChange={(e) => update({ stock: e.target.value })} />
          <Input label="Brand" value={draft.brand} onChange={set('brand')} />
        </div>
        {draft.sourcePrice && (
          <p className="text-xs text-gray-500">The page sells it for ${Number(draft.sourcePrice).toFixed(2)}. That is saved as the base price.</p>
        )}
        {categoryField}
        {packageFields}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-gray-600">Description</span>
          <textarea rows={8} className={textareaClass} value={draft.description} onChange={set('description')} />
        </div>
      </div>
      <div className="space-y-3">
        <ImageDropzone images={draft.images} onChange={setDraftImages} maxImages={maxImages} label={`Images (up to ${maxImages})`} />
        {specificsFields}
      </div>
    </div>
  )

  const temuFields = draft && (
    <div className="space-y-3">
      {titleField}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Your price ($) *" type="number" step="0.01" min="0.01" value={draft.price} onChange={set('price')} />
        <Input label="Stock *" type="number" min="0" step="1" value={stock} onChange={(e) => update({ stock: e.target.value })} />
        <Input label="Brand" value={draft.brand} onChange={set('brand')} />
      </div>
      {categoryField}
      <div>
        <span className="mb-1.5 block text-xs font-semibold text-gray-600">Description</span>
        <textarea rows={6} className={textareaClass} value={draft.description} onChange={set('description')} />
      </div>
      <ImageDropzone images={draft.images} onChange={setDraftImages} maxImages={maxImages} label={`Images (up to ${maxImages})`} />
    </div>
  )

  const draftFields = marketplace === 'tiktok_shop' ? tiktokFields : marketplace === 'temu' ? temuFields : ebayFields

  return (
    <Modal title={`Direct listing · ${shopLabel}`} onClose={onClose} size="5xl" closeOnBackdrop={!fetching && !saving}>
      <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-900">
        <p className="font-semibold">{shopLabel} listing format</p>
        <p className="mt-0.5">{profile?.productForm?.directIntro || layout.intro}</p>
        {layout.note && <p className="mt-1 text-indigo-800">{layout.note}</p>}
        {layout.apiName && <p className="mt-1 text-[11px] text-indigo-700">Uses {layout.apiName}</p>}
      </div>

      <form onSubmit={fetchDetails} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Product link"
              type="url"
              value={url}
              onChange={(e) => update({ url: e.target.value })}
              placeholder="https://www.ebay.com/itm/…, an Amazon page, a brand store page…"
              required
            />
          </div>
          <Button type="submit" disabled={fetching || !url.trim()}>
            {fetching ? 'Reading the page…' : draft ? 'Fetch again' : 'Fetch details'}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={useAi} disabled={fetching} onChange={(e) => update({ useAi: e.target.checked })} />
          Use AI (GPT-5 mini) to clean up the title and description, fill in {layout.specifics?.label?.toLowerCase() || 'details'}, and look the page up if the site blocks it
        </label>
        {fetching && <p className="text-xs text-gray-500">Reading the page with GPT-5 mini. You can close this window — the request keeps running.</p>}
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
          {draftFields}
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
        {(draft || url) && !fetching && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              clearDirectListing(marketplace)
              onClose()
            }}
          >
            Start over
          </Button>
        )}
        <Button variant="secondary" type="button" onClick={onClose}>{fetching || draft || url ? 'Hide' : 'Cancel'}</Button>
        {draft && (
          <Button type="button" onClick={create} disabled={saving || fetching}>
            {saving ? (layout.canList ? 'Publishing…' : 'Saving…') : (layout.canList ? layout.listAction : `Save to ${shopLabel}`)}
          </Button>
        )}
      </div>
    </Modal>
  )
}
