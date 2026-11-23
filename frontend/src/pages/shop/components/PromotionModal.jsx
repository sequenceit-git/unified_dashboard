/** Create a promotion; wording and limits come from the shop (src/marketplaces/<key>/index.js → promotions.form). */
import { useState } from 'react'
import { getShop } from '../../../marketplaces'
import { api } from '../../../lib/api'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'

export default function PromotionModal({ onClose, onSuccess, token, marketplace }) {
  // Shop-specific promotion rules and wording (src/marketplaces/<key>/index.js).
  const form = getShop(marketplace)?.promotions?.form || {}
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discount, setDiscount] = useState('10')
  const [durationDays, setDurationDays] = useState('14')
  const [listingIds, setListingIds] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const handleCreate = async () => {
    setBusy(true)
    setErr('')
    try {
      const days = parseInt(durationDays, 10) || 14
      const startDate = new Date(Date.now() + 60000).toISOString()
      const endDate = new Date(Date.now() + days * 86400000).toISOString()
      const ids = listingIds ? listingIds.split(',').map((s) => s.trim()).filter(Boolean) : []
      await api.post('/api/shops/sections/promotions/create', {
        marketplace,
        name: name || `Sale ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        description: description || 'Special Store Discount',
        percentageOff: Number(discount) || 10,
        listingIds: ids,
        startDate,
        endDate,
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
    <Modal title="Create Store Promotion" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
            Promotion Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer Clearance Sale"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
              Discount (% OFF)
            </label>
            <input
              type="number"
              min={form.minPercent || '1'}
              max="80"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
              Duration
            </label>
            <select
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
              <option value="30">30 Days</option>
              <option value="60">60 Days</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
            {form.idsLabel || 'Eligible Listing IDs (optional)'}
          </label>
          <input
            value={listingIds}
            onChange={(e) => setListingIds(e.target.value)}
            placeholder={form.idsPlaceholder || 'Leave blank for entire inventory, or comma-separated item IDs'}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            {form.idsHint || 'Specify item IDs to limit the sale to specific products.'}
          </p>
        </div>

        {err && <p className="text-sm text-red-600 dark:text-red-400 font-medium">{err}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !discount} onClick={handleCreate}>
            {busy ? 'Creating…' : 'Launch promotion'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
