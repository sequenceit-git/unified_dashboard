import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'

const EMPTY = { sku: '', title: '', description: '', category: '', brand: '', basePrice: '', stock: 0, lowStockThreshold: 5, status: 'draft', source: 'manual' }

export default function ProductModal({ product, onClose, onSaved }) {
  const { token } = useAuth()
  const [form, setForm] = useState(product ? { ...EMPTY, ...product } : EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = { ...form, basePrice: Number(form.basePrice), stock: Number(form.stock), lowStockThreshold: Number(form.lowStockThreshold) }
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
    <Modal title={product ? 'Edit product' : 'New product'} onClose={onClose} wide>
      <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="SKU *" value={form.sku} onChange={set('sku')} required />
        <Input label="Title *" value={form.title} onChange={set('title')} required />
        <Input label="Category" value={form.category} onChange={set('category')} />
        <Input label="Brand" value={form.brand} onChange={set('brand')} />
        <Input label="Price" type="number" step="0.01" value={form.basePrice} onChange={set('basePrice')} />
        <Input label="Stock" type="number" value={form.stock} onChange={set('stock')} />
        <Input label="Low-stock threshold" type="number" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
        <Select label="Status" value={form.status} onChange={set('status')} options={['draft', 'active', 'archived'].map((s) => ({ value: s, label: s }))} />
        <div className="sm:col-span-2">
          <Input label="Description" value={form.description} onChange={set('description')} />
        </div>
        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  )
}
