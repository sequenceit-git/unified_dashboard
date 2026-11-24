import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { Input, Select } from '../../../../components/ui/Input'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'
import { TEMU_PRODUCT_STEPS, productProblems } from './listing/productSteps'
import ImageDropzone from '../../../../components/ui/ImageDropzone'
import Badge from '../../../../components/ui/Badge'
import VariantEditor from './components/VariantEditor'
import { listingActionsFor, listingBadge, useShopProfile } from '../../../../hooks/useShopProfiles'
import { CONDITIONS } from './listingConditions'
import TemuDetail from './components/TemuDetail'

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
  const titleMax = shopForm.titleMax || 0
  const packageRequired = Boolean(shopForm.packageDetails?.required)
  const [step, setStep] = useState(product ? 'basics' : 'photos')
  const [tried, setTried] = useState(false)
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
  const [shopListing, setShopListing] = useState(product?.shopListing)
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
    setTried(true)
    const found = productProblems(form, variants, { titleMax, packageRequired })
    if (found.length) {
      setStep(found[0].step)
      return
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
      const body = {
        ...form,
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
      delete body.subtitle
        delete body.conditionDescription
        delete body.mpn
        delete body.dispatchTimeMax
        delete body.bestOffer
      delete body.length
      delete body.width
      delete body.height

      if (product) {
        const saved = await api.patch(`/api/temu/goods/${product._id}`, body, token)
        const failed = (saved.marketplaceSync || []).filter((item) => !item.ok)
        if (failed.length) {
          alert(`Saved here, but not updated on: ${failed.map((item) => `${item.shopName} (${item.error})`).join('; ')}`)
        }
        onSaved(saved)
      } else {
        const nextAttrs = marketplace ? { ...(body.attributes || {}), targetMarketplace: marketplace } : body.attributes
        onSaved(await api.post('/api/temu/goods', { ...body, ...(nextAttrs ? { attributes: nextAttrs } : {}) }, token))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // State the shop-specific parts of this form read (src/marketplaces/<key>/listing/productFields/).
  // Variant editor style: the shop's own when it has eBay fields, otherwise the TikTok-style editor.

  const problems = tried ? productProblems(form, variants, { titleMax, packageRequired }) : []
  const badSteps = new Set(problems.map((p) => p.step))
  const margin = Number(form.basePrice) > 0 && form.costPrice !== '' && form.costPrice != null
    ? { amount: Number(form.basePrice) - Number(form.costPrice), pct: Math.round(((Number(form.basePrice) - Number(form.costPrice)) / Number(form.basePrice)) * 1000) / 10 }
    : null
  const card = 'space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900'

  return (
    <StepPanel
      title={product ? 'Edit goods' : 'New goods'}
      steps={TEMU_PRODUCT_STEPS}
      active={step}
      onStep={setStep}
      problemSteps={badSteps}
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="temu-product-form" disabled={busy}>{busy ? 'Saving…' : 'Save goods'}</Button>
        </>
      )}
    >
      <form id="temu-product-form" noValidate onSubmit={save} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() }}>
        <Step id="photos" active={step}>
          <div className={card}>
            <ImageDropzone images={form.images} onChange={setImages} maxImages={shopForm.maxImages || 12} label="Photos (drag to reorder; the first is the main photo)" />
          </div>
        </Step>

        <Step id="basics" active={step}>
          <StepProblems problems={problems} step="basics" />
          <div className={card}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input className="sm:col-span-2" label={titleMax ? `Title * (${form.title.length}/${titleMax})` : 'Title *'} value={form.title} onChange={set('title')} placeholder="e.g. Wireless Headphones" />
              <Input label="Category" value={form.category} onChange={set('category')} placeholder="e.g. Electronics" />
              <Input label="Brand" value={form.brand} onChange={set('brand')} placeholder="e.g. DevBrand" />
              {shopForm.condition && <Select label="Condition" value={form.condition || 'NEW'} onChange={set('condition')} options={CONDITIONS} />}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">Description</label>
              <textarea
                rows={5}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Detailed product specifications, key features..."
                value={form.description}
                onChange={set('description')}
              />
            </div>
          </div>
          {shopForm.specifics && (
            <div className={card}>
              <p className="text-sm font-semibold">{shopForm.specifics.label}</p>
              <p className="text-xs text-gray-500">{shopForm.specifics.hint}</p>
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
          <p className="text-xs text-gray-500">Temu's own category and properties are set in the Temu listing form (List on Temu).</p>
        </Step>

        <Step id="price" active={step}>
          <StepProblems problems={problems} step="price" />
          <div className={card}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label={variants.length > 0 ? 'Starting price (from variants)' : 'Price ($) *'} type="number" step="0.01" value={form.basePrice} onChange={set('basePrice')} disabled={variants.length > 0} />
              <div>
                <Input label="Base price ($)" type="number" step="0.01" value={form.costPrice ?? ''} onChange={set('costPrice')} placeholder="Cost before selling" />
                {margin && <p className={`mt-1 text-xs ${margin.amount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>Margin ${margin.amount.toFixed(2)} ({margin.pct}%) before Temu's share</p>}
              </div>
              <Input label={variants.length > 0 ? 'Total stock (from variants)' : 'Stock quantity *'} type="number" value={form.stock} onChange={set('stock')} disabled={variants.length > 0} />
              <Input label="Low-stock alert" type="number" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
            </div>
            {variants.length > 0 && (
              <VariantEditor
                key={`${product?._id || 'new'}-${marketplace || 'all'}`}
                marketplace={marketplace}
                variants={variants}
                onChange={handleVariantsChange}
                listingImages={form.images}
                defaultPrice={form.basePrice}
                defaultStock={form.stock || 1}
                baseSku={form.sku || 'TEMU'}
                lockedOptions={variantsLocked}
                requireStock={false}
              />
            )}
          </div>
        </Step>

        <Step id="package" active={step}>
          <StepProblems problems={problems} step="package" />
          <div className={card}>
            <p className="text-sm font-semibold">Package{packageRequired ? ' *' : ''}</p>
            <p className="text-xs text-gray-500">{shopForm.packageDetails?.note || 'Temu uses weight (lb) and size (in) per SKU.'}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input label="Weight (lbs)" type="number" step="0.1" value={form.weight} onChange={set('weight')} />
              <Input label="Length (in)" type="number" step="0.1" value={form.length} onChange={set('length')} />
              <Input label="Width (in)" type="number" step="0.1" value={form.width} onChange={set('width')} />
              <Input label="Height (in)" type="number" step="0.1" value={form.height} onChange={set('height')} />
            </div>
          </div>
        </Step>

        <Step id="review" active={step}>
          {problems.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
              <p className="mb-1 text-sm font-semibold text-rose-800 dark:text-rose-200">Fix these before saving</p>
              <ul className="space-y-1 text-sm">
                {problems.map((p) => (
                  <li key={`${p.field}:${p.message}`}>
                    <button type="button" className="text-left text-rose-700 underline-offset-2 hover:underline dark:text-rose-300" onClick={() => setStep(p.step)}>
                      {TEMU_PRODUCT_STEPS.find((x) => x.id === p.step)?.label}: {p.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shopListing?.externalListingId && <TemuDetail externalListingId={shopListing.externalListingId} />}
          {product && (
            <div className={card}>
              <p className="text-sm font-semibold">{profile?.label || 'Temu'} listing</p>
              <div className="flex flex-wrap items-center gap-2">
                {listingStatus ? <Badge color={listingStatus.color}>{listingStatus.label}</Badge> : <Badge color="gray">Not on Temu</Badge>}
                {shopListing?.listingUrl && shopListing.status !== 'error' && (
                  <a href={shopListing.listingUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline">Open on Temu</a>
                )}
              </div>
              {shopListing?.syncError && <p className="text-xs text-amber-700">Temu: {shopListing.syncError}</p>}
              {listingActions.length > 0 && (
                <div className="flex flex-wrap gap-2">
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
                          setShopListing(await api.post(`/api/temu/goods/${product._id}/listing-action`, { action: action.id }, token))
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
              <p className="text-xs text-gray-500">Saving an edit also updates the goods on Temu.</p>
            </div>
          )}
        </Step>

        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      </form>
    </StepPanel>
  )
}
