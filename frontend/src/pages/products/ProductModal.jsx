import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ImageDropzone from '../../components/ui/ImageDropzone'
import Badge from '../../components/ui/Badge'
import IdentifierCodeField from '../../components/listing/IdentifierCodeField'
import EbayIdentifierField from '../../components/listing/EbayIdentifierField'
import EbayBestOfferField from '../../components/listing/EbayBestOfferField'
import VariantEditor from '../../components/listing/VariantEditor'
import { validateIdentifierCode, validateVariantsForTikTok } from '../../lib/tiktokListing'
import {
  DISPATCH_TIMES,
  isNewCondition,
  validateBestOffer,
  validateEbayIdentifierCode,
  validateVariantsForEbay,
} from '../../lib/ebayListing'
import { listingActionsFor, listingBadge, useShopProfile } from '../../hooks/useShopProfiles'
import { CONDITIONS } from '../../lib/listingConditions'

// Bookkeeping keys kept in `attributes` that aren't item specifics.
const HIDDEN_ATTRIBUTES = new Set(['targetMarketplace', 'sourceUrl', 'gtin', 'aiOpportunityScore', 'listingUrl', 'estimatedCost'])

function specificRows(attributes) {
  return Object.entries(attributes || {})
    .filter(([key, value]) => !HIDDEN_ATTRIBUTES.has(key) && value != null && typeof value !== 'object')
    .map(([name, value]) => ({ name, value: String(value) }))
}

const EMPTY = {
  sku: '',
  title: '',
  subtitle: '',
  description: '',
  category: '',
  brand: '',
  brandId: '',
  mpn: '',
  condition: 'NEW',
  conditionDescription: '',
  dispatchTimeMax: '',
  bestOffer: { enabled: false, autoAcceptPrice: '', minOfferPrice: '' },
  basePrice: '',
  listPrice: '',
  costPrice: '',
  stock: 0,
  lowStockThreshold: 5,
  status: 'draft',
  source: 'manual',
  weight: 1,
  length: 10,
  width: 10,
  height: 5,
  images: [],
  identifierCode: { type: '', code: '' },
}

