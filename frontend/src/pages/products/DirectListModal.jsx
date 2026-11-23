import { useEffect, useState } from 'react'
import { getShop } from '../../marketplaces'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ImageDropzone from '../../components/ui/ImageDropzone'
import AttributeField, { matchAspects } from '../../components/listing/AttributeField'
import BrandPicker from '../../marketplaces/tiktok_shop/listing/BrandPicker'
import CertificationFields, { certificationNeeded, certificationPayload } from '../../marketplaces/tiktok_shop/listing/CertificationFields'
import IdentifierCodeField from '../../marketplaces/tiktok_shop/listing/IdentifierCodeField'
import EbayIdentifierField from '../../marketplaces/ebay/listing/IdentifierField'
import EbayBestOfferField from '../../marketplaces/ebay/listing/BestOfferField'
import SizeChartField from '../../marketplaces/tiktok_shop/listing/SizeChartField'
import VariantEditor from '../../components/listing/VariantEditor'
import {
  SAVE_MODES,
  aspectToText,
  hasAspectValue,
  isAttributeRequired,
  normalizeCategoryRules,
  validateIdentifierCode,
  validateVariantsForTikTok,
} from '../../marketplaces/tiktok_shop/listing/rules'
import {
  DISPATCH_TIMES,
  isNewCondition,
  normalizeEbayCategoryRules,
  resolveEbayCondition,
  validateBestOffer,
  validateEbayIdentifierCode,
  validateVariantsForEbay,
} from '../../marketplaces/ebay/listing/rules'
import { listingFormFor, useShopProfile } from '../../hooks/useShopProfiles'
import { clearDirectListing, startDirectFetch, useDirectListing } from '../../hooks/useDirectListing'
import { useApi } from '../../hooks/useApi'
import { CONDITIONS } from '../../lib/listingConditions'

const SOURCE_LABEL = {
  ebay_api: 'Read from eBay',
  page: 'Read from the page',
  ai_web_search: 'Found by AI web search',
}

const textareaClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base sm:text-sm shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'
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
  const subtitleMax = layout.subtitleMax || 55
  const maxImages = layout.maxImages
  const packageRequired = layout.package === 'required'
  // The shop decides which listing field set it uses (src/marketplaces/<key>/index.js → listing).
  const listing = getShop(marketplace)?.listing || {}
  const isTikTok = Boolean(listing.tiktokFields)
  const isEbay = Boolean(listing.ebayFields)

  const { session, update } = useDirectListing(marketplace)
  const {
    url, useAi, fetching, draft, stock, listPrice, sellerSku, brandId,
    subtitle, conditionDescription, mpn, dispatchTimeMax, bestOffer,
    identifierCode, variants, sizeChart, saveMode, weight, length, width, height,
    schema, aspects, extras, categories, categoryId, categorySearch, categoryState,
    fillingAttributes, categoryRules, ebayRules, certifications, error, saving,
  } = session

  const rawCategoryQuery = ((isTikTok || isEbay) && String(categorySearch || '').trim())
    ? String(categorySearch).trim()
    : (draft?.title || '').trim().slice(0, 80)
  const categoryQuery = useDebounced(rawCategoryQuery, 600)

  const fetchDetails = async (e) => {
    e.preventDefault()
    if (!url.trim() || fetching) return
    await startDirectFetch(marketplace, { url, useAi, token, titleMax, attributeMap })
  }

  useEffect(() => {
    if (!draft || !shop?._id || !['search', 'auto', 'auto-search'].includes(layout.category) || !categoryQuery) return undefined
    let cancelled = false
    const mode = isTikTok && String(categorySearch || '').trim() ? 'search' : 'auto'
    const queryUrl = `/api/shops/${shop._id}/categories?q=${encodeURIComponent(categoryQuery)}${isTikTok ? `&mode=${mode}` : ''}`
    api.get(queryUrl, token)
      .then((list) => {
        if (cancelled) return
        update((current) => ({
          categories: list || [],
          categoryId: current.categoryId && list.some((item) => item.categoryId === current.categoryId) ? current.categoryId : list[0]?.categoryId || '',
          categoryState: { loading: false, error: list?.length ? '' : 'No category matches this title. Try a more specific title or keyword.' },
        }))
      })
      .catch((err) => !cancelled && update({ categoryState: { loading: false, error: err.message } }))
    return () => { cancelled = true }
  }, [draft, shop?._id, layout.category, categoryQuery, token, update, isTikTok, categorySearch])

  const draftSourceUrl = draft?.sourceUrl
  const draftTitle = draft?.title
  const draftDesc = draft?.description
  const draftBrand = draft?.brand
  const draftAttrs = draft?.attributes

  useEffect(() => {
    if (!draftSourceUrl || !shop?._id || !layout.specifics || !categoryId) return undefined
    let cancelled = false
    const known = { ...draftAttrs, ...(draftBrand ? { Brand: draftBrand } : {}) }
    api.get(`/api/shops/${shop._id}/categories/${categoryId}/attributes`, token)
      .then(async (list) => {
        if (cancelled) return
        const all = list || []
        const productList = all.filter((attr) => attr.type !== 'sales')
        const matched = matchAspects(productList, known)
        const used = new Set(productList.map((attr) => String(attr.name).toLowerCase()))
        update((current) => ({
          schema: all,
          aspects: {
            ...matched,
            ...Object.fromEntries(Object.entries(current.aspects || {}).filter(([, value]) => hasAspectValue(value))),
          },
          extras: Object.entries(draftAttrs || {})
            .filter(([name]) => !used.has(name.toLowerCase()))
            .map(([name, value]) => ({ name, value })),
        }))
        const missing = productList
          .filter((attr) => (attr.required || attr.recommended || isTikTok) && !hasAspectValue(matched[attr.id]))
          .slice(0, 25)
        if (!useAi || !missing.length) return
        update({ fillingAttributes: true })
        try {
          const filled = await api.post('/api/products/fill-attributes', {
            title: draftTitle,
            description: draftDesc,
            brand: draftBrand,
            attributes: known,
            schema: missing.map((attr) => ({
              id: attr.id,
              name: attr.name,
              required: attr.required,
              values: attr.values,
              freeText: attr.freeText,
            })),
          }, token)
          if (cancelled) return
          update((current) => ({
            fillingAttributes: false,
            aspects: {
              ...filled,
              ...Object.fromEntries(Object.entries(current.aspects || {}).filter(([, value]) => hasAspectValue(value))),
            },
          }))
        } catch {
          if (!cancelled) update({ fillingAttributes: false })
        }
      })
      .catch(() => {
        if (!cancelled) update({ schema: [], fillingAttributes: false })
      })
    return () => { cancelled = true }
  }, [draftSourceUrl, draftTitle, draftDesc, draftBrand, draftAttrs, shop?._id, layout.specifics, categoryId, token, update, useAi, marketplace])

  useEffect(() => {
    if (!['tiktok_shop', 'ebay'].includes(marketplace) || !shop?._id || !categoryId) return undefined
    let cancelled = false
    api.get(`/api/shops/${shop._id}/categories/${categoryId}/rules`, token)
      .then((rules) => {
        if (cancelled) return
        if (isTikTok) {
          update({ categoryRules: normalizeCategoryRules(rules) })
        } else {
          const normalized = normalizeEbayCategoryRules(rules)
          update((cur) => ({
            ebayRules: normalized,
            ...(normalized.conditions.length && cur.draft
              ? { draft: { ...cur.draft, condition: resolveEbayCondition(cur.draft.condition, normalized.conditions) } }
              : {}),
          }))
        }
      })
      .catch(() => {
        if (cancelled) return
        if (isTikTok) update({ categoryRules: normalizeCategoryRules([]) })
        else update({ ebayRules: normalizeEbayCategoryRules(null) })
      })
    return () => { cancelled = true }
  }, [marketplace, shop?._id, categoryId, token, update])

  const set = (key) => (e) => update((current) => ({ draft: { ...current.draft, [key]: e.target.value } }))
  const setAspect = (id, value) => update((current) => ({ aspects: { ...current.aspects, [id]: value } }))
  const setExtra = (index, field, value) => update((current) => ({ extras: current.extras.map((row, i) => (i === index ? { ...row, [field]: value } : row)) }))
  const setDraftImages = (images) => update((current) => ({ draft: { ...current.draft, images } }))

  const rules = normalizeCategoryRules(categoryRules)
  const parsedEbayRules = normalizeEbayCategoryRules(ebayRules)
  const activeVariants = isTikTok
    ? (variants || [])
    : (isEbay && parsedEbayRules.variationsEnabled !== false ? (variants || []) : [])
  const activeVarNames = new Set(
    activeVariants.flatMap((v) => Object.keys(v.options || {}).map((k) => k.trim().toLowerCase())).filter(Boolean),
  )

  const baseProductSchema = schema.filter((attr) => attr.type !== 'sales')
  const productSchema = isEbay
    ? baseProductSchema.filter((attr) => !activeVarNames.has(String(attr.name).trim().toLowerCase()))
    : baseProductSchema
  const salesSchema = isTikTok
    ? schema.filter((attr) => attr.type === 'sales')
    : schema.filter((attr) => attr.variationEnabled)

  const required = productSchema.filter((attr) => isAttributeRequired(attr, aspects, productSchema))
  const optional = productSchema.filter((attr) => !isAttributeRequired(attr, aspects, productSchema) && (attr.recommended || isTikTok))
  const selectedCategory = categories.find((item) => item.categoryId === categoryId)

  const positiveVariantPrices = activeVariants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
  const summaryPrice = positiveVariantPrices.length ? Math.min(...positiveVariantPrices) : 0
  const summaryStock = activeVariants.reduce((sum, v) => sum + Math.max(0, Math.floor(Number(v.stock) || 0)), 0)

  const namedValues = () => ({
    ...Object.fromEntries(productSchema.map((attr) => [attr.name, aspectToText(aspects[attr.id])]).filter(([, value]) => value)),
    ...Object.fromEntries(extras.map((row) => [row.name.trim(), asText(row.value)]).filter(([name, value]) => name && value)),
  })

  const create = async () => {
    if (!draft.title.trim()) return update({ error: 'Add a title.' })
    if (draft.title.length > titleMax) return update({ error: `${shopLabel} titles can be at most ${titleMax} characters.` })
    if (isEbay && (subtitle || '').length > subtitleMax) {
      return update({ error: `eBay subtitles can be at most ${subtitleMax} characters.` })
    }

    if (isTikTok && activeVariants.length > 0) {
      const varErr = validateVariantsForTikTok(activeVariants, { requireStock: true })
      if (varErr) return update({ error: varErr })
    } else if (isEbay && activeVariants.length > 0) {
      const varErr = validateVariantsForEbay(activeVariants, { requireStock: true })
      if (varErr) return update({ error: varErr })
    } else {
      const numPrice = Number(draft.price)
      if (!(numPrice > 0) || (isTikTok && numPrice > 7600)) {
        return update({ error: isTikTok ? 'Set a selling price between $0.01 and $7,600.00.' : 'Set your selling price.' })
      }
      if (layout.canList && (!(Number(stock) >= 1) || (isTikTok && Number(stock) > 99999))) {
        return update({ error: isTikTok ? 'Set stock between 1 and 99,999.' : 'Set stock to at least 1 before listing.' })
      }
      if (isTikTok && listPrice !== '' && listPrice != null && Number(listPrice) > 0) {
        if (Number(listPrice) < numPrice || Number(listPrice) > 7600) {
          return update({ error: `MSRP / list price must be between $${numPrice.toFixed(2)} and $7,600.00.` })
        }
      }
      if (isTikTok) {
        const idErr = validateIdentifierCode(identifierCode)
        if (idErr) return update({ error: idErr })
      }
      if (isEbay) {
        if (parsedEbayRules.upcEnabled === 'Required' && !String(identifierCode?.code || '').trim()) {
          return update({ error: 'This eBay category requires a product identifier (or click "Does not apply").' })
        }
        const idErr = validateEbayIdentifierCode(identifierCode)
        if (idErr) return update({ error: idErr })
      }
    }

    if (isEbay && parsedEbayRules.bestOfferEnabled !== false) {
      const boErr = validateBestOffer(bestOffer, activeVariants.length > 0 ? summaryPrice : Number(draft.price))
      if (boErr) return update({ error: boErr })
    }

    if (!draft.images.length) return update({ error: 'Add at least one image.' })
    if (packageRequired && !(Number(weight) > 0)) return update({ error: `${shopLabel} needs the package weight and size.` })
    if (layout.category === 'search' && layout.canList && !categoryId) return update({ error: `Pick a ${shopLabel} category.` })

    const named = namedValues()
    const isDraftMode = isTikTok && saveMode === 'AS_DRAFT'
    if (!isDraftMode) {
      const missing = required.filter((attr) => !hasAspectValue(aspects[attr.id]))
      if (missing.length) return update({ error: `Fill in: ${missing.map((attr) => attr.name).join(', ')}.` })
      const missingCerts = rules.certifications.filter((rule) => certificationNeeded(rule, aspects, productSchema) && !certifications?.[rule.id]?.file)
      if (missingCerts.length) return update({ error: `Upload: ${missingCerts.map((rule) => rule.name).join(', ')}.` })
      if (isTikTok && rules.sizeChart?.required && !sizeChart?.templateId && !sizeChart?.image) {
        return update({ error: 'TikTok Shop requires a size chart for this category.' })
      }
    }
    if (layout.canList && !shop?._id) return update({ error: `Connect ${shopLabel} in Settings first.` })

    update({ saving: true, error: '' })
    try {
      const normalizedVariants = activeVariants.length > 0
        ? activeVariants.map((v) => ({
            ...v,
            price: Number(v.price),
            ...(v.listPrice !== '' && v.listPrice != null && Number(v.listPrice) > 0 ? { listPrice: Number(v.listPrice) } : {}),
            stock: Math.max(1, Math.floor(Number(v.stock) || 1)),
          }))
        : undefined
      const cleanIdCode = !normalizedVariants && String(identifierCode?.code || '').trim()
        ? { type: String(identifierCode.type || '').toUpperCase(), code: String(identifierCode.code).trim() }
        : undefined
      const cleanBestOffer = isEbay
        ? (bestOffer?.enabled
            ? {
                enabled: true,
                ...(bestOffer.autoAcceptPrice !== '' && bestOffer.autoAcceptPrice != null
                  ? { autoAcceptPrice: Number(bestOffer.autoAcceptPrice) }
                  : {}),
                ...(bestOffer.minOfferPrice !== '' && bestOffer.minOfferPrice != null
                  ? { minOfferPrice: Number(bestOffer.minOfferPrice) }
                  : {}),
              }
            : { enabled: false })
        : undefined
      const finalPrice = normalizedVariants ? summaryPrice : Number(draft.price)
      const finalStock = normalizedVariants ? summaryStock : Math.max(0, Math.floor(Number(stock) || 0))

      const product = await api.post('/api/products', {
        ...(sellerSku?.trim() && !normalizedVariants ? { sku: sellerSku.trim() } : {}),
        title: draft.title.trim(),
        ...(isEbay ? {
          subtitle: String(subtitle || '').trim().slice(0, 55),
          conditionDescription: isNewCondition(draft.condition) ? '' : String(conditionDescription || '').trim().slice(0, 1000),
          mpn: String(mpn || '').trim(),
          ...(dispatchTimeMax !== '' ? { dispatchTimeMax: Number(dispatchTimeMax) } : {}),
          bestOffer: cleanBestOffer,
        } : {}),
        description: draft.description,
        brand: draft.brand.trim() || named.Brand || 'Unbranded',
        ...(isTikTok && brandId ? { brandId } : {}),
        category: selectedCategory?.path || draft.category,
        basePrice: finalPrice,
        ...(isTikTok && !normalizedVariants && listPrice !== '' && Number(listPrice) > 0 ? { listPrice: Number(listPrice) } : {}),
        costPrice: draft.sourcePrice || null,
        stock: finalStock,
        images: draft.images.slice(0, maxImages),
        ...(normalizedVariants ? { variants: normalizedVariants } : {}),
        ...(cleanIdCode ? { identifierCode: cleanIdCode } : {}),
        ...(isTikTok && (sizeChart?.templateId || sizeChart?.image) ? { sizeChart } : {}),
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
        const aspectEntries = [
          ...productSchema
            .map((attr) => {
              const val = aspects[attr.id]
              if (Array.isArray(val)) return [attr.id, val.map((v) => String(v || '').trim()).filter(Boolean)]
              return [attr.id, String(val || '').trim()]
            })
            .filter(([, val]) => (Array.isArray(val) ? val.length > 0 : Boolean(val))),
          ...extras
            .filter((row) => (
              row.name.trim()
              && asText(row.value)
              && !productSchema.some((attr) => String(attr.name).toLowerCase() === row.name.trim().toLowerCase())
              && (!isEbay || !activeVarNames.has(row.name.trim().toLowerCase()))
            ))
            .map((row) => [row.name.trim(), asText(row.value)]),
        ]

        await api.post(`/api/products/${product._id}/list`, {
          shopId: shop._id,
          price: finalPrice,
          stock: normalizedVariants ? summaryStock : Math.max(1, Math.floor(Number(stock) || 1)),
          title: draft.title.trim(),
          description: draft.description,
          images: draft.images.slice(0, maxImages),
          ...(layout.package !== 'hidden' ? {
            weight: Number(weight) || 1,
            dimensions: { length: Number(length) || 10, width: Number(width) || 10, height: Number(height) || 5, unit: 'in' },
          } : {}),
          ...(isEbay ? {
            subtitle: String(subtitle || '').trim().slice(0, 55),
            condition: draft.condition || 'NEW',
            conditionEnabled: parsedEbayRules.conditionEnabled,
            conditionDescription: isNewCondition(draft.condition) ? '' : String(conditionDescription || '').trim().slice(0, 1000),
            brand: draft.brand.trim() || named.Brand || 'Unbranded',
            ...(mpn?.trim() ? { mpn: mpn.trim() } : {}),
            ...(sellerSku?.trim() ? { sellerSku: sellerSku.trim() } : {}),
            ...(cleanIdCode ? { identifierCode: cleanIdCode } : {}),
            ...(normalizedVariants ? { variants: normalizedVariants } : {}),
            ...(dispatchTimeMax !== '' ? { dispatchTimeMax: Number(dispatchTimeMax) } : {}),
            bestOffer: cleanBestOffer,
          } : {}),
          ...(isTikTok ? {
            brand: draft.brand.trim() || named.Brand || 'Unbranded',
            ...(brandId ? { brandId } : {}),
            ...(listPrice !== '' && Number(listPrice) > 0 && !normalizedVariants ? { listPrice: Number(listPrice) } : {}),
            ...(sellerSku?.trim() ? { sellerSku: sellerSku.trim() } : {}),
            ...(cleanIdCode ? { identifierCode: cleanIdCode } : {}),
            ...(normalizedVariants ? { variants: normalizedVariants } : {}),
            ...(sizeChart?.templateId || sizeChart?.image ? { sizeChart } : {}),
            saveMode: saveMode || 'LISTING',
          } : {}),
          ...(categoryId ? { categoryId } : {}),
          certifications: certificationPayload(rules.certifications, aspects, productSchema, certifications),
          aspects: Object.fromEntries(aspectEntries),
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
        isEbay ? (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                label="Search eBay categories (optional)"
                value={categorySearch || ''}
                onChange={(e) => update({ categorySearch: e.target.value })}
                placeholder="Auto-suggested from title; search to override…"
              />
              <Select
                label={`${shopLabel} category *`}
                value={categoryId}
                onChange={(e) => update({ categoryId: e.target.value })}
                options={
                  categories.length
                    ? categories.map((item) => ({ value: item.categoryId, label: item.path || item.categoryName }))
                    : [{ value: '', label: categoryState.loading ? 'Finding categories…' : 'No category yet' }]
                }
              />
            </div>
            {selectedCategory && (
              <p className="text-[11px] text-gray-600">Category #{selectedCategory.categoryId}: {selectedCategory.path}</p>
            )}
          </div>
        ) : (
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
        )
      ) : layout.category === 'auto-search' ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              label="Search TikTok categories (optional)"
              value={categorySearch || ''}
              onChange={(e) => update({ categorySearch: e.target.value })}
              placeholder="Auto-picked from title; search to override…"
            />
            <Select
              label={`${shopLabel} category *`}
              value={categoryId}
              onChange={(e) => update({ categoryId: e.target.value })}
              options={
                categories.length
                  ? categories.map((item) => ({
                      value: item.categoryId,
                      label: `${item.recommended ? 'Recommended: ' : ''}${item.path || item.categoryName}`,
                    }))
                  : [{ value: '', label: categoryState.loading ? 'Finding categories…' : 'No category yet' }]
              }
            />
          </div>
          {selectedCategory && (
            <p className="text-[11px] text-gray-600">
              Leaf ID {selectedCategory.categoryId}: {selectedCategory.path}
            </p>
          )}
        </div>
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
            <AttributeField
              key={attr.id}
              attr={attr}
              requiredOverride
              value={aspects[attr.id] || ''}
              onChange={(value) => setAspect(attr.id, value)}
            />
          ))}
        </div>
      )}
      {optional.length > 0 && (
        <>
          {fillingAttributes && <p className="text-xs text-gray-500">Filling {layout.specifics.label.toLowerCase()} with GPT-5 mini…</p>}
          <details open={optional.some((attr) => hasAspectValue(aspects[attr.id])) || fillingAttributes}>
            <summary className="cursor-pointer text-xs font-semibold text-gray-700">More {layout.specifics.label.toLowerCase()} buyers filter by ({optional.length})</summary>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {optional.slice(0, 30).map((attr) => (
                <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
              ))}
            </div>
          </details>
        </>
      )}
      <CertificationFields
        rules={rules.certifications}
        aspects={aspects}
        schema={productSchema}
        files={certifications}
        onChange={(id, value) => update((current) => ({ certifications: { ...current.certifications, [id]: value } }))}
      />
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
      {!productSchema.length && extras.length === 0 && (
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

  const ebayConditionOptions = parsedEbayRules.conditions.length
    ? parsedEbayRules.conditions.map((c) => ({ value: c.id, label: c.name }))
    : CONDITIONS

  const ebayFields = draft && (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        {titleField}
        <Input
          label={`Subtitle (optional, ${(subtitle || '').length}/${subtitleMax} — extra eBay fee may apply)`}
          maxLength={subtitleMax}
          value={subtitle || ''}
          onChange={(e) => update({ subtitle: e.target.value })}
          placeholder="Supplemental keywords displayed under title"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {parsedEbayRules.conditionEnabled !== 'Disabled' && (
            <Select
              label={`Condition${parsedEbayRules.conditionEnabled === 'Required' ? ' *' : ''}`}
              value={draft.condition || 'NEW'}
              onChange={set('condition')}
              options={ebayConditionOptions}
            />
          )}
          <Input label="Brand *" value={draft.brand} onChange={set('brand')} />
          <Input label="MPN (optional)" value={mpn || ''} onChange={(e) => update({ mpn: e.target.value })} placeholder="Manufacturer Part Number" />
        </div>
        {parsedEbayRules.conditionEnabled !== 'Disabled' && !isNewCondition(draft.condition) && (
          <div>
            <span className="mb-1 block text-xs font-semibold text-gray-600">
              Condition description ({(conditionDescription || '').length}/1000)
            </span>
            <textarea
              rows={2}
              maxLength={1000}
              className={textareaClass}
              value={conditionDescription || ''}
              onChange={(e) => update({ conditionDescription: e.target.value })}
              placeholder="Describe wear, scratches, or missing accessories…"
            />
          </div>
        )}
        {activeVariants.length === 0 ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="Your price ($) *" type="number" step="0.01" min="0.01" value={draft.price} onChange={set('price')} />
              <Input label="Stock *" type="number" min="1" step="1" value={stock} onChange={(e) => update({ stock: e.target.value })} />
              <Input label="Seller SKU (optional)" maxLength={50} value={sellerSku || ''} onChange={(e) => update({ sellerSku: e.target.value })} placeholder="Auto-generated" />
            </div>
            <EbayIdentifierField
              required={parsedEbayRules.upcEnabled === 'Required'}
              value={identifierCode}
              onChange={(val) => update({ identifierCode: val })}
            />
          </>
        ) : (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900 flex items-center justify-between">
            <span><strong>{activeVariants.length} variations</strong> configured below</span>
            <span>From <strong>${summaryPrice.toFixed(2)}</strong> · <strong>{summaryStock}</strong> units</span>
          </div>
        )}
        {draft.sourcePrice && (
          <p className="text-xs text-gray-500">The page sells it for ${Number(draft.sourcePrice).toFixed(2)}. That is saved as the base price.</p>
        )}
        {categoryField}
        {parsedEbayRules.variationsEnabled !== false ? (
          <VariantEditor
            key={`ebay-${draft.sourceUrl || 'direct'}`}
            marketplace="ebay"
            variants={activeVariants}
            onChange={(next) => update({ variants: next })}
            salesSchema={salesSchema}
            listingImages={draft.images}
            defaultPrice={draft.price}
            defaultStock={stock}
            baseSku={sellerSku || 'EBAY'}
            requireStock
          />
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This eBay category does not support multi-variation listings.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {parsedEbayRules.bestOfferEnabled !== false && (
            <EbayBestOfferField
              value={bestOffer}
              onChange={(val) => update({ bestOffer: val })}
              minPrice={activeVariants.length > 0 ? summaryPrice : Number(draft.price)}
            />
          )}
          <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
            <Select
              label="Handling time"
              value={dispatchTimeMax || ''}
              onChange={(e) => update({ dispatchTimeMax: e.target.value })}
              options={DISPATCH_TIMES}
            />
          </div>
        </div>
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
        {activeVariants.length === 0 ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="Your price ($) *" type="number" step="0.01" min="0.01" max="7600" value={draft.price} onChange={set('price')} />
              <Input label="MSRP / List ($)" type="number" step="0.01" min="0" max="7600" value={listPrice ?? ''} onChange={(e) => update({ listPrice: e.target.value })} placeholder="Optional" />
              <Input label="Stock *" type="number" min="1" max="99999" step="1" value={stock} onChange={(e) => update({ stock: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Seller SKU (optional)" maxLength={50} value={sellerSku || ''} onChange={(e) => update({ sellerSku: e.target.value })} placeholder="Auto-generated if blank" />
              <div className="sm:col-span-2">
                <IdentifierCodeField
                  value={identifierCode}
                  onChange={(val) => update({ identifierCode: val })}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900 flex items-center justify-between">
            <span><strong>{activeVariants.length} variants</strong> configured below</span>
            <span>From <strong>${summaryPrice.toFixed(2)}</strong> · <strong>{summaryStock}</strong> units</span>
          </div>
        )}
        {draft.sourcePrice && (
          <p className="text-xs text-gray-500">The page sells it for ${Number(draft.sourcePrice).toFixed(2)}. That is saved as the base price.</p>
        )}
        {categoryField}
        <BrandPicker
          shopId={shop?._id}
          categoryId={categoryId}
          brandId={brandId || ''}
          brand={draft.brand}
          onChange={({ brandId: nextId, brand: nextBrand }) => update((cur) => ({ brandId: nextId, draft: { ...cur.draft, brand: nextBrand } }))}
        />
        <VariantEditor
          key={draft.sourceUrl || 'direct-tiktok'}
          variants={activeVariants}
          onChange={(next) => update({ variants: next })}
          salesSchema={salesSchema}
          defaultPrice={draft.price}
          defaultStock={stock}
          baseSku={sellerSku || 'TTS'}
          requireStock
        />
        {packageFields}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Description</span>
            <span className="text-[11px] text-gray-400">{(draft.description || '').length}/10000</span>
          </div>
          <textarea rows={6} maxLength={10000} className={textareaClass} value={draft.description} onChange={set('description')} />
        </div>
      </div>
      <div className="space-y-3">
        <ImageDropzone images={draft.images} onChange={setDraftImages} maxImages={maxImages} label={`Images (up to ${maxImages})`} />
        <SizeChartField
          shopId={shop?._id}
          rules={rules}
          value={sizeChart}
          onChange={(next) => update({ sizeChart: next })}
        />
        {specificsFields}
        <Select
          label="TikTok save mode"
          value={saveMode || 'LISTING'}
          onChange={(e) => update({ saveMode: e.target.value })}
          options={SAVE_MODES}
        />
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

  const draftFields = listing.tiktokFields ? tiktokFields : listing.temuFields ? temuFields : ebayFields

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
            {saving
              ? (layout.canList ? (isTikTok && saveMode === 'AS_DRAFT' ? 'Saving draft…' : 'Publishing…') : 'Saving…')
              : (layout.canList ? (isTikTok && saveMode === 'AS_DRAFT' ? `Save draft to ${shopLabel}` : layout.listAction) : `Save to ${shopLabel}`)}
          </Button>
        )}
      </div>
    </Modal>
  )
}
