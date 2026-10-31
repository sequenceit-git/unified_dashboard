import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ImageDropzone from '../../components/ui/ImageDropzone'
import Badge from '../../components/ui/Badge'
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
  description: '',
  category: '',
  brand: '',
  basePrice: '',
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
}

export default function ProductModal({ product, marketplace, onClose, onSaved, onListingChanged }) {
  const { token } = useAuth()
  const { profile } = useShopProfile(marketplace)
  const shopForm = profile?.productForm || {}
  const titleMax = shopForm.titleMax || 0
  const packageRequired = Boolean(shopForm.packageDetails?.required)
  const [specifics, setSpecifics] = useState(() => specificRows(product?.attributes))
  const [form, setForm] = useState(() => {
    if (!product) return EMPTY
    return {
      ...EMPTY,
      ...product,
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

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setImages = (imgs) => setForm((prev) => ({ ...prev, images: imgs }))

  const setSpecific = (index, field) => (e) => setSpecifics((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: e.target.value } : row)))

  const save = async (e) => {
    e.preventDefault()
    if (titleMax && form.title.length > titleMax) return setError(`${profile.label} titles can be at most ${titleMax} characters.`)
    setBusy(true)
    setError('')
    try {
      const kept = Object.fromEntries(Object.entries(product?.attributes || {}).filter(([key, value]) => HIDDEN_ATTRIBUTES.has(key) || (value && typeof value === 'object')))
      const attributes = shopForm.specifics
        ? { ...kept, ...Object.fromEntries(specifics.filter((row) => row.name.trim() && row.value.trim()).map((row) => [row.name.trim(), row.value.trim()])) }
        : product?.attributes
      const body = {
        ...form,
        ...(attributes ? { attributes } : {}),
        ...(shopForm.condition ? { condition: form.condition || 'NEW' } : {}),
        basePrice: Number(form.basePrice),
        costPrice: form.costPrice === '' || form.costPrice == null ? null : Number(form.costPrice),
        stock: Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold),
        weight: Number(form.weight) || 1,
        dimensions: {
          length: Number(form.length) || 10,
          width: Number(form.width) || 10,
          height: Number(form.height) || 5,
          unit: 'in',
        },
        images: form.images || [],
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
        const attributes = marketplace ? { ...(body.attributes || {}), targetMarketplace: marketplace } : body.attributes
        onSaved(await api.post('/api/products', { ...body, ...(attributes ? { attributes } : {}) }, token))
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
                <Input label="Category" value={form.category} onChange={set('category')} placeholder="e.g. Electronics" />
                <Input label="Brand" value={form.brand} onChange={set('brand')} placeholder="e.g. DevBrand" />
                {shopForm.condition && (
                  <Select label="Condition" value={form.condition || 'NEW'} onChange={set('condition')} options={CONDITIONS} />
                )}
              </div>
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
              <div className="grid grid-cols-2 gap-3">
                <Input label="Price ($) *" type="number" step="0.01" value={form.basePrice} onChange={set('basePrice')} required />
                <Input label="Base price ($)" type="number" step="0.01" value={form.costPrice ?? ''} onChange={set('costPrice')} placeholder="Cost before selling" />
                <Input label="Stock Quantity *" type="number" value={form.stock} onChange={set('stock')} required />
                <Input label="Low-stock Alert" type="number" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
              </div>
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
