/** Send a discount offer to buyers of a listing (eBay Best offers section). */
import { useState } from 'react'
import { api } from '../../../../../lib/api'
import Button from '../../../../../components/ui/Button'
import Modal from '../../../../../components/ui/Modal'

export default function OfferModal({ item, onClose, onSuccess, token,  }) {
  const [discount, setDiscount] = useState('10')
  const [message, setMessage] = useState('Thanks for watching! Here is a special discount offer on this item.')
  const [allowCounter, setAllowCounter] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const handleSend = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.post('/api/ebay/sections/offers/send', {
        listingId: item.listingId,
        discountPercentage: Number(discount) || 10,
        message,
        allowCounterOffer: allowCounter,
      }, token)
      onSuccess?.()
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Send Offer to Interested Buyers" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 p-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title || item.listingId}</p>
          <p className="text-xs text-gray-500 mt-0.5">Item ID: {item.listingId} {item.sku && `• SKU: ${item.sku}`}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
            Discount Percentage (% off)
          </label>
          <div className="flex gap-2 mb-2">
            {['5', '10', '15', '20'].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setDiscount(pct)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                  discount === pct
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {pct}% OFF
              </button>
            ))}
          </div>
          <input
            type="number"
            min="5"
            max="80"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">eBay requires a minimum discount of 5%.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
            Custom Message (optional)
          </label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={250}
            placeholder="Special offer for you..."
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={allowCounter}
            onChange={(e) => setAllowCounter(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>Allow buyers to submit counter-offers</span>
        </label>

        {err && <p className="text-sm text-red-600 dark:text-red-400 font-medium">{err}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !discount} onClick={handleSend}>
            {busy ? 'Sending…' : 'Send offer to buyers'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
