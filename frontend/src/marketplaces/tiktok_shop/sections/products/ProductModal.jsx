import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { Input, Select } from '../../../../components/ui/Input'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'
import { PRODUCT_STEPS, productProblems, stepsWithProblems } from './listing/productSteps'
import ImageDropzone from '../../../../components/ui/ImageDropzone'
import Badge from '../../../../components/ui/Badge'
import VariantEditor from './components/VariantEditor'
import { listingActionsFor, listingBadge, useShopProfile } from '../../../../hooks/useShopProfiles'
import { CONDITIONS } from './listingConditions'
import ProductListPrice from './listing/productFields/ListPrice'
import ProductIdentifier from './listing/productFields/Identifier'
import SearchKeywords from './components/SearchKeywords'
import TikTokOptimizePanel from './components/TikTokOptimizePanel'

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
  const subtitleMax = shopForm.subtitleMax || (0)
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
  const [shopListing, setShopListing] = useState(product?.shopListing)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('photos')
  const [tried, setTried] = useState(false)
  const listingStatus = listingBadge(profile, shopListing)
  const listingActions = listingActionsFor(profile, shopListing)
  const variantsLocked = Boolean(product && shopListing?.externalListingId)
  const tiktokProductId = shopListing?.externalListingId ? String(shopListing.externalListingId).split(':')[0] : ''

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
    // Every problem points to its step: the panel opens on the first one.
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
        const saved = await api.patch(`/api/tiktok/products/${product._id}`, body, token)
        const failed = (saved.marketplaceSync || []).filter((item) => !item.ok)
        if (failed.length) {
          alert(`Saved here, but not updated on: ${failed.map((item) => `${item.shopName} (${item.error})`).join('; ')}`)
        }
        onSaved(saved)
      } else {
        const nextAttrs = marketplace ? { ...(body.attributes || {}), targetMarketplace: marketplace } : body.attributes
        onSaved(await api.post('/api/tiktok/products', { ...body, ...(nextAttrs ? { attributes: nextAttrs } : {}) }, token))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // State the shop-specific parts of this form read (src/marketplaces/<key>/listing/productFields/).
  const slotCtx = { form, set, setForm, subtitleMax, variants }
  // After the first try, problems follow every edit (fixed ones disappear at once).
  const problems = tried ? productProblems(form, variants, { titleMax, packageRequired }) : []
  const badSteps = stepsWithProblems(problems)
  const margin = Number(form.basePrice) > 0 && form.costPrice !== '' && form.costPrice != null
    ? { amount: Number(form.basePrice) - Number(form.costPrice), pct: Math.round(((Number(form.basePrice) - Number(form.costPrice)) / Number(form.basePrice)) * 1000) / 10 }
    : null
  const card = 'space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900'
  const muted = 'text-xs text-gray-500 dark:text-slate-400'

  return (
    <StepPanel
      title={product ? 'Edit product' : 'New product'}
      steps={PRODUCT_STEPS}
      active={step}
      onStep={setStep}
      problemSteps={badSteps}
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="tiktok-product-form" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</Button>
        </>
      )}
    >
      <form id="tiktok-product-form" noValidate onSubmit={save} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() }}>
        <Step id="photos" active={step}>
          <div className={card}>
            <ImageDropzone images={form.images} onChange={setImages} maxImages={shopForm.maxImages || 12} label="Photos (drag to reorder; the first is the main photo)" />
          </div>
        </Step>

        <Step id="basics" active={step}>
          <StepProblems problems={problems} step="basics" />
          <div className={card}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                className="sm:col-span-2"
                label={titleMax ? `Title * (${form.title.length}/${titleMax})` : 'Title *'}
                value={form.title}
                onChange={set('title')}
                placeholder="e.g. Wireless Headphones"
              />
              <Input label="Brand" value={form.brand} onChange={set('brand')} placeholder="e.g. DevBrand" />
              <Input label="Category" value={form.category} onChange={set('category')} placeholder="e.g. Electronics" />
              {shopForm.condition && (
                <Select label="Condition" value={form.condition || 'NEW'} onChange={set('condition')} options={CONDITIONS} />
              )}
            </div>
            <ProductIdentifier ctx={slotCtx} />
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
          {product && (
            <div className={card}>
              <SearchKeywords productId={shopListing?.externalListingId} />
              <TikTokOptimizePanel
                productId={tiktokProductId}
                title={form.title}
                description={form.description}
                onApplyTitle={(nextTitle) => setForm((prev) => ({ ...prev, title: nextTitle }))}
              />
            </div>
          )}
        </Step>

        <Step id="specifics" active={step}>
          {shopForm.specifics ? (
            <div className={card}>
              <p className={muted}>{shopForm.specifics.hint}</p>
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
              <p className={muted}>TikTok asks for its category's own attributes when you publish; these are filled in there.</p>
            </div>
          ) : <p className="text-sm text-gray-500 dark:text-slate-400">No attributes for this shop. TikTok asks for its category's attributes when you publish.</p>}
        </Step>

        <Step id="variations" active={step}>
          <StepProblems problems={problems} step="variations" />
          <div className={card}>
            <p className={muted}>Only for items sold in several sizes, colours or styles. Price and stock then come from each variation.</p>
            <VariantEditor
              key={`${product?._id || 'new'}-${marketplace || 'all'}`}
              marketplace={marketplace}
              variants={variants}
              onChange={handleVariantsChange}
              listingImages={form.images}
              defaultPrice={form.basePrice}
              defaultStock={form.stock || 1}
              baseSku={form.sku || 'TTS'}
              lockedOptions={variantsLocked}
              requireStock={false}
            />
          </div>
        </Step>

        <Step id="price" active={step}>
          <StepProblems problems={problems} step="price" />
          <div className={card}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label={variants.length > 0 ? 'Starting price (from variations)' : 'Price ($) *'}
                type="number"
                step="0.01"
                value={form.basePrice}
                onChange={set('basePrice')}
                disabled={variants.length > 0}
              />
              <ProductListPrice ctx={slotCtx} />
              <div>
                <Input label="Base price ($)" type="number" step="0.01" value={form.costPrice ?? ''} onChange={set('costPrice')} placeholder="Cost before selling" />
                {margin && <p className={`mt-1 text-xs ${margin.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>Margin ${margin.amount.toFixed(2)} ({margin.pct}%) before TikTok fees</p>}
              </div>
              <Input label={variants.length > 0 ? 'Total stock (from variations)' : 'Stock quantity *'} type="number" value={form.stock} onChange={set('stock')} disabled={variants.length > 0} />
              <Input label="Low-stock alert" type="number" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
              {!product && variants.length === 0 && <Input label="Seller SKU (optional)" maxLength={50} value={form.sku} onChange={set('sku')} placeholder="Auto-generated if blank" />}
            </div>
          </div>
        </Step>

        <Step id="package" active={step}>
          <StepProblems problems={problems} step="package" />
          <div className={card}>
            <div>
              <h3 className="text-sm font-semibold">Package{packageRequired ? ' *' : ''}</h3>
              <p className={muted}>{shopForm.packageDetails?.note || 'Used for shipping rates.'}</p>
            </div>
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
                  <li key={`${p.step}:${p.field}:${p.message}`}>
                    <button type="button" className="text-left text-rose-700 underline-offset-2 hover:underline dark:text-rose-300" onClick={() => setStep(p.step)}>
                      {PRODUCT_STEPS.find((x) => x.id === p.step)?.label}: {p.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={`${card} flex gap-4`}>
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
              {form.images?.[0] ? <img src={form.images[0]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-gray-400">No photo</span>}
            </div>
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-gray-500 dark:text-slate-400">Title</dt><dd className="truncate">{form.title || '—'}</dd>
              <dt className="text-gray-500 dark:text-slate-400">Price</dt><dd>{form.basePrice !== '' ? `$${Number(form.basePrice).toFixed(2)}` : '—'}{variants.length > 0 && ' (from variations)'}</dd>
              <dt className="text-gray-500 dark:text-slate-400">Stock</dt><dd>{form.stock}</dd>
              <dt className="text-gray-500 dark:text-slate-400">Variations</dt><dd>{variants.length || 'None'}</dd>
              <dt className="text-gray-500 dark:text-slate-400">Photos</dt><dd>{form.images?.length || 0}</dd>
              {shopForm.condition && <><dt className="text-gray-500 dark:text-slate-400">Condition</dt><dd>{CONDITIONS.find((c) => c.value === form.condition)?.label || form.condition}</dd></>}
            </dl>
          </div>
          {product && (
            <div className={card}>
              <p className="text-sm font-semibold">{profile?.label || 'Shop'} listing</p>
              <div className="flex flex-wrap items-center gap-2">
                {listingStatus ? <Badge color={listingStatus.color}>{listingStatus.label}</Badge> : <Badge color="gray">Not listed</Badge>}
                {shopListing?.listingUrl && (
                  <a href={shopListing.listingUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                    Open on {profile?.label || 'shop'}
                  </a>
                )}
              </div>
              {shopListing?.syncError && <p className="text-xs text-amber-700 dark:text-amber-300">{shopListing.syncError}</p>}
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
                          setShopListing(await api.post(`/api/tiktok/products/${product._id}/listing-action`, { action: action.id }, token))
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
              <p className={muted}>Saving an edit also updates the live TikTok Shop product.</p>
            </div>
          )}
        </Step>

        {error && <p className="mt-3 text-sm font-medium text-red-600 dark:text-rose-400">{error}</p>}
      </form>
    </StepPanel>
  )
}
