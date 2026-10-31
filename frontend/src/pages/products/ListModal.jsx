import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import { useApi } from '../../hooks/useApi'
import { marketplaceLabel } from '../../lib/marketplaces'
import ImageDropzone from '../../components/ui/ImageDropzone'
import AttributeField, { matchAspects } from '../../components/listing/AttributeField'
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
  const [shopId, setShopId] = useState('')

  const shops = (shopsRes.data || []).filter(
    (s) => s.status === 'connected' && (!sectionMarketplace || s.marketplace === sectionMarketplace),
  )

  useEffect(() => {
    if (!shopId && shops.length === 1) setShopId(shops[0]._id)
  }, [shopId, shops])
  const selectedShop = shops.find((s) => s._id === shopId)
  const marketplace = selectedShop?.marketplace
  const caps = selectedShop?.listing || {}

  const [price, setPrice] = useState(product.basePrice || '')
  const [stock, setStock] = useState(product.stock > 0 ? product.stock : 1)
  const [title, setTitle] = useState(product.title || '')
  const [condition, setCondition] = useState(prefill?.condition || product.condition || 'NEW')
  const [brand, setBrand] = useState(product.brand || '')
  const [weight, setWeight] = useState(product.weight || 1)
  const [length, setLength] = useState(product.dimensions?.length || 10)
  const [width, setWidth] = useState(product.dimensions?.width || 10)
  const [height, setHeight] = useState(product.dimensions?.height || 5)
  const [images, setImages] = useState(Array.isArray(product.images) ? product.images : [])

  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState('')
  const [categoryState, setCategoryState] = useState({ loading: false, error: '' })
  const [attributes, setAttributes] = useState([])
  const [attributeError, setAttributeError] = useState('')
  const [aspects, setAspects] = useState({})

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const titleMax = caps.titleMax || 255
  const usesCategories = caps.canList && (caps.categorySearch || caps.categoryAutoPick)
  const categoryQuery = useDebounced(title.trim().slice(0, 80), 600)

  useEffect(() => {
    setCategories([])
    setCategoryId('')
    setAttributes([])
    setAspects({})
    setError('')
  }, [shopId])

  useEffect(() => {
    if (!usesCategories || !categoryQuery) return undefined
    let cancelled = false
    setCategoryState({ loading: true, error: '' })
    api.get(`/api/shops/${shopId}/categories?q=${encodeURIComponent(categoryQuery)}`, token)
      .then((list) => {
        if (cancelled) return
        setCategories(list || [])
        setCategoryId((current) => (current && list.some((c) => c.categoryId === current) ? current : list[0]?.categoryId || ''))
        setCategoryState({ loading: false, error: list?.length ? '' : 'No category matches this title. Try a more specific title.' })
      })
      .catch((err) => !cancelled && setCategoryState({ loading: false, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [usesCategories, shopId, categoryQuery, token])

  useEffect(() => {
    if (!caps.attributes || !categoryId) {
      setAttributes([])
      return undefined
    }
    let cancelled = false
    setAttributeError('')
    api.get(`/api/shops/${shopId}/categories/${categoryId}/attributes`, token)
      .then((list) => {
        if (cancelled) return
        setAttributes(list || [])
        setAspects((prev) => ({ ...matchAspects(list, { ...product.attributes, ...prefill?.aspects }), ...prev }))
      })
      .catch((err) => !cancelled && setAttributeError(err.message))
    return () => {
      cancelled = true
    }
  }, [caps.attributes, shopId, categoryId, token])

  const required = attributes.filter((a) => a.required)
  const optional = attributes.filter((a) => !a.required && a.recommended)
  const extraNames = Object.keys(aspects).filter((key) => !attributes.some((a) => a.id === key))
  const missingRequired = required.filter((a) => !String(aspects[a.id] || '').trim())
  const setAspect = (id, value) => setAspects((prev) => ({ ...prev, [id]: value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!selectedShop) return setError('Choose a shop to list on.')
    if (!caps.canList) return setError(caps.note || 'Listing on this shop is not available.')
    if (title.length > titleMax) return setError(`${marketplaceLabel(marketplace)} titles can be at most ${titleMax} characters.`)
    if (!(Number(stock) > 0)) return setError('Stock must be at least 1 to list a product.')
    if (missingRequired.length) return setError(`Fill in: ${missingRequired.map((a) => a.name).join(', ')}.`)

    setBusy(true)
    setError('')
    try {
      const filled = Object.fromEntries(
        Object.entries(aspects).map(([key, value]) => [key, String(value).trim()]).filter(([, value]) => value),
      )
      await api.post(
        `/api/products/${product._id}/list`,
        {
          shopId,
          price: Number(price) || product.basePrice,
          stock: Number(stock),
          title: title.trim(),
          description: product.description,
          images: (images.length ? images : product.images || []).slice(0, caps.maxImages || 12),
          ...(caps.packageDetails ? {
            weight: Number(weight) || 1,
            dimensions: { length: Number(length) || 10, width: Number(width) || 10, height: Number(height) || 5, unit: 'in' },
          } : {}),
          ...(caps.condition ? { condition, brand: brand.trim() || 'Unbranded' } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(Object.keys(filled).length ? { aspects: filled } : {}),
        },
        token,
      )
      onSaved()
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

  return (
    <Modal title={`List "${product.title}"`} onClose={onClose} wide>
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
              onChange={(e) => setShopId(e.target.value)}
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
          {caps.canList && (
            <>
              <Input label="Price ($) *" type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
              <Input label="Stock to list *" type="number" min="1" step="1" value={stock} onChange={(e) => setStock(e.target.value)} required />
            </>
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
            {categoryState.error && <p className="text-xs text-red-600">{categoryState.error}</p>}

            {caps.condition && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label="Condition" value={condition} onChange={(e) => setCondition(e.target.value)} options={CONDITIONS} />
                <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Apple, Nike, Unbranded" />
              </div>
            )}

            {(required.length > 0 || extraNames.length > 0) && (
              <div className="border-t border-indigo-100 pt-2">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">Required by {marketplaceLabel(marketplace)} for this category</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {required.map((attr) => (
                    <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
                  ))}
                  {extraNames.map((name) => (
                    <Input key={name} label={`${name} *`} value={aspects[name] || ''} onChange={(e) => setAspect(name, e.target.value)} />
                  ))}
                </div>
              </div>
            )}
            {optional.length > 0 && (
              <details className="border-t border-indigo-100 pt-2">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700">More details buyers filter by (optional)</summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {optional.slice(0, 20).map((attr) => (
                    <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
                  ))}
                </div>
              </details>
            )}
            {attributeError && <p className="text-xs text-red-600">{attributeError}</p>}

            {caps.packageDetails && (
              <div className="border-t border-indigo-100 pt-2">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">Package Dimensions & Weight</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input label="Weight (lbs)" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  <Input label="Length (in)" type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
                  <Input label="Width (in)" type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} />
                  <Input label="Height (in)" type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}

        {caps.canList && (
          <div>
            <ImageDropzone images={images} onChange={setImages} label={`Listing Images (up to ${caps.maxImages || 12})`} maxImages={caps.maxImages || 12} />
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
            {busy ? 'Publishing…' : selectedShop ? `Publish to ${selectedShop.name}` : 'List Product'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
