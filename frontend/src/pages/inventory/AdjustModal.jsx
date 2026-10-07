import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'

const REASONS = ['manual', 'restock', 'sale', 'return', 'sync'].map((r) => ({ value: r, label: r }))

export default function AdjustModal({ product, onClose, onSaved }) {
  const { token } = useAuth()
  const [change, setChange] = useState('')
  const [reason, setReason] = useState('manual')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/inventory/adjust', { productId: product._id, change: Number(change), reason }, token)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Adjust stock — ${product.sku}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-gray-600">Current stock: <strong>{product.stock}</strong></p>
        <Input label="Change (e.g. 10 or -5) *" type="number" value={change} onChange={(e) => setChange(e.target.value)} required />
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Apply</Button>
        </div>
      </form>
    </Modal>
  )
}
