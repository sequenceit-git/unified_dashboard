import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'

const REASONS = [
  { value: 'manual', label: 'Manual adjustment' },
  { value: 'restock', label: 'Restock / Shipment received' },
  { value: 'sale', label: 'Sale / Customer order' },
  { value: 'return', label: 'Return / Restocked' },
  { value: 'sync', label: 'Marketplace sync correction' },
]

export default function AdjustModal({ product, onClose, onSaved }) {
  const { token } = useAuth()
  const [mode, setMode] = useState('set') // 'set' | 'delta'
  const [newStock, setNewStock] = useState(String(product.stock ?? 0))
  const [change, setChange] = useState('')
  const [reason, setReason] = useState('manual')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [busy, setBusy] = useState(false)

  const currentStock = Number(product.stock ?? 0)

  // Calculate projected new stock
  let projectedStock = currentStock
  let projectedDelta = 0
  if (mode === 'set') {
    const val = parseInt(newStock, 10)
    if (!isNaN(val)) {
      projectedStock = Math.max(0, val)
      projectedDelta = projectedStock - currentStock
    }
  } else {
    const val = parseInt(change, 10)
    if (!isNaN(val)) {
      projectedDelta = val
      projectedStock = currentStock + val
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (projectedStock < 0) {
      setError('Stock cannot be negative.')
      return
    }

    setBusy(true)
    setError('')
    setWarning('')

    try {
      const payload = {
        productId: product._id,
        reason,
      }
      if (mode === 'set') {
        const val = parseInt(newStock, 10)
        if (isNaN(val) || val < 0) {
          throw new Error('Please enter a valid non-negative number for new stock.')
        }
        payload.newStock = val
      } else {
        const val = parseInt(change, 10)
        if (isNaN(val)) {
          throw new Error('Please enter a valid integer for stock change.')
        }
        payload.change = val
      }

      const res = await api.post('/api/inventory/adjust', payload, token)
      if (res.warnings && res.warnings.length > 0) {
        setWarning(`Adjusted locally, but marketplace warning: ${res.warnings.join('; ')}`)
        setTimeout(() => {
          onSaved()
        }, 1500)
      } else {
        onSaved()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const img = Array.isArray(product.images) && product.images[0]

  return (
    <Modal title="Adjust inventory stock" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {/* Product Banner with Image */}
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/75 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {img ? (
              <img
                src={img}
                alt={product.title}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
            ) : (
              <span className="text-[10px] text-gray-400">No img</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{product.title}</h4>
            <p className="font-mono text-xs text-gray-500 dark:text-slate-400">SKU: {product.sku}</p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode('set')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              mode === 'set'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Set new quantity
          </button>
          <button
            type="button"
            onClick={() => setMode('delta')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              mode === 'delta'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Adjust by (+/-)
          </button>
        </div>

        {/* Input depending on mode */}
        {mode === 'set' ? (
          <div>
            <Input
              label="New stock quantity *"
              type="number"
              min="0"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              placeholder="e.g. 10"
              required
            />
            <p className="mt-1 text-xs text-gray-500">Directly set the total physical units available.</p>
          </div>
        ) : (
          <div>
            <Input
              label="Change (+ to add, - to subtract) *"
              type="number"
              value={change}
              onChange={(e) => setChange(e.target.value)}
              placeholder="e.g. 5 or -2"
              required
            />
            <p className="mt-1 text-xs text-gray-500">Enter positive integer to restock, or negative to deduct.</p>
          </div>
        )}

        {/* Transition Preview */}
        <div className="rounded-md border border-indigo-100 bg-indigo-50/60 p-2.5 text-xs dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between text-indigo-900 dark:text-indigo-200">
            <span>Stock Transition:</span>
            <span className="font-semibold">
              Current: <span className="font-mono">{currentStock}</span> → New:{' '}
              <span className={`font-mono ${projectedStock < 0 ? 'text-red-600 font-bold' : 'text-emerald-700 dark:text-emerald-400 font-bold'}`}>
                {projectedStock}
              </span>{' '}
              ({projectedDelta >= 0 ? `+${projectedDelta}` : projectedDelta})
            </span>
          </div>
          {projectedStock < 0 && (
            <p className="mt-1 text-red-600 font-medium">Resulting stock cannot be less than 0.</p>
          )}
        </div>

        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={REASONS}
        />

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        {warning && <p className="text-sm text-amber-600 font-medium">{warning}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || projectedStock < 0}>
            {busy ? 'Saving…' : 'Apply Adjustment'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
