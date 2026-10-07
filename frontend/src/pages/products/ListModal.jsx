import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import { useApi } from '../../hooks/useApi'

// Stage a local listing row (marketplace push comes with §2.1).
export default function ListModal({ product, onClose, onSaved }) {
  const { token } = useAuth()
  const shopsRes = useApi('/api/shops')
  const [shopId, setShopId] = useState('')
  const [price, setPrice] = useState(product.basePrice || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post(`/api/products/${product._id}/list`, { shopId, price: Number(price) }, token)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`List "${product.title}"`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select
          label="Shop *"
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
          options={[{ value: '', label: 'Choose…' }, ...((shopsRes.data || []).map((s) => ({ value: s._id, label: `${s.name} (${s.marketplace})` })))]}
        />
        <Input label="Price override" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !shopId}>{busy ? 'Listing…' : 'List product'}</Button>
        </div>
      </form>
    </Modal>
  )
}
