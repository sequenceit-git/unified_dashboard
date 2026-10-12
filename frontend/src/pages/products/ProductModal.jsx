import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import ImageDropzone from '../../components/ui/ImageDropzone'

const EMPTY = {
  sku: '',
  title: '',
  description: '',
  category: '',
  brand: '',
  basePrice: '',
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

export default function ProductModal({ product, onClose, onSaved }) {
  const { token } = useAuth()
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
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setImages = (imgs) => setForm((prev) => ({ ...prev, images: imgs }))

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = {
        ...form,
        basePrice: Number(form.basePrice),
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

      if (product) await api.patch(`/api/products/${product._id}`, body, token)
      else await api.post('/api/products', body, token)
      onSaved()
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
                <Input label="SKU *" value={form.sku} onChange={set('sku')} required placeholder="e.g. PROD-001" />
                <Input label="Title *" value={form.title} onChange={set('title')} required placeholder="e.g. Wireless Headphones" />
                <Input label="Category" value={form.category} onChange={set('category')} placeholder="e.g. Electronics" />
                <Input label="Brand" value={form.brand} onChange={set('brand')} placeholder="e.g. DevBrand" />
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
                <Input label="Stock Quantity *" type="number" value={form.stock} onChange={set('stock')} required />
                <Input label="Low-stock Alert" type="number" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
                <Select
                  label="Listing Status"
                  value={form.status}
                  onChange={set('status')}
                  options={['draft', 'active', 'archived'].map((s) => ({ value: s, label: s }))}
                />
              </div>
            </div>
          </div>

          {/* Right Side: Visuals & Shipping Dimensions */}
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs">
              <ImageDropzone images={form.images} onChange={setImages} maxImages={12} label="Product Visuals (Drag & Drop)" />
            </div>

            <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-4 shadow-2xs space-y-2.5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">Package Logistics & Dimensions</h3>
                <p className="text-[11px] text-gray-500">Used by eBay, TikTok Shop, and Temu for shipping rates</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Input label="Weight (lbs)" type="number" step="0.1" value={form.weight} onChange={set('weight')} />
                <Input label="Length (in)" type="number" step="0.1" value={form.length} onChange={set('length')} />
                <Input label="Width (in)" type="number" step="0.1" value={form.width} onChange={set('width')} />
                <Input label="Height (in)" type="number" step="0.1" value={form.height} onChange={set('height')} />
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
