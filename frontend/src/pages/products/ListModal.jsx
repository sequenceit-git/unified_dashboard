import { useEffect, useState } from 'react'
import { getShop } from '../../marketplaces'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import { useApi } from '../../hooks/useApi'
import { marketplaceLabel } from '../../marketplaces'
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
import { CONDITIONS } from '../../lib/listingConditions'

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export default function ListModal({ product, marketplace: sectionMarketplace, prefill = null, onClose, onSaved }) {
  const { token } = useAuth()
  const shopsRes = useApi('/api/shops')
  const [chosenShopId, setChosenShopId] = useState('')

  const shops = (shopsRes.data || []).filter(
    (s) => s.status === 'connected' && (!sectionMarketplace || s.marketplace === sectionMarketplace),
  )

  const shopId = chosenShopId || (shops.length === 1 ? shops[0]._id : '')
  const selectedShop = shops.find((s) => s._id === shopId)
  const marketplace = selectedShop?.marketplace
  const caps = selectedShop?.listing || {}
  // The shop decides which listing field set it uses (src/marketplaces/<key>/index.js → listing).
  const listing = getShop(marketplace)?.listing || {}
  const isTikTok = Boolean(listing.tiktokFields)
  const isEbay = Boolean(listing.ebayFields)

  const [price, setPrice] = useState(product.basePrice || '')
  const [listPrice, setListPrice] = useState(product.listPrice ?? '')
  const [stock, setStock] = useState(product.stock > 0 ? product.stock : 1)
  const [title, setTitle] = useState(product.title || '')
  const [subtitle, setSubtitle] = useState(product.subtitle || '')
  const [description, setDescription] = useState(product.description || '')
  const [condition, setCondition] = useState(prefill?.condition || product.condition || 'NEW')
  const [conditionDescription, setConditionDescription] = useState(product.conditionDescription || '')
  const [brand, setBrand] = useState(product.brand || '')
  const [brandId, setBrandId] = useState(product.brandId || '')
  const [mpn, setMpn] = useState(product.mpn || '')
  const [dispatchTimeMax, setDispatchTimeMax] = useState(product.dispatchTimeMax != null ? String(product.dispatchTimeMax) : '')
  const [bestOffer, setBestOffer] = useState({
    enabled: Boolean(product.bestOffer?.enabled),
    autoAcceptPrice: product.bestOffer?.autoAcceptPrice ?? '',
    minOfferPrice: product.bestOffer?.minOfferPrice ?? '',
  })
  const [sellerSku, setSellerSku] = useState(product.sku || '')
  const [identifierCode, setIdentifierCode] = useState(product.identifierCode?.code ? product.identifierCode : { type: '', code: '' })
  const [variants, setVariants] = useState(() => (Array.isArray(product.variants) ? product.variants.map((v) => ({ ...v })) : []))
  const [sizeChart, setSizeChart] = useState(product.sizeChart || { templateId: '', image: '' })
  const [saveMode, setSaveMode] = useState('LISTING')

  const [weight, setWeight] = useState(product.weight || 1)
  const [length, setLength] = useState(product.dimensions?.length || 10)
  const [width, setWidth] = useState(product.dimensions?.width || 10)
  const [height, setHeight] = useState(product.dimensions?.height || 5)
  const [images, setImages] = useState(Array.isArray(product.images) ? product.images : [])

  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryState, setCategoryState] = useState({ loading: false, error: '' })
  const [attributes, setAttributes] = useState([])
  const [salesAttributes, setSalesAttributes] = useState([])
  const [categoryRules, setCategoryRules] = useState(() => normalizeCategoryRules([]))
  const [ebayRules, setEbayRules] = useState(() => normalizeEbayCategoryRules(null))
  const [certificationFiles, setCertificationFiles] = useState({})
  const [attributeError, setAttributeError] = useState('')
  const [aspects, setAspects] = useState({})

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const titleMax = caps.titleMax || 255
  const subtitleMax = caps.subtitleMax || 55
  const usesCategories = caps.canList && (caps.categorySearch || caps.categoryAutoPick)
  const searchActive = Boolean((isTikTok || isEbay) && categorySearch.trim())
  const rawCategoryQuery = searchActive ? categorySearch.trim() : title.trim().slice(0, 80)
  const categoryQuery = useDebounced(rawCategoryQuery, 550)

  const handleShopChange = (nextShopId) => {
    setChosenShopId(nextShopId)
    setCategories([])
    setCategoryId('')
    setCategorySearch('')
    setAttributes([])
    setSalesAttributes([])
    setCategoryRules(normalizeCategoryRules([]))
    setEbayRules(normalizeEbayCategoryRules(null))
    setAspects({})
    setError('')
  }

  useEffect(() => {
    if (!usesCategories || !shopId || !categoryQuery) return undefined
    let cancelled = false
    const mode = isTikTok && categorySearch.trim() ? 'search' : 'auto'
    const url = `/api/shops/${shopId}/categories?q=${encodeURIComponent(categoryQuery)}${isTikTok ? `&mode=${mode}` : ''}`
    api.get(url, token)
      .then((list) => {
        if (cancelled) return
        setCategories(list || [])
        setCategoryId((current) => (current && list.some((c) => c.categoryId === current) ? current : list[0]?.categoryId || ''))
        setCategoryState({ loading: false, error: list?.length ? '' : 'No category matches this query. Try a more specific title or keyword.' })
      })
      .catch((err) => !cancelled && setCategoryState({ loading: false, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [usesCategories, shopId, categoryQuery, token, isTikTok, categorySearch])

  useEffect(() => {
    if (!caps.attributes || !shopId || !categoryId) return undefined
    let cancelled = false
    api.get(`/api/shops/${shopId}/categories/${categoryId}/attributes`, token)
      .then((list) => {
        if (cancelled) return
        const all = Array.isArray(list) ? list : []
        const prodAttrs = all.filter((a) => a.type !== 'sales')
        const salesAttrs = isTikTok
          ? all.filter((a) => a.type === 'sales')
          : all.filter((a) => a.variationEnabled)
        setAttributes(prodAttrs)
        setSalesAttributes(salesAttrs)
        setAttributeError('')
        setAspects((prev) => ({
          ...matchAspects(prodAttrs, { ...product.attributes, ...(brand ? { Brand: brand } : {}), ...prefill?.aspects }),
          ...prev,
        }))
      })
      .catch((err) => !cancelled && setAttributeError(err.message))
    return () => {
      cancelled = true
    }
  }, [caps.attributes, shopId, categoryId, token, product.attributes, prefill?.aspects, brand, isTikTok])

  useEffect(() => {
    if (!['tiktok_shop', 'ebay'].includes(marketplace) || !shopId || !categoryId) return undefined
    let cancelled = false
    api.get(`/api/shops/${shopId}/categories/${categoryId}/rules`, token)
      .then((rules) => {
        if (cancelled) return
        if (isTikTok) {
          setCategoryRules(normalizeCategoryRules(rules))
        } else {
          const normalized = normalizeEbayCategoryRules(rules)
          setEbayRules(normalized)
          if (normalized.conditions.length) {
            setCondition((prev) => resolveEbayCondition(prev, normalized.conditions))
          }
        }
      })
      .catch(() => {
        if (cancelled) return
        if (isTikTok) setCategoryRules(normalizeCategoryRules([]))
        else setEbayRules(normalizeEbayCategoryRules(null))
      })
    return () => { cancelled = true }
  }, [marketplace, shopId, categoryId, token])

  const activeVariants = isTikTok
    ? variants
    : (isEbay && ebayRules.variationsEnabled !== false ? variants : [])
  const activeVarNames = new Set(
    activeVariants.flatMap((v) => Object.keys(v.options || {}).map((k) => k.trim().toLowerCase())).filter(Boolean),
  )
  const visibleAttributes = isEbay
    ? attributes.filter((a) => !activeVarNames.has(String(a.name).trim().toLowerCase()))
    : attributes

  const required = visibleAttributes.filter((a) => isAttributeRequired(a, aspects, visibleAttributes))
  const optional = visibleAttributes.filter((a) => !isAttributeRequired(a, aspects, visibleAttributes) && (a.recommended || isTikTok))
  const extraNames = Object.keys(aspects).filter((key) => !visibleAttributes.some((a) => a.id === key) && (!isEbay || !activeVarNames.has(key.trim().toLowerCase())))
  const missingRequired = required.filter((a) => !hasAspectValue(aspects[a.id]))
  const setAspect = (id, value) => setAspects((prev) => ({ ...prev, [id]: value }))

  const positiveVariantPrices = activeVariants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
  const summaryPrice = positiveVariantPrices.length ? Math.min(...positivePricesList(positiveVariantPrices)) : 0
  const summaryStock = activeVariants.reduce((sum, v) => sum + Math.max(0, Math.floor(Number(v.stock) || 0)), 0)

  const submit = async (e) => {
    e.preventDefault()
    if (!selectedShop) return setError('Choose a shop to list on.')
    if (!caps.canList) return setError(caps.note || 'Listing on this shop is not available.')
    if (!title.trim()) return setError('Title is required.')
    if (title.length > titleMax) return setError(`${marketplaceLabel(marketplace)} titles can be at most ${titleMax} characters.`)
    if (isEbay && subtitle.length > subtitleMax) return setError(`eBay subtitles can be at most ${subtitleMax} characters.`)

    if (isTikTok && activeVariants.length > 0) {
      const varErr = validateVariantsForTikTok(activeVariants, { requireStock: true })
      if (varErr) return setError(varErr)
    } else if (isEbay && activeVariants.length > 0) {
      const varErr = validateVariantsForEbay(activeVariants, { requireStock: true })
      if (varErr) return setError(varErr)
    } else {
      const numPrice = Number(price)
      if (!(numPrice > 0) || (isTikTok && numPrice > 7600)) {
        return setError(isTikTok ? 'Price must be between $0.01 and $7,600.00.' : 'Set a price above 0.')
      }
      if (!(Number(stock) >= 1) || (isTikTok && Number(stock) > 99999)) {
        return setError(isTikTok ? 'Stock must be between 1 and 99,999.' : 'Stock must be at least 1 to list a product.')
      }
      if (isTikTok && listPrice !== '' && listPrice != null && Number(listPrice) > 0) {
        if (Number(listPrice) < numPrice || Number(listPrice) > 7600) {
          return setError(`MSRP / list price must be between $${numPrice.toFixed(2)} and $7,600.00.`)
        }
      }
      if (isTikTok) {
        const idErr = validateIdentifierCode(identifierCode)
        if (idErr) return setError(idErr)
      }
      if (isEbay) {
        if (ebayRules.upcEnabled === 'Required' && !String(identifierCode?.code || '').trim()) {
          return setError('This eBay category requires a product identifier (or click "Does not apply").')
        }
        const idErr = validateEbayIdentifierCode(identifierCode)
        if (idErr) return setError(idErr)
      }
    }

    if (isEbay && ebayRules.bestOfferEnabled !== false) {
      const boErr = validateBestOffer(bestOffer, activeVariants.length > 0 ? summaryPrice : Number(price))
      if (boErr) return setError(boErr)
    }

    const isDraftMode = isTikTok && saveMode === 'AS_DRAFT'
    if (!isDraftMode) {
      if (missingRequired.length) return setError(`Fill in: ${missingRequired.map((a) => a.name).join(', ')}.`)
      const missingCerts = categoryRules.certifications.filter(
        (rule) => certificationNeeded(rule, aspects, visibleAttributes) && !certificationFiles[rule.id]?.file,
      )
      if (missingCerts.length) return setError(`Upload: ${missingCerts.map((rule) => rule.name).join(', ')}.`)
      if (isTikTok && categoryRules.sizeChart?.required && !sizeChart?.templateId && !sizeChart?.image) {
        return setError('TikTok Shop requires a size chart for this category.')
      }
    }

    setBusy(true)
    setError('')
    try {
      const allowedAspectIds = new Set(visibleAttributes.map((a) => a.id))
      const filled = Object.fromEntries(
        Object.entries(aspects)
          .filter(([key]) => !isEbay || allowedAspectIds.has(key) || !activeVarNames.has(key.trim().toLowerCase()))
          .map(([key, value]) => {
            if (Array.isArray(value)) {
              const cleaned = value.map((item) => String(item || '').trim()).filter(Boolean)
              return [key, cleaned]
            }
            return [key, String(value || '').trim()]
          })
          .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value))),
      )
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

      const res = await api.post(
        `/api/products/${product._id}/list`,
        {
          shopId,
          price: normalizedVariants ? summaryPrice : (Number(price) || product.basePrice),
          stock: normalizedVariants ? summaryStock : Number(stock),
          title: title.trim(),
          description: (isTikTok || isEbay) ? description : product.description,
          images: (images.length ? images : product.images || []).slice(0, caps.maxImages || 12),
          ...(caps.packageDetails ? {
            weight: Number(weight) || 1,
            dimensions: { length: Number(length) || 10, width: Number(width) || 10, height: Number(height) || 5, unit: 'in' },
          } : {}),
          ...(isEbay ? {
            subtitle: subtitle.trim().slice(0, 55),
            condition,
            conditionEnabled: ebayRules.conditionEnabled,
            conditionDescription: isNewCondition(condition) ? '' : conditionDescription.trim().slice(0, 1000),
            brand: brand.trim() || 'Unbranded',
            ...(mpn.trim() ? { mpn: mpn.trim() } : {}),
            ...(sellerSku.trim() ? { sellerSku: sellerSku.trim() } : {}),
            ...(cleanIdCode ? { identifierCode: cleanIdCode } : {}),
            ...(normalizedVariants ? { variants: normalizedVariants } : {}),
            ...(dispatchTimeMax !== '' ? { dispatchTimeMax: Number(dispatchTimeMax) } : {}),
            bestOffer: cleanBestOffer,
          } : {}),
          ...(isTikTok ? {
            brand: brand.trim() || 'Unbranded',
            ...(brandId ? { brandId } : {}),
            ...(listPrice !== '' && listPrice != null && Number(listPrice) > 0 && !normalizedVariants ? { listPrice: Number(listPrice) } : {}),
            ...(sellerSku.trim() ? { sellerSku: sellerSku.trim() } : {}),
            ...(cleanIdCode ? { identifierCode: cleanIdCode } : {}),
            ...(normalizedVariants ? { variants: normalizedVariants } : {}),
            ...(sizeChart?.templateId || sizeChart?.image ? { sizeChart } : {}),
            saveMode,
          } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(Object.keys(filled).length ? { aspects: filled } : {}),
          certifications: certificationPayload(categoryRules.certifications, aspects, visibleAttributes, certificationFiles),
        },
        token,
      )
      onSaved(res?.product || res)
    } catch (err) {
      const missing = err.data?.missingSpecifics || []
      if (missing.length) {
        setAspects((prev) => ({ ...Object.fromEntries(missing.map((name) => [name, ''])), ...prev }))
      }
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const selectedCategory = categories.find((c) => c.categoryId === categoryId)
  const ebayConditionOptions = ebayRules.conditions.length
    ? ebayRules.conditions.map((c) => ({ value: c.id, label: c.name }))
    : CONDITIONS

  return (
    <Modal title={`List "${product.title}"`} onClose={onClose} size={(isTikTok || isEbay) ? '5xl' : '4xl'} wide>
      <form onSubmit={submit} className="space-y-4">
        {shopsRes.data && !shops.length && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {sectionMarketplace
              ? `No ${marketplaceLabel(sectionMarketplace)} shop is connected. Connect it in Settings first.`
              : 'No shop is connected. Connect one in Settings first.'}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {shops.length > 1 ? (
            <Select
              label="Shop *"
              value={shopId}
              onChange={(e) => handleShopChange(e.target.value)}
              options={[
                { value: '', label: 'Choose a shop…' },
                ...shops.map((s) => ({
                  value: s._id,
                  label: `${s.name}${sectionMarketplace ? '' : ` (${marketplaceLabel(s.marketplace)})`}${s.listing?.canList ? '' : ' · listing not available'}`,
                })),
              ]}
            />
          ) : selectedShop ? (
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">Shop</span>
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-800">
                {selectedShop.name} ({marketplaceLabel(selectedShop.marketplace)})
              </p>
            </div>
          ) : null}
          {caps.canList && activeVariants.length === 0 && (
            <>
              <Input label="Price ($) *" type="number" step="0.01" min="0.01" max={isTikTok ? '7600' : undefined} value={price} onChange={(e) => setPrice(e.target.value)} required />
              <Input label="Stock to list *" type="number" min="1" max={isTikTok ? '99999' : undefined} step="1" value={stock} onChange={(e) => setStock(e.target.value)} required />
            </>
          )}
          {caps.canList && activeVariants.length > 0 && (
            <div className="sm:col-span-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900 flex items-center justify-between">
              <span><strong>{activeVariants.length} {isEbay ? 'variations' : 'variants'}</strong> configured below</span>
              <span>From <strong>${summaryPrice.toFixed(2)}</strong> · <strong>{summaryStock}</strong> total units</span>
            </div>
          )}
        </div>

        {selectedShop && !caps.canList && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
            {caps.note || `Listing on ${marketplaceLabel(marketplace)} is not available.`}
          </div>
        )}

        {selectedShop && caps.canList && (
          <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-900">
                {marketplaceLabel(marketplace)} listing
              </span>
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">{caps.apiName}</span>
            </div>
            {caps.note && <p className="text-xs text-gray-600">{caps.note}</p>}

            <div>
              <div className="flex items-center justify-between">
                <span className="mb-1 text-xs font-semibold text-gray-700">Listing Title *</span>
                <span className={`text-xs font-medium ${title.length > titleMax ? 'font-bold text-red-600' : title.length > titleMax * 0.9 ? 'text-amber-600' : 'text-gray-500'}`}>
                  {title.length}/{titleMax}
                </span>
              </div>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={titleMax}
                required
              />
            </div>

            {isEbay && (
              <Input
                label={`Subtitle (optional, ${subtitle.length}/${subtitleMax} — extra eBay fee may apply)`}
                maxLength={subtitleMax}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Extra keywords displayed under the eBay title"
              />
            )}

            {(isTikTok || isEbay) && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="mb-1 text-xs font-semibold text-gray-700">Description</span>
                  {isTikTok && <span className="text-[11px] text-gray-500">{description.length}/10000</span>}
                </div>
                <textarea
                  rows={4}
                  maxLength={isTikTok ? 10000 : undefined}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Product features, sizing notes, materials…"
                />
              </div>
            )}

            {isTikTok ? (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    label="Search TikTok categories (optional)"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Auto-suggested from title; type to search…"
                  />
                  <Select
                    label="TikTok Shop category *"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    options={
                      categories.length
                        ? categories.map((c) => ({
                            value: c.categoryId,
                            label: `${c.recommended ? 'Recommended: ' : ''}${c.path || c.categoryName}`,
                          }))
                        : [{ value: '', label: categoryState.loading ? 'Finding categories…' : 'No category yet' }]
                    }
                  />
                </div>
                {selectedCategory && (
                  <p className="text-[11px] text-gray-600">Selected leaf ID {selectedCategory.categoryId}: {selectedCategory.path}</p>
                )}
              </div>
            ) : isEbay ? (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    label="Search eBay categories (optional)"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Auto-suggested from title; type to search…"
                  />
                  <Select
                    label="eBay category *"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    options={
                      categories.length
                        ? categories.map((c) => ({ value: c.categoryId, label: c.path || c.categoryName }))
                        : [{ value: '', label: categoryState.loading ? 'Finding categories…' : 'No category yet' }]
                    }
                  />
                </div>
                {selectedCategory && (
                  <p className="text-[11px] text-gray-600">Category #{selectedCategory.categoryId}: {selectedCategory.path}</p>
                )}
              </div>
            ) : (
              <>
                {caps.categorySearch && (
                  <Select
                    label={`${marketplaceLabel(marketplace)} category *`}
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    options={
                      categories.length
                        ? categories.map((c) => ({ value: c.categoryId, label: c.path || c.categoryName }))
                        : [{ value: '', label: categoryState.loading ? 'Finding categories from the title…' : 'No category yet' }]
                    }
                  />
                )}
                {caps.categoryAutoPick && (
                  <p className="text-xs text-gray-700">
                    <span className="font-semibold">Category: </span>
                    {categoryState.loading ? 'Asking for a suggestion…' : selectedCategory?.path || 'Picked when you publish'}
                  </p>
                )}
              </>
            )}
            {categoryState.error && <p className="text-xs text-red-600">{categoryState.error}</p>}

            {isEbay && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {ebayRules.conditionEnabled !== 'Disabled' && (
                    <Select
                      label={`Condition${ebayRules.conditionEnabled === 'Required' ? ' *' : ''}`}
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      options={ebayConditionOptions}
                    />
                  )}
                  <Input label="Brand *" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Apple, Nike, Unbranded" />
                  <Input label="MPN (optional)" value={mpn} onChange={(e) => setMpn(e.target.value)} placeholder="Manufacturer Part Number" />
                </div>

                {ebayRules.conditionEnabled !== 'Disabled' && !isNewCondition(condition) && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      Condition description ({conditionDescription.length}/1000)
                    </label>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                      value={conditionDescription}
                      onChange={(e) => setConditionDescription(e.target.value)}
                      placeholder="Describe wear, scratches, or missing accessories…"
                    />
                  </div>
                )}

                {activeVariants.length === 0 && (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-3">
                    <Input label="Seller SKU" maxLength={50} value={sellerSku} onChange={(e) => setSellerSku(e.target.value)} />
                    <div className="sm:col-span-2">
                      <EbayIdentifierField
                        required={ebayRules.upcEnabled === 'Required'}
                        value={identifierCode}
                        onChange={setIdentifierCode}
                      />
                    </div>
                  </div>
                )}

                {ebayRules.variationsEnabled !== false ? (
                  <VariantEditor
                    key={`ebay-${product._id}-${shopId}`}
                    marketplace="ebay"
                    variants={variants}
                    onChange={setVariants}
                    salesSchema={salesAttributes}
                    listingImages={images}
                    defaultPrice={price}
                    defaultStock={stock}
                    baseSku={sellerSku || product.sku || 'EBAY'}
                    requireStock
                  />
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This eBay category does not support multi-variation listings.
                  </p>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ebayRules.bestOfferEnabled !== false && (
                    <EbayBestOfferField
                      value={bestOffer}
                      onChange={setBestOffer}
                      minPrice={activeVariants.length > 0 ? summaryPrice : Number(price)}
                    />
                  )}
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <Select
                      label="Handling time"
                      value={dispatchTimeMax}
                      onChange={(e) => setDispatchTimeMax(e.target.value)}
                      options={DISPATCH_TIMES}
                    />
                  </div>
                </div>
              </>
            )}

            {caps.condition && !isEbay && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label="Condition" value={condition} onChange={(e) => setCondition(e.target.value)} options={CONDITIONS} />
                <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Apple, Nike, Unbranded" />
              </div>
            )}

            {isTikTok && (
              <>
                <BrandPicker
                  shopId={shopId}
                  categoryId={categoryId}
                  brandId={brandId}
                  brand={brand}
                  onChange={({ brandId: nextId, brand: nextBrand }) => {
                    setBrandId(nextId)
                    setBrand(nextBrand)
                  }}
                />

                {activeVariants.length === 0 && (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2">
                    <Input
                      label="MSRP / List price ($)"
                      type="number"
                      step="0.01"
                      min="0"
                      max="7600"
                      value={listPrice}
                      onChange={(e) => setListPrice(e.target.value)}
                      placeholder="Optional strikethrough price"
                    />
                    <Input
                      label="Seller SKU"
                      maxLength={50}
                      value={sellerSku}
                      onChange={(e) => setSellerSku(e.target.value)}
                    />
                    <div className="sm:col-span-2">
                      <IdentifierCodeField
                        value={identifierCode}
                        onChange={setIdentifierCode}
                      />
                    </div>
                  </div>
                )}

                <VariantEditor
                  key={`${product._id}-${shopId}`}
                  variants={variants}
                  onChange={setVariants}
                  salesSchema={salesAttributes}
                  defaultPrice={price}
                  defaultStock={stock}
                  baseSku={sellerSku || product.sku || 'TTS'}
                  requireStock
                />
              </>
            )}

            {(required.length > 0 || extraNames.length > 0) && (
              <div className="border-t border-indigo-100 pt-2">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">Required by {marketplaceLabel(marketplace)} for this category</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {required.map((attr) => (
                    <AttributeField
                      key={attr.id}
                      attr={attr}
                      requiredOverride
                      value={aspects[attr.id] || ''}
                      onChange={(value) => setAspect(attr.id, value)}
                    />
                  ))}
                  {extraNames.map((name) => (
                    <Input key={name} label={`${name} *`} value={aspects[name] || ''} onChange={(e) => setAspect(name, e.target.value)} />
                  ))}
                </div>
              </div>
            )}
            {optional.length > 0 && (
              <details className="border-t border-indigo-100 pt-2">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700">
                  More details buyers filter by ({optional.length} optional)
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {optional.slice(0, 30).map((attr) => (
                    <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
                  ))}
                </div>
              </details>
            )}
            {attributeError && <p className="text-xs text-red-600">{attributeError}</p>}

            {isTikTok && (
              <SizeChartField
                shopId={shopId}
                rules={categoryRules}
                value={sizeChart}
                onChange={setSizeChart}
              />
            )}

            <CertificationFields
              rules={categoryRules.certifications}
              aspects={aspects}
              schema={visibleAttributes}
              files={certificationFiles}
              onChange={(id, value) => setCertificationFiles((current) => ({ ...current, [id]: value }))}
            />

            {caps.packageDetails && (
              <div className="border-t border-indigo-100 pt-2">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">Package Dimensions &amp; Weight</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input label="Weight (lbs)" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  <Input label="Length (in)" type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
                  <Input label="Width (in)" type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} />
                  <Input label="Height (in)" type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} />
                </div>
              </div>
            )}

            {isTikTok && (
              <div className="border-t border-indigo-100 pt-2">
                <Select
                  label="TikTok save mode"
                  value={saveMode}
                  onChange={(e) => setSaveMode(e.target.value)}
                  options={SAVE_MODES}
                />
              </div>
            )}
          </div>
        )}

        {caps.canList && (
          <div>
            <ImageDropzone images={images} onChange={setImages} label={`Listing Images (up to ${caps.maxImages || 12})`} maxImages={caps.maxImages || 12} />
            {isEbay && (
              <p className="mt-1 text-xs text-indigo-600 font-medium">eBay requires pictures to be at least 500px on the longest side.</p>
            )}
            {images.length === 0 && <p className="mt-1 text-xs text-amber-600">At least 1 image is needed to publish.</p>}
          </div>
        )}

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || !selectedShop || !caps.canList || title.length > titleMax || (caps.categorySearch && !categoryId)}
          >
            {busy
              ? (isTikTok && saveMode === 'AS_DRAFT' ? 'Saving draft…' : 'Publishing…')
              : selectedShop
                ? (isTikTok && saveMode === 'AS_DRAFT' ? `Save draft to ${selectedShop.name}` : `Publish to ${selectedShop.name}`)
                : 'List Product'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function positivePricesList(list) {
  return list.length ? list : [0]
}
