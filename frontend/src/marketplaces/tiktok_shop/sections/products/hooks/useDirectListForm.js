/** Direct listing state: the fetched draft, category lookups, attributes, variants, validation and publishing (moved from DirectListModal). */
import { useEffect, useState } from 'react'
import { useAuth } from '../../../../../auth/AuthContext'
import { api } from '../../../../../lib/api'
import { matchAspects } from '../components/AttributeField'
import { certificationNeeded, certificationPayload } from '../listing/CertificationFields'
import {
  aspectToText,
  hasAspectValue,
  isAttributeRequired,
  normalizeCategoryRules,
  validateIdentifierCode,
  validateVariantsForTikTok,
} from '../listing/rules'
import { listingFormFor, useShopProfile } from '../../../../../hooks/useShopProfiles'
import { clearDirectListing, startDirectFetch, useDirectListing } from './useDirectListing'
import { useApi } from '../../../../../hooks/useApi'

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

export function useDirectListForm({ shopLabel, marketplace, onCreated }) {
  const { token } = useAuth()
  const { profile } = useShopProfile(marketplace)
  const shopsRes = useApi('/api/shops')
  const shop = (shopsRes.data || []).find((item) => item.marketplace === marketplace && item.status === 'connected')
  const layout = listingFormFor(marketplace, profile, shop?.listing || {})
  const titleMax = layout.titleMax
  const subtitleMax = layout.subtitleMax || 55
  const maxImages = layout.maxImages
  const packageRequired = layout.package === 'required'

  const { session, update } = useDirectListing(marketplace)
  const {
    url, useAi, fetching, draft, stock, listPrice, sellerSku, brandId,
    subtitle, conditionDescription, mpn, dispatchTimeMax, bestOffer,
    identifierCode, variants, sizeChart, saveMode, weight, length, width, height,
    schema, aspects, extras, categories, categoryId, categorySearch, categoryState,
    fillingAttributes, categoryRules, certifications, error, saving,
  } = session

  const rawCategoryQuery = (String(categorySearch || '').trim())
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
    const mode = String(categorySearch || '').trim() ? 'search' : 'auto'
    const queryUrl = `/api/shops/${shop._id}/categories?q=${encodeURIComponent(categoryQuery)}${`&mode=${mode}`}`
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
  }, [draft, shop?._id, layout.category, categoryQuery, token, update, categorySearch])

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
          .filter((attr) => !hasAspectValue(matched[attr.id]))
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
    if (!shop?._id || !categoryId) return undefined
    let cancelled = false
    api.get(`/api/shops/${shop._id}/categories/${categoryId}/rules`, token)
      .then((rules) => {
        if (cancelled) return
        update({ categoryRules: normalizeCategoryRules(rules) })
      })
      .catch(() => {
        if (cancelled) return
        update({ categoryRules: normalizeCategoryRules([]) })
      })
    return () => { cancelled = true }
  }, [marketplace, shop?._id, categoryId, token, update])

  const set = (key) => (e) => update((current) => ({ draft: { ...current.draft, [key]: e.target.value } }))
  const setAspect = (id, value) => update((current) => ({ aspects: { ...current.aspects, [id]: value } }))
  const setExtra = (index, field, value) => update((current) => ({ extras: current.extras.map((row, i) => (i === index ? { ...row, [field]: value } : row)) }))
  const setDraftImages = (images) => update((current) => ({ draft: { ...current.draft, images } }))

  const rules = normalizeCategoryRules(categoryRules)
  const activeVariants = variants || []
  const activeVarNames = new Set(
    activeVariants.flatMap((v) => Object.keys(v.options || {}).map((k) => k.trim().toLowerCase())).filter(Boolean),
  )

  const baseProductSchema = schema.filter((attr) => attr.type !== 'sales')
  const productSchema = baseProductSchema
  const salesSchema = schema.filter((attr) => attr.type === 'sales')

  const required = productSchema.filter((attr) => isAttributeRequired(attr, aspects, productSchema))
  const optional = productSchema.filter((attr) => !isAttributeRequired(attr, aspects, productSchema))
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

    if (activeVariants.length > 0) {
      const varErr = validateVariantsForTikTok(activeVariants, { requireStock: true })
      if (varErr) return update({ error: varErr })
    } else {
      const numPrice = Number(draft.price)
      if (!(numPrice > 0) || ((numPrice > 7600))) {
        return update({ error: 'Set a selling price between $0.01 and $7,600.00.' })
      }
      if (layout.canList && (!(Number(stock) >= 1) || ((Number(stock) > 99999)))) {
        return update({ error: 'Set stock between 1 and 99,999.' })
      }
      if (listPrice !== '' && listPrice != null && Number(listPrice) > 0) {
        if (Number(listPrice) < numPrice || Number(listPrice) > 7600) {
          return update({ error: `MSRP / list price must be between $${numPrice.toFixed(2)} and $7,600.00.` })
        }
      }
      const idErr = validateIdentifierCode(identifierCode)
        if (idErr) return update({ error: idErr })
    }

    if (!draft.images.length) return update({ error: 'Add at least one image.' })
    if (packageRequired && !(Number(weight) > 0)) return update({ error: `${shopLabel} needs the package weight and size.` })
    if (layout.category === 'search' && layout.canList && !categoryId) return update({ error: `Pick a ${shopLabel} category.` })

    const named = namedValues()
    const isDraftMode = saveMode === 'AS_DRAFT'
    if (!isDraftMode) {
      const missing = required.filter((attr) => !hasAspectValue(aspects[attr.id]))
      if (missing.length) return update({ error: `Fill in: ${missing.map((attr) => attr.name).join(', ')}.` })
      const missingCerts = rules.certifications.filter((rule) => certificationNeeded(rule, aspects, productSchema) && !certifications?.[rule.id]?.file)
      if (missingCerts.length) return update({ error: `Upload: ${missingCerts.map((rule) => rule.name).join(', ')}.` })
      if (rules.sizeChart?.required && !sizeChart?.templateId && !sizeChart?.image) {
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
      const finalPrice = normalizedVariants ? summaryPrice : Number(draft.price)
      const finalStock = normalizedVariants ? summaryStock : Math.max(0, Math.floor(Number(stock) || 0))

      const product = await api.post('/api/products', {
        ...(sellerSku?.trim() && !normalizedVariants ? { sku: sellerSku.trim() } : {}),
        title: draft.title.trim(),
        description: draft.description,
        brand: draft.brand.trim() || named.Brand || 'Unbranded',
        ...(brandId ? { brandId } : {}),
        category: selectedCategory?.path || draft.category,
        basePrice: finalPrice,
        ...(!normalizedVariants && listPrice !== '' && Number(listPrice) > 0 ? { listPrice: Number(listPrice) } : {}),
        costPrice: draft.sourcePrice,
        stock: finalStock,
        images: draft.images.slice(0, maxImages),
        ...(normalizedVariants ? { variants: normalizedVariants } : {}),
        ...(cleanIdCode ? { identifierCode: cleanIdCode } : {}),
        ...(sizeChart?.templateId || sizeChart?.image ? { sizeChart } : {}),
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
              row.name.trim() && asText(row.value) && !productSchema.some((attr) => String(attr.name).toLowerCase() === row.name.trim().toLowerCase())
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
          ...({
            brand: draft.brand.trim() || named.Brand || 'Unbranded',
            ...(brandId ? { brandId } : {}),
            ...(listPrice !== '' && Number(listPrice) > 0 && !normalizedVariants ? { listPrice: Number(listPrice) } : {}),
            ...(sellerSku?.trim() ? { sellerSku: sellerSku.trim() } : {}),
            ...(cleanIdCode ? { identifierCode: cleanIdCode } : {}),
            ...(normalizedVariants ? { variants: normalizedVariants } : {}),
            ...(sizeChart?.templateId || sizeChart?.image ? { sizeChart } : {}),
            saveMode: saveMode || 'LISTING',
          }),
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

  return {
    url,
    useAi,
    fetching,
    draft,
    stock,
    listPrice,
    sellerSku,
    brandId,
    subtitle,
    conditionDescription,
    mpn,
    dispatchTimeMax,
    bestOffer,
    identifierCode,
    variants,
    sizeChart,
    saveMode,
    weight,
    length,
    width,
    height,
    schema,
    aspects,
    extras,
    categories,
    categoryId,
    categorySearch,
    categoryState,
    fillingAttributes,
    categoryRules,
    certifications,
    error,
    saving,
    token,
    profile,
    shopsRes,
    shop,
    layout,
    titleMax,
    subtitleMax,
    maxImages,
    packageRequired,
    session,
    update,
    rawCategoryQuery,
    categoryQuery,
    fetchDetails,
    draftSourceUrl,
    draftTitle,
    draftDesc,
    draftBrand,
    draftAttrs,
    set,
    setAspect,
    setExtra,
    setDraftImages,
    rules,
    activeVariants,
    activeVarNames,
    baseProductSchema,
    productSchema,
    salesSchema,
    required,
    optional,
    selectedCategory,
    positiveVariantPrices,
    summaryPrice,
    summaryStock,
    namedValues,
    create,
  }
}
