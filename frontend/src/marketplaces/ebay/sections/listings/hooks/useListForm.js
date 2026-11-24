/** List dialog state: shop and category lookups, attributes, variants, validation and publishing (moved from ListModal). */
import { useEffect, useRef, useState } from 'react'
import { applyAiFill, missingForAi } from '../listing/aiFill'
import { useAuth } from '../../../../../auth/AuthContext'
import { api } from '../../../../../lib/api'
import { useApi } from '../../../../../hooks/useApi'
import { marketplaceLabel } from '../../../..'
import { matchAspects } from '../components/AttributeField'
import { hasAspectValue, isAttributeRequired } from '../listing/attributes'
import {
  isNewCondition,
  normalizeEbayCategoryRules,
  resolveEbayCondition,
  validateBestOffer,
  validateEbayIdentifierCode,
  validateVariantsForEbay,
} from '../listing/rules'
import { CONDITIONS } from '../listingConditions'
import { cleanShippingPayer, shippingPayerFrom, validateShippingPayer } from '../listing/shippingPayer'

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function useListForm({ product, marketplace: sectionMarketplace, prefill = null, onSaved }) {
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
  const [ebayShipping, setEbayShipping] = useState(() => shippingPayerFrom(product))
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
  // The category the loaded attributes belong to (a new category keeps the old list until its own loads).
  const [attributesFor, setAttributesFor] = useState('')
  const [salesAttributes, setSalesAttributes] = useState([])
  const [ebayRules, setEbayRules] = useState(() => normalizeEbayCategoryRules(null))
  const [attributeError, setAttributeError] = useState('')
  const [aspects, setAspects] = useState({})
  // Product Discovery finds: once the category's fields load, the AI fills the empty required ones.
  const [aiFill, setAiFill] = useState({ busy: false, filled: [], asked: 0, error: '' })
  const aiDoneFor = useRef('')
  const aspectsNow = useRef(aspects)
  aspectsNow.current = aspects

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const titleMax = caps.titleMax || 255
  const subtitleMax = caps.subtitleMax || 55
  const usesCategories = caps.canList && (caps.categorySearch || caps.categoryAutoPick)
  const searchActive = Boolean(categorySearch.trim())
  const rawCategoryQuery = searchActive ? categorySearch.trim() : title.trim().slice(0, 80)
  const categoryQuery = useDebounced(rawCategoryQuery, 550)

  const handleShopChange = (nextShopId) => {
    setChosenShopId(nextShopId)
    setCategories([])
    setCategoryId('')
    setCategorySearch('')
    setAttributes([])
    setSalesAttributes([])
    setEbayRules(normalizeEbayCategoryRules(null))
    setAspects({})
    setError('')
  }

  useEffect(() => {
    if (!usesCategories || !shopId || !categoryQuery) return undefined
    let cancelled = false
    const url = `/api/ebay/shops/${shopId}/categories?q=${encodeURIComponent(categoryQuery)}`
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
  }, [usesCategories, shopId, categoryQuery, token, categorySearch])

  useEffect(() => {
    if (!caps.attributes || !shopId || !categoryId) return undefined
    let cancelled = false
    api.get(`/api/ebay/shops/${shopId}/categories/${categoryId}/attributes`, token)
      .then((list) => {
        if (cancelled) return
        const all = Array.isArray(list) ? list : []
        const prodAttrs = all.filter((a) => a.type !== 'sales')
        const salesAttrs = all.filter((a) => a.variationEnabled)
        setAttributes(prodAttrs)
        setAttributesFor(categoryId)
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
  }, [caps.attributes, shopId, categoryId, token, product.attributes, prefill?.aspects, brand])

  useEffect(() => {
    if (!shopId || !categoryId) return undefined
    let cancelled = false
    api.get(`/api/ebay/shops/${shopId}/categories/${categoryId}/rules`, token)
      .then((rules) => {
        if (cancelled) return
        const normalized = normalizeEbayCategoryRules(rules)
          setEbayRules(normalized)
          if (normalized.conditions.length) {
            setCondition((prev) => resolveEbayCondition(prev, normalized.conditions))
          }
      })
      .catch(() => {
        if (cancelled) return
        setEbayRules(normalizeEbayCategoryRules(null))
      })
    return () => { cancelled = true }
  }, [marketplace, shopId, categoryId, token])

  const activeVariants = ebayRules.variationsEnabled !== false ? variants : []
  const activeVarNames = new Set(
    activeVariants.flatMap((v) => Object.keys(v.options || {}).map((k) => k.trim().toLowerCase())).filter(Boolean),
  )
  const visibleAttributes = attributes.filter((a) => !activeVarNames.has(String(a.name).trim().toLowerCase()))

  const required = visibleAttributes.filter((a) => isAttributeRequired(a, aspects, visibleAttributes))
  const optional = visibleAttributes.filter((a) => !isAttributeRequired(a, aspects, visibleAttributes) && (a.recommended))
  const extraNames = Object.keys(aspects).filter((key) => !visibleAttributes.some((a) => a.id === key) && (!activeVarNames.has(key.trim().toLowerCase())))
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
    if (subtitle.length > subtitleMax) return setError(`eBay subtitles can be at most ${subtitleMax} characters.`)

    if (activeVariants.length > 0) {
      const varErr = validateVariantsForEbay(activeVariants, { requireStock: true })
      if (varErr) return setError(varErr)
    } else {
      const numPrice = Number(price)
      if (!(numPrice > 0)) {
        return setError('Set a price above 0.')
      }
      if (!(Number(stock) >= 1)) {
        return setError('Stock must be at least 1 to list a product.')
      }
      if (ebayRules.upcEnabled === 'Required' && !String(identifierCode?.code || '').trim()) {
          return setError('This eBay category requires a product identifier (or click "Does not apply").')
        }
        const idErr = validateEbayIdentifierCode(identifierCode)
        if (idErr) return setError(idErr)
    }

    if (ebayRules.bestOfferEnabled !== false) {
      const boErr = validateBestOffer(bestOffer, activeVariants.length > 0 ? summaryPrice : Number(price))
      if (boErr) return setError(boErr)
    }

    const shipErr = validateShippingPayer(ebayShipping)
    if (shipErr) return setError(shipErr)

    if (missingRequired.length) return setError(`Fill in: ${missingRequired.map((a) => a.name).join(', ')}.`)

    setBusy(true)
    setError('')
    try {
      const allowedAspectIds = new Set(visibleAttributes.map((a) => a.id))
      const filled = Object.fromEntries(
        Object.entries(aspects)
          .filter(([key]) => allowedAspectIds.has(key) || !activeVarNames.has(key.trim().toLowerCase()))
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
      const cleanBestOffer = bestOffer?.enabled
            ? {
                enabled: true,
                ...(bestOffer.autoAcceptPrice !== '' && bestOffer.autoAcceptPrice != null
                  ? { autoAcceptPrice: Number(bestOffer.autoAcceptPrice) }
                  : {}),
                ...(bestOffer.minOfferPrice !== '' && bestOffer.minOfferPrice != null
                  ? { minOfferPrice: Number(bestOffer.minOfferPrice) }
                  : {}),
              }
            : { enabled: false }

      const res = await api.post(
        `/api/ebay/listings/${product._id}/list`,
        {
          shopId,
          price: normalizedVariants ? summaryPrice : (Number(price) || product.basePrice),
          stock: normalizedVariants ? summaryStock : Number(stock),
          title: title.trim(),
          description: description,
          images: (images.length ? images : product.images || []).slice(0, caps.maxImages || 12),
          ...(caps.packageDetails ? {
            weight: Number(weight) || 1,
            dimensions: { length: Number(length) || 10, width: Number(width) || 10, height: Number(height) || 5, unit: 'in' },
          } : {}),
          ...({
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
            ...(cleanShippingPayer(ebayShipping) ? { ebayShipping: cleanShippingPayer(ebayShipping) } : {}),
          }),
          ...(categoryId ? { categoryId } : {}),
          ...(Object.keys(filled).length ? { aspects: filled } : {}),
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

  // State and setters the shop-specific parts of this dialog read (src/marketplaces/<key>/listing/listFields/).
  const slotCtx = {
    activeVariants,
    ebayShipping,
    setEbayShipping,
    aspects,
    bestOffer,
    brand,
    brandId,
    categories,
    categoryId,
    categorySearch,
    categoryState,
    condition,
    conditionDescription,
    dispatchTimeMax,
    ebayConditionOptions,
    ebayRules,
    identifierCode,
    images,
    listPrice,
    mpn,
    price,
    product,
    salesAttributes,
    saveMode,
    selectedCategory,
    sellerSku,
    setBestOffer,
    setBrand,
    setBrandId,
    setCategoryId,
    setCategorySearch,
    setCondition,
    setConditionDescription,
    setDispatchTimeMax,
    setIdentifierCode,
    setListPrice,
    setMpn,
    setSaveMode,
    setSellerSku,
    setSizeChart,
    setSubtitle,
    setVariants,
    shopId,
    sizeChart,
    stock,
    subtitle,
    subtitleMax,
    summaryPrice,
    variants,
    visibleAttributes,
  }

  useEffect(() => {
    if (product.source !== 'research_bot' || !categoryId || attributesFor !== categoryId || !attributes.length || aiDoneFor.current === categoryId) return
    aiDoneFor.current = categoryId
    const missing = missingForAi(attributes, aspectsNow.current)
    if (!missing.length) return
    const forCategory = categoryId
    setAiFill({ busy: true, filled: [], asked: missing.length, error: '' })
    api.post('/api/ebay/listings/fill-attributes', {
      title,
      description: product.description || '',
      brand,
      attributes: product.attributes || {},
      schema: missing,
    }, token)
      .then((answers) => {
        if (aiDoneFor.current !== forCategory) return
        const { filled } = applyAiFill(aspectsNow.current, answers)
        setAspects((prev) => applyAiFill(prev, answers).aspects)
        setAiFill({ busy: false, filled, asked: missing.length, error: '' })
      })
      .catch((err) => {
        if (aiDoneFor.current === forCategory) setAiFill({ busy: false, filled: [], asked: missing.length, error: err.message })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.source, categoryId, attributes, attributesFor])

  return {
    aiFill,
    token,
    shopsRes,
    chosenShopId,
    setChosenShopId,
    shops,
    shopId,
    selectedShop,
    marketplace,
    caps,
    price,
    setPrice,
    listPrice,
    setListPrice,
    stock,
    setStock,
    title,
    setTitle,
    subtitle,
    setSubtitle,
    description,
    setDescription,
    condition,
    setCondition,
    conditionDescription,
    setConditionDescription,
    brand,
    setBrand,
    brandId,
    setBrandId,
    mpn,
    setMpn,
    dispatchTimeMax,
    setDispatchTimeMax,
    bestOffer,
    setBestOffer,
    sellerSku,
    setSellerSku,
    identifierCode,
    setIdentifierCode,
    variants,
    setVariants,
    sizeChart,
    setSizeChart,
    saveMode,
    setSaveMode,
    weight,
    setWeight,
    length,
    setLength,
    width,
    setWidth,
    height,
    setHeight,
    images,
    setImages,
    categories,
    setCategories,
    categoryId,
    setCategoryId,
    categorySearch,
    setCategorySearch,
    categoryState,
    setCategoryState,
    attributes,
    setAttributes,
    salesAttributes,
    setSalesAttributes,
    ebayRules,
    setEbayRules,
    attributeError,
    setAttributeError,
    aspects,
    setAspects,
    error,
    setError,
    busy,
    setBusy,
    titleMax,
    subtitleMax,
    usesCategories,
    searchActive,
    rawCategoryQuery,
    categoryQuery,
    handleShopChange,
    activeVariants,
    activeVarNames,
    visibleAttributes,
    required,
    optional,
    extraNames,
    missingRequired,
    setAspect,
    positiveVariantPrices,
    summaryPrice,
    summaryStock,
    submit,
    selectedCategory,
    ebayConditionOptions,
    slotCtx,
  }
}

function positivePricesList(list) {
  return list.length ? list : [0]
}
