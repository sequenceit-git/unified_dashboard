import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import { useApi } from '../../hooks/useApi'
import { marketplaceLabel } from '../../lib/marketplaces'
import ImageDropzone from '../../components/ui/ImageDropzone'

const EBAY_CONDITIONS = [
  { value: 'NEW', label: 'Brand New (NEW)' },
  { value: 'LIKE_NEW', label: 'Like New (LIKE_NEW)' },
  { value: 'USED_EXCELLENT', label: 'Used - Excellent (USED_EXCELLENT)' },
  { value: 'USED_VERY_GOOD', label: 'Used - Very Good (USED_VERY_GOOD)' },
  { value: 'USED_GOOD', label: 'Used - Good (USED_GOOD)' },
  { value: 'FOR_PARTS_OR_NOT_WORKING', label: 'For Parts / Not Working' },
]

export default function ListModal({ product, onClose, onSaved }) {
  const { token } = useAuth()
  const shopsRes = useApi('/api/shops')
  const [shopId, setShopId] = useState('')

  // Selected shop
  const selectedShop = (shopsRes.data || []).find((s) => s._id === shopId)
  const marketplace = selectedShop?.marketplace

  // Form states initialized with product values
  const [price, setPrice] = useState(product.basePrice || '')
  const [title, setTitle] = useState(product.title || '')
  const [condition, setCondition] = useState('NEW')
  const [categoryId, setCategoryId] = useState('')
  const [brand, setBrand] = useState(product.brand || '')
  const [weight, setWeight] = useState(product.weight || 1)
  const [length, setLength] = useState(product.dimensions?.length || 10)
  const [width, setWidth] = useState(product.dimensions?.width || 10)
  const [height, setHeight] = useState(product.dimensions?.height || 5)
  const [images, setImages] = useState(Array.isArray(product.images) ? product.images : [])

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleShopChange = (e) => {
    const newId = e.target.value
    setShopId(newId)
    const nextShop = (shopsRes.data || []).find((s) => s._id === newId)
    if (nextShop?.marketplace === 'tiktok_shop' && !categoryId) {
      setCategoryId('600001')
    } else if (nextShop?.marketplace === 'temu' && !categoryId) {
      setCategoryId('200001')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!shopId) {
      setError('Please select a target store')
      return
    }

    if (marketplace === 'ebay' && title.length > 80) {
      setError('eBay titles cannot exceed 80 characters.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const payload = {
        shopId,
        price: Number(price) || product.basePrice,
        title: title.trim(),
        images: images.length ? images : product.images,
        weight: Number(weight) || 1,
        dimensions: {
          length: Number(length) || 10,
          width: Number(width) || 10,
          height: Number(height) || 5,
          unit: 'in',
        },
      }

      if (marketplace === 'ebay') {
        payload.condition = condition
        payload.brand = brand.trim() || 'Unbranded'
      } else if (marketplace === 'tiktok_shop') {
        payload.categoryId = categoryId.trim() || '600001'
      } else if (marketplace === 'temu') {
        payload.categoryId = categoryId.trim() || '200001'
      }

      await api.post(`/api/products/${product._id}/list`, payload, token)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`List "${product.title}"`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Target Shop *"
            value={shopId}
            onChange={handleShopChange}
            options={[
              { value: '', label: 'Choose a connected store…' },
              ...((shopsRes.data || []).map((s) => ({
                value: s._id,
                label: `${s.name} (${marketplaceLabel(s.marketplace)})`,
              }))),
            ]}
          />

          <Input
            label="Listing Price ($) *"
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>

        {selectedShop && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-900">
                {marketplaceLabel(marketplace)} Channel Configuration
              </span>
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                {marketplace === 'ebay' ? 'eBay Sell Inventory API' : marketplace === 'tiktok_shop' ? 'TikTok Open Platform 202309' : 'Temu Open Platform'}
              </span>
            </div>

            {/* Title field with marketplace-specific limits */}
            <div className="mt-2">
              <div className="flex items-center justify-between">
                <span className="mb-1 text-xs font-semibold text-gray-700">Listing Title *</span>
                {marketplace === 'ebay' ? (
                  <span className={`text-xs font-medium ${title.length > 80 ? 'text-red-600 font-bold' : title.length > 70 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {title.length}/80 characters (eBay limit)
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">{title.length} characters</span>
                )}
              </div>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={marketplace === 'ebay' ? 80 : 255}
                required
              />
            </div>

            {/* Marketplace Specific Fields */}
            {marketplace === 'ebay' && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select
                  label="Condition (eBay required)"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  options={EBAY_CONDITIONS}
                />
                <Input
                  label="Brand Aspect (eBay required)"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Apple, Nike, Unbranded"
                />
              </div>
            )}

            {marketplace === 'tiktok_shop' && (
              <div className="mt-3">
                <Input
                  label="TikTok Category ID (Leaf Category)"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  placeholder="600001 (Default General Retail Category)"
                />
                <p className="mt-1 text-xs text-gray-500">TikTok requires a valid leaf category ID and package dimensions for rate calculations.</p>
              </div>
            )}

            {marketplace === 'temu' && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Temu Category ID (cat_id)"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  placeholder="200001"
                />
                <div className="flex flex-col justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span>Temu Weight Conversion:</span>
                  <span className="font-semibold">{Math.round((Number(weight) || 1) * 453.592)} grams ({weight} lbs)</span>
                </div>
              </div>
            )}

            {/* Packaging and Dimensions */}
            <div className="mt-3 pt-2 border-t border-indigo-100">
              <span className="block mb-1.5 text-xs font-semibold text-gray-700">Package Dimensions & Weight</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input label="Weight (lbs)" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                <Input label="Length (in)" type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
                <Input label="Width (in)" type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} />
                <Input label="Height (in)" type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Product Images Upload / Verification Drag & Drop */}
        <div>
          <ImageDropzone
            images={images}
            onChange={setImages}
            label={`Listing Images ${marketplace === 'temu' ? '(Temu Carousel Images)' : marketplace === 'tiktok_shop' ? '(TikTok main_images)' : '(eBay imageUrls)'}`}
            maxImages={12}
          />
          {images.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              Warning: Marketplaces require at least 1 image to publish an active listing.
            </p>
          )}
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !shopId || (marketplace === 'ebay' && title.length > 80)}>
            {busy ? 'Publishing Listing…' : selectedShop ? `Publish to ${selectedShop.name}` : 'List Product'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
