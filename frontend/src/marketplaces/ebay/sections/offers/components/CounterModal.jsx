/** Counter a buyer's Best Offer: your price, their offer and your margin at the counter price. */
import { useState } from 'react'
import { useAuth } from '../../../../../auth/AuthContext'
import { api } from '../../../../../lib/api'
import Button from '../../../../../components/ui/Button'
import Modal from '../../../../../components/ui/Modal'
import { margin } from '../offersView'

const usd = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`)

export default function CounterModal({ offer, onClose, onDone }) {
  const { token } = useAuth()
  const list = offer.listPrice?.value ?? null
  const cost = offer.cost?.value ?? null
  const asked = offer.price?.value ?? null
  // Starts halfway between the offer and your price (rounded), or at the offer.
  const [price, setPrice] = useState(list != null && asked != null ? String(Math.round(((list + asked) / 2) * 100) / 100) : String(asked ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const n = Number(price)
  const valid = Number.isFinite(n) && n > 0
  const at = valid ? margin(n, cost) : null

  const send = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/api/ebay/sections/offers/offer-counter', { id: offer.id, value: n }, token)
      onDone(res?.message || 'Counter offer sent.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Counter offer" onClose={() => !busy && onClose()}>
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-semibold">{offer.title || `Item ${offer.itemId}`}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">{offer.buyer ? `${offer.buyer} · ` : ''}item {offer.itemId}{offer.quantity > 1 ? ` · ${offer.quantity} units` : ''}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-gray-50 p-2 dark:bg-slate-800"><dt className="text-xs text-gray-500 dark:text-slate-400">Your price</dt><dd className="font-semibold">{usd(list)}</dd></div>
          <div className="rounded-lg bg-gray-50 p-2 dark:bg-slate-800"><dt className="text-xs text-gray-500 dark:text-slate-400">Their offer</dt><dd className="font-semibold">{usd(asked)}</dd></div>
          <div className="rounded-lg bg-gray-50 p-2 dark:bg-slate-800"><dt className="text-xs text-gray-500 dark:text-slate-400">Your cost</dt><dd className="font-semibold">{usd(cost)}</dd></div>
        </dl>
        <label className="block">
          <span className="mb-1 block font-medium">Counter price ({offer.price?.currency || 'USD'})</span>
          <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
        </label>
        {at && <p className={at.loss ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>At this price: {at.text}</p>}
        {!at && valid && cost == null && <p className="text-xs text-gray-500 dark:text-slate-400">Add the product's cost to see your margin.</p>}
        {valid && list != null && n > list && <p className="text-amber-700 dark:text-amber-300">That's above your listing price.</p>}
        {error && <p className="text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || busy} onClick={send}>{busy ? 'Sending…' : 'Send counter'}</Button>
        </div>
      </div>
    </Modal>
  )
}