export default function ProductModal({ product, marketplace, onClose, onSaved, onListingChanged }) {
  const { token } = useAuth()
  const { profile } = useShopProfile(marketplace)
  const shopForm = profile?.productForm || {}
  const isTikTok = marketplace === 'tiktok_shop'
  const isEbay = marketplace === 'ebay'
  const titleMax = shopForm.titleMax || 0
  const subtitleMax = shopForm.subtitleMax || (isEbay ? 55 : 0)
  const packageRequired = Boolean(shopForm.packageDetails?.required)
  const [specifics, setSpecifics] = useState(() => specificRows(product?.attributes))
  const [variants, setVariants] = useState(() => (Array.isArray(product?.variants) ? product.variants.map((v) => ({ ...v })) : []))
  const [form, setForm] = useState(() => {
    if (!product) return EMPTY
    return {
      ...EMPTY,
      ...product,
      subtitle: product.subtitle || '',
      mpn: product.mpn || '',
      condition: product.condition || 'NEW',
      conditionDescription: product.conditionDescription || '',
      dispatchTimeMax: product.dispatchTimeMax != null ? String(product.dispatchTimeMax) : '',
      bestOffer: {
        enabled: Boolean(product.bestOffer?.enabled),
        autoAcceptPrice: product.bestOffer?.autoAcceptPrice ?? '',
        minOfferPrice: product.bestOffer?.minOfferPrice ?? '',
      },
      brandId: product.brandId || '',
      listPrice: product.listPrice ?? '',
      identifierCode: product.identifierCode?.code ? product.identifierCode : { type: '', code: '' },
      weight: product.weight ?? 1,
      length: product.dimensions?.length ?? 10,
      width: product.dimensions?.width ?? 10,
      height: product.dimensions?.height ?? 5,
      images: Array.isArray(product.images) ? product.images : [],
    }
  })
  const [shopListing, setShopListing] = useState(product?.shopListing || null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const listingStatus = listingBadge(profile, shopListing)
  const listingActions = listingActionsFor(profile, shopListing)
  const variantsLocked = Boolean(product && shopListing?.externalListingId)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setImages = (imgs) => setForm((prev) => ({ ...prev, images: imgs }))

  const setSpecific = (index, field) => (e) => setSpecifics((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: e.target.value } : row)))

  const handleVariantsChange = (next) => {
    setVariants(next)
    if (next.length > 0) {
      const totalStock = next.reduce((sum, v) => sum + Math.max(0, Math.floor(Number(v.stock) || 0)), 0)
      const positivePrices = next.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
      setForm((prev) => ({
        ...prev,
        stock: totalStock,
        ...(positivePrices.length ? { basePrice: Math.min(...positivePrices) } : {}),
      }))
    }
  }

  const save = async (e) => {
    e.preventDefault()
    if (titleMax && form.title.length > titleMax) return setError(`${profile.label} titles can be at most ${titleMax} characters.`)
    if (isEbay && subtitleMax && form.subtitle.length > subtitleMax) {
      return setError(`eBay subtitles can be at most ${subtitleMax} characters.`)
    }
    if (isTikTok && variants.length > 0) {
      const variantErr = validateVariantsForTikTok(variants, { requireStock: false })
      if (variantErr) return setError(variantErr)
    } else if (isTikTok) {
      const idErr = validateIdentifierCode(form.identifierCode)
      if (idErr) return setError(idErr)
      if (form.listPrice !== '' && form.listPrice != null && Number(form.listPrice) > 0 && Number(form.basePrice) > 0) {
        if (Number(form.listPrice) < Number(form.basePrice) || Number(form.listPrice) > 7600) {
          return setError(`MSRP / list price must be between $${Number(form.basePrice).toFixed(2)} and $7,600.00.`)
        }
      }
    } else if (isEbay) {
      if (variants.length > 0) {
        const varErr = validateVariantsForEbay(variants, { requireStock: false })
        if (varErr) return setError(varErr)
      } else {
        const idErr = validateEbayIdentifierCode(form.identifierCode)
        if (idErr) return setError(idErr)
      }
      const positiveVarPrices = variants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
      const floorPrice = variants.length > 0 && positiveVarPrices.length ? Math.min(...positiveVarPrices) : Number(form.basePrice)
      const boErr = validateBestOffer(form.bestOffer, floorPrice)
      if (boErr) return setError(boErr)
    }

    setBusy(true)
    setError('')
    try {
      const kept = Object.fromEntries(Object.entries(product?.attributes || {}).filter(([key, value]) => HIDDEN_ATTRIBUTES.has(key) || (value && typeof value === 'object')))
      const attributes = shopForm.specifics
        ? { ...kept, ...Object.fromEntries(specifics.filter((row) => row.name.trim() && row.value.trim()).map((row) => [row.name.trim(), row.value.trim()])) }
        : product?.attributes
      const normalizedVariants = variants.length > 0
        ? variants.map((v) => ({
            ...v,
            price: v.price === '' || v.price == null ? undefined : Number(v.price),
            listPrice: v.listPrice === '' || v.listPrice == null ? undefined : Number(v.listPrice),
            stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
          }))
        : (product?.variants?.length ? [] : undefined)
      const computedStock = normalizedVariants?.length
        ? normalizedVariants.reduce((sum, v) => sum + v.stock, 0)
        : Number(form.stock)
      const positivePrices = (normalizedVariants || []).map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)
      const computedBasePrice = normalizedVariants?.length && positivePrices.length
        ? Math.min(...positivePrices)
        : Number(form.basePrice)
      const cleanIdCode = String(form.identifierCode?.code || '').trim()
        ? { type: String(form.identifierCode.type || '').toUpperCase(), code: String(form.identifierCode.code).trim() }
        : undefined
      const cleanBestOffer = isEbay
        ? (form.bestOffer?.enabled
            ? {
                enabled: true,
                ...(form.bestOffer.autoAcceptPrice !== '' && form.bestOffer.autoAcceptPrice != null
                  ? { autoAcceptPrice: Number(form.bestOffer.autoAcceptPrice) }
                  : {}),
                ...(form.bestOffer.minOfferPrice !== '' && form.bestOffer.minOfferPrice != null
                  ? { minOfferPrice: Number(form.bestOffer.minOfferPrice) }
                  : {}),
              }
            : { enabled: false })
        : undefined
      const body = {
        ...form,
        ...(isEbay ? {
          subtitle: String(form.subtitle || '').trim().slice(0, 55),
          conditionDescription: isNewCondition(form.condition) ? '' : String(form.conditionDescription || '').trim().slice(0, 1000),
          mpn: String(form.mpn || '').trim(),
          dispatchTimeMax: form.dispatchTimeMax === '' || form.dispatchTimeMax == null ? undefined : Number(form.dispatchTimeMax),
          bestOffer: cleanBestOffer,
        } : {}),
        ...(attributes ? { attributes } : {}),
        ...(normalizedVariants !== undefined ? { variants: normalizedVariants } : {}),
        ...(shopForm.condition ? { condition: form.condition || 'NEW' } : {}),
        basePrice: computedBasePrice,
        listPrice: form.listPrice === '' || form.listPrice == null ? undefined : Number(form.listPrice),
        costPrice: form.costPrice === '' || form.costPrice == null ? null : Number(form.costPrice),
        stock: computedStock,
        lowStockThreshold: Number(form.lowStockThreshold),
        weight: Number(form.weight) || 1,
        dimensions: {
          length: Number(form.length) || 10,
          width: Number(form.width) || 10,
          height: Number(form.height) || 5,
          unit: 'in',
        },
        images: form.images || [],
        ...(cleanIdCode ? { identifierCode: cleanIdCode } : { identifierCode: undefined }),
      }
      if (!body.brandId) delete body.brandId
      if (!isEbay) {
        delete body.subtitle
        delete body.conditionDescription
        delete body.mpn
        delete body.dispatchTimeMax
        delete body.bestOffer
      }
      delete body.length
      delete body.width
      delete body.height

      if (product) {
        const saved = await api.patch(`/api/products/${product._id}`, body, token)
        const failed = (saved.marketplaceSync || []).filter((item) => !item.ok)
        if (failed.length) {
          alert(`Saved here, but not updated on: ${failed.map((item) => `${item.shopName} (${item.error})`).join('; ')}`)
        }
        onSaved(saved)
      } else {
        const nextAttrs = marketplace ? { ...(body.attributes || {}), targetMarketplace: marketplace } : body.attributes
        onSaved(await api.post('/api/products', { ...body, ...(nextAttrs ? { attributes: nextAttrs } : {}) }, token))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={product ? 'Edit product' : 'New product'} onClose={onClose} size="5xl">
      <form onSubmit={save} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Side: General Info & Pricing/Inventory */}
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Product Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  className="sm:col-span-2"
                  label={titleMax ? `Title * (${form.title.length}/${titleMax})` : 'Title *'}
                  value={form.title}
                  onChange={set('title')}
                  required
                  placeholder="e.g. Wireless Headphones"
                />
                {isEbay && (
                  <Input
                    className="sm:col-span-2"
                    label={`Subtitle (optional, ${form.subtitle.length}/${subtitleMax} — extra eBay fee may apply)`}
                    maxLength={subtitleMax}
                    value={form.subtitle}
                    onChange={set('subtitle')}
                    placeholder="Supplemental keywords shown beneath title"
                  />
                )}
                <Input label="Category" value={form.category} onChange={set('category')} placeholder="e.g. Electronics" />
                <Input label="Brand" value={form.brand} onChange={set('brand')} placeholder="e.g. DevBrand" />
                {isEbay && (
                  <Input label="MPN (optional)" value={form.mpn} onChange={set('mpn')} placeholder="Manufacturer Part Number" />
                )}
                {shopForm.condition && (
                  <Select label="Condition" value={form.condition || 'NEW'} onChange={set('condition')} options={CONDITIONS} />
                )}
              </div>
              {isEbay && !isNewCondition(form.condition) && (
                <div>
                  <label className="block mb-1 text-xs font-semibold text-gray-600">
                    Condition description ({form.conditionDescription.length}/1000)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    placeholder="Describe cosmetic wear, included accessories, or defects…"
                    value={form.conditionDescription}
                    onChange={set('conditionDescription')}
                  />
                </div>
              )}
              <div>
                <label className="block mb-1 text-xs font-semibold text-gray-600">Description</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  placeholder="Detailed product specifications, key features..."
                  value={form.description}
                  onChange={set('description')}
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600">Pricing & Inventory</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={variants.length > 0 ? 'Starting Price (from variants)' : 'Price ($) *'}
                  type="number"
                  step="0.01"
                  value={form.basePrice}
                  onChange={set('basePrice')}
                  disabled={variants.length > 0}
                  required={variants.length === 0}
                />
                {isTikTok && variants.length === 0 && (
                  <Input
                    label="MSRP / List price ($)"
                    type="number"
                    step="0.01"
                    min="0"
                    max="7600"
                    value={form.listPrice ?? ''}
                    onChange={set('listPrice')}
                    placeholder="Optional strikethrough price"
                  />
                )}
                <Input label="Base price ($)" type="number" step="0.01" value={form.costPrice ?? ''} onChange={set('costPrice')} placeholder="Cost before selling" />
                <Input label={variants.length > 0 ? 'Total Stock (from variants)' : 'Stock Quantity *'} type="number" value={form.stock} onChange={set('stock')} disabled={variants.length > 0} required={variants.length === 0} />
                <Input label="Low-stock Alert" type="number" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
                {(isTikTok || isEbay) && !product && variants.length === 0 && (
                  <Input label="Seller SKU (optional)" maxLength={50} value={form.sku} onChange={set('sku')} placeholder="Auto-generated if blank" />
                )}
              </div>
              {isTikTok && variants.length === 0 && (
                <IdentifierCodeField
                  value={form.identifierCode}
                  onChange={(val) => setForm((prev) => ({ ...prev, identifierCode: val }))}
                />
              )}
              {isEbay && variants.length === 0 && (
                <EbayIdentifierField
                  value={form.identifierCode}
                  onChange={(val) => setForm((prev) => ({ ...prev, identifierCode: val }))}
                />
              )}
              {(isTikTok || isEbay || variants.length > 0) && (
                <VariantEditor
                  key={`${product?._id || 'new'}-${marketplace || 'all'}`}
                  marketplace={isEbay ? 'ebay' : 'tiktok_shop'}
                  variants={variants}
                  onChange={handleVariantsChange}
                  listingImages={form.images}
                  defaultPrice={form.basePrice}
                  defaultStock={form.stock || 1}
                  baseSku={form.sku || (isEbay ? 'EBAY' : 'TTS')}
                  lockedOptions={variantsLocked}
                  requireStock={false}
                />
              )}
              {isEbay && (
                <div className="space-y-3 border-t border-gray-100 pt-3">
                  <EbayBestOfferField
                    value={form.bestOffer}
                    onChange={(val) => setForm((prev) => ({ ...prev, bestOffer: val }))}
                    minPrice={variants.length > 0
                      ? Math.min(...(variants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)))
                      : Number(form.basePrice)}
                  />
                  <Select
                    label="Handling time"
                    value={form.dispatchTimeMax}
                    onChange={set('dispatchTimeMax')}
                    options={DISPATCH_TIMES}
                  />
                </div>
              )}
              {product && (
              <div className="border-t border-gray-100 pt-3">
                <p className="mb-1.5 text-xs font-semibold text-gray-600">{profile?.label || 'Shop'} listing</p>
                <div className="flex flex-wrap items-center gap-2">
                  {listingStatus ? (
                    <Badge color={listingStatus.color}>{listingStatus.label}</Badge>
                  ) : (
                    <Badge color="gray">Not listed</Badge>
                  )}
                  {shopListing?.listingUrl && (
                    <a href={shopListing.listingUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline">
                      Open on {profile?.label || 'shop'}
                    </a>
                  )}
                </div>
                {shopListing?.syncError && (
                  <p className="mt-2 text-xs text-amber-700">{shopListing.syncError}</p>
                )}
                {listingActions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {listingActions.map((action) => (
                      <Button
                        key={action.id}
                        type="button"
                        size="sm"
                        variant={action.danger ? 'danger' : 'secondary'}
                        disabled={busy}
                        onClick={async () => {
                          if (action.confirm && !window.confirm(action.confirm)) return
                          setBusy(true)
                          setError('')
                          try {
                            setShopListing(await api.post(`/api/products/${product._id}/listing-action`, { action: action.id, marketplace }, token))
                            onListingChanged?.()
                          } catch (err) {
                            setError(err.message)
                          } finally {
                            setBusy(false)
                          }
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>

            {shopForm.specifics && (
              <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600">{shopForm.specifics.label}</h3>
                  <p className="text-[11px] text-gray-500">{shopForm.specifics.hint}</p>
                </div>
                {specifics.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <Input label={index === 0 ? 'Name' : undefined} value={row.name} onChange={setSpecific(index, 'name')} placeholder="e.g. Color" />
                    <Input label={index === 0 ? 'Value' : undefined} value={row.value} onChange={setSpecific(index, 'value')} placeholder="e.g. Black" />
                    <Button variant="ghost" size="sm" type="button" onClick={() => setSpecifics((rows) => rows.filter((_, i) => i !== index))}>Remove</Button>
                  </div>
                ))}
                <Button variant="secondary" size="sm" type="button" onClick={() => setSpecifics((rows) => [...rows, { name: '', value: '' }])}>
                  Add {shopForm.specifics.label.toLowerCase().replace(/s$/, '')}
                </Button>
              </div>
            )}
          </div>

          {/* Right Side: Visuals & Shipping Dimensions */}
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs">
              <ImageDropzone images={form.images} onChange={setImages} maxImages={shopForm.maxImages || 12} label="Product Visuals (Drag & Drop)" />
            </div>

            <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-4 shadow-2xs space-y-2.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Package Logistics & Dimensions{packageRequired ? ' *' : ''}
                </h3>
                <p className="text-[11px] text-gray-500">{shopForm.packageDetails?.note || 'Used for shipping rates.'}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Input label="Weight (lbs)" type="number" step="0.1" min={packageRequired ? '0.01' : undefined} value={form.weight} onChange={set('weight')} required={packageRequired} />
                <Input label="Length (in)" type="number" step="0.1" min={packageRequired ? '0.1' : undefined} value={form.length} onChange={set('length')} required={packageRequired} />
                <Input label="Width (in)" type="number" step="0.1" min={packageRequired ? '0.1' : undefined} value={form.width} onChange={set('width')} required={packageRequired} />
                <Input label="Height (in)" type="number" step="0.1" min={packageRequired ? '0.1' : undefined} value={form.height} onChange={set('height')} required={packageRequired} />
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save Product'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
