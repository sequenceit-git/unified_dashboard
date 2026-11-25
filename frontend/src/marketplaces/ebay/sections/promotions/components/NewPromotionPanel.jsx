/**
 * New eBay promotion as steps: discount → listings (search your live listings, or the whole store)
 * → dates → review. It creates the same sale event as before (a percentage off listings).
 */
import { useState } from 'react'
import { useAuth } from '../../../../../auth/AuthContext'
import { api, queryString } from '../../../../../lib/api'
import { useApi } from '../../../../../hooks/useApi'
import Button from '../../../../../components/ui/Button'
import { Input } from '../../../../../components/ui/Input'
import { Spinner } from '../../../../../components/ui/Feedback'
import StepPanel, { Step } from '../../../ui/StepPanel'
import StepProblems from '../../../ui/StepProblems'
import { newPromotionProblems } from '../promotionsView'

const STEPS = [{ id: 'discount', label: 'Discount' }, { id: 'listings', label: 'Listings' }, { id: 'dates', label: 'Dates' }, { id: 'review', label: 'Review' }]
const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const itemId = (row) => String(row.shopListing?.externalListingId || '').replace(/^(ebay-)?item-/, '')

export default function NewPromotionPanel({ onClose, onDone }) {
  const { token } = useAuth()
  const [step, setStep] = useState('discount')
  const [name, setName] = useState('')
  const [discount, setDiscount] = useState('10')
  const [wholeStore, setWholeStore] = useState(false)
  const [picked, setPicked] = useState(() => new Map())
  const [q, setQ] = useState('')
  const [start, setStart] = useState(() => local(new Date(Date.now() + 5 * 60000)))
  const [end, setEnd] = useState(() => local(new Date(Date.now() + 14 * 86400000)))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const live = useApi(`/api/ebay/listings${queryString({ listing: 'live', q: q.trim() || undefined, limit: 50 })}`)
  const rows = (live.data?.data || []).filter((r) => itemId(r))
  const listingIds = [...picked.keys()]
  const problems = newPromotionProblems({ discount, wholeStore, listingIds, start, end })
  const shown = tried ? problems : []
  const changed = name || discount !== '10' || wholeStore || picked.size

  const toggle = (row) => setPicked((m) => { const n = new Map(m); const id = itemId(row); if (n.has(id)) n.delete(id); else n.set(id, row.title || id); return n })
  const close = () => {
    if (busy) return
    if (changed && !window.confirm('Close without creating the promotion?')) return
    onClose()
  }
  const create = async () => {
    setTried(true)
    if (problems.length) { setStep(problems[0].step); return }
    setBusy(true)
    setError('')
    try {
      await api.post('/api/ebay/sections/promotions/create', {
        name: name.trim() || `Sale ${new Date().toLocaleDateString()}`,
        description: 'Special Store Discount',
        percentageOff: Number(discount),
        listingIds: wholeStore ? [] : listingIds,
        startDate: new Date(start).toISOString(),
        endDate: new Date(end).toISOString(),
      }, token)
      onDone('Promotion created. eBay may take a moment to show it.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepPanel
      title="New eBay promotion"
      steps={STEPS}
      active={step}
      onStep={setStep}
      problemSteps={new Set(shown.map((p) => p.step))}
      onClose={close}
      actions={<>
        {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
        <Button onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create promotion'}</Button>
      </>}
    >
      <Step id="discount" active={step}>
        <StepProblems problems={shown} step="discount" />
        <p className="text-xs text-gray-500 dark:text-slate-400">A sale event: a percentage off the listings you choose. eBay's other promotion types (order discounts, coupons) are made in Seller Hub.</p>
        <Input label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer clearance" />
        <div>
          <span className="mb-1 block text-sm font-medium">Discount (% off)</span>
          <div className="mb-2 flex flex-wrap gap-2">
            {['10', '15', '20', '25', '30'].map((p) => (
              <button key={p} type="button" onClick={() => setDiscount(p)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${discount === p ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-gray-200 dark:border-slate-700'}`}>{p}% off</button>
            ))}
          </div>
          <Input type="number" min="5" max="80" step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} aria-label="Discount percent" />
        </div>
      </Step>
      <Step id="listings" active={step}>
        <StepProblems problems={shown} step="listings" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wholeStore} onChange={(e) => setWholeStore(e.target.checked)} /> The whole store (all live listings, up to 500)</label>
        {!wholeStore && (
          <>
            <Input label="Search your live listings" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or SKU" />
            <p className="text-sm text-gray-500 dark:text-slate-400">{picked.size} picked</p>
            {live.loading && <Spinner />}
            <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border dark:divide-slate-800 dark:border-slate-700">
              {rows.map((r) => (
                <li key={itemId(r)}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800/60">
                    <input type="checkbox" checked={picked.has(itemId(r))} onChange={() => toggle(r)} />
                    <span className="min-w-0 flex-1"><span className="block truncate">{r.title}</span><span className="text-xs text-gray-500 dark:text-slate-400">Item {itemId(r)}{r.sku ? ` · ${r.sku}` : ''}</span></span>
                  </label>
                </li>
              ))}
              {!live.loading && !rows.length && <li className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">No live listings match.</li>}
            </ul>
          </>
        )}
      </Step>
      <Step id="dates" active={step}>
        <StepProblems problems={shown} step="dates" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Starts" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Ends" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </Step>
      <Step id="review" active={step}>
        {problems.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Fix {problems.length} thing{problems.length === 1 ? '' : 's'} first: {problems[0].message}</p>}
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-gray-500 dark:text-slate-400">Name</dt><dd>{name.trim() || 'Sale (dated automatically)'}</dd></div>
          <div><dt className="text-xs text-gray-500 dark:text-slate-400">Discount</dt><dd>{discount}% off</dd></div>
          <div><dt className="text-xs text-gray-500 dark:text-slate-400">Listings</dt><dd>{wholeStore ? 'The whole store' : `${picked.size} listing${picked.size === 1 ? '' : 's'}`}</dd></div>
          <div><dt className="text-xs text-gray-500 dark:text-slate-400">Dates</dt><dd>{start ? new Date(start).toLocaleString() : '—'} → {end ? new Date(end).toLocaleString() : '—'}</dd></div>
        </dl>
        {!wholeStore && picked.size > 0 && <p className="text-xs text-gray-500 dark:text-slate-400">{[...picked.values()].slice(0, 5).join(' · ')}{picked.size > 5 ? ` and ${picked.size - 5} more` : ''}</p>}
      </Step>
    </StepPanel>
  )
}
