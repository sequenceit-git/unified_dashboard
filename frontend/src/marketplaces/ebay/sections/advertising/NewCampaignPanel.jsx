/**
 * New eBay Promoted Listings campaign as steps: listings → ad rate (empty:
 * eBay's suggested rate per listing) → name & dates → review. A General (pay when it sells) campaign,
 * created by the loader's own create action.
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'
import { newCampaignProblems } from './advertisingView'

const STEPS = [{ id: 'listings', label: 'Listings' }, { id: 'rate', label: 'Ad rate' }, { id: 'details', label: 'Name & dates' }, { id: 'review', label: 'Review' }]

export default function NewCampaignPanel({ options, onClose, onDone }) {
  const { token } = useAuth()
  const [step, setStep] = useState('listings')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [rate, setRate] = useState('')
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const problems = newCampaignProblems({ name, rate, start, end })
  const shown = tried ? problems : []
  const label = new Map(options.map((o) => [String(o.value), o.label]))
  const visible = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()))

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const close = () => {
    if (busy) return
    if ((picked.size || rate || name) && !window.confirm('Close without creating the campaign?')) return
    onClose()
  }
  const create = async () => {
    setTried(true)
    if (problems.length) { setStep(problems[0].step); return }
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/api/ebay/sections/advertising/create', { id: '', value: { name: name.trim(), rate, start, end, listings: [...picked] } }, token)
      onDone(res?.message || 'Campaign created.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepPanel
      title="New Promoted Listings campaign"
      steps={STEPS}
      active={step}
      onStep={setStep}
      problemSteps={new Set(shown.map((p) => p.step))}
      onClose={close}
      actions={<>
        {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
        <Button onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create campaign'}</Button>
      </>}
    >
      <Step id="listings" active={step}>
        <p className="text-xs text-gray-500 dark:text-slate-400">A General campaign: you pay the ad rate (a % of the sale) only when a buyer clicks the ad and buys. You can also add listings later: once the campaign exists, Add listings marks the ones eBay suggests.</p>
        <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or item id" />
        <p className="text-sm text-gray-500 dark:text-slate-400">{picked.size} picked</p>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border dark:divide-slate-800 dark:border-slate-700">
          {visible.map((o) => (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800/60">
                <input type="checkbox" checked={picked.has(String(o.value))} onChange={() => toggle(String(o.value))} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </label>
            </li>
          ))}
          {!visible.length && <li className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">{options.length ? 'No listings match.' : 'No live listings to promote.'}</li>}
        </ul>
      </Step>
      <Step id="rate" active={step}>
        <StepProblems problems={shown} step="rate" />
        <Input label="Ad rate % (2–100)" type="number" min="2" max="100" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Empty: eBay's suggested rate for each listing" />
        <p className="text-xs text-gray-500 dark:text-slate-400">Example: at 5%, a $40 sale through the ad costs $2.00. Leave it empty and eBay sets its suggested rate per listing.</p>
      </Step>
      <Step id="details" active={step}>
        <StepProblems problems={shown} step="details" />
        <Input label="Campaign name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Starts (empty: now)" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input label="Ends (empty: until you end it)" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </Step>
      <Step id="review" active={step}>
        {problems.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Fix {problems.length} thing{problems.length === 1 ? '' : 's'} first: {problems[0].message}</p>}
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-gray-500 dark:text-slate-400">Name</dt><dd>{name.trim() || '—'}</dd></div>
          <div><dt className="text-xs text-gray-500 dark:text-slate-400">Ad rate</dt><dd>{rate ? `${rate}%` : "eBay's suggested rate per listing"}</dd></div>
          <div><dt className="text-xs text-gray-500 dark:text-slate-400">Listings</dt><dd>{picked.size ? `${picked.size} listing${picked.size === 1 ? '' : 's'}` : 'None yet (add them later)'}</dd></div>
          <div><dt className="text-xs text-gray-500 dark:text-slate-400">Dates</dt><dd>{start || 'Now'} → {end || 'until you end it'}</dd></div>
        </dl>
        {picked.size > 0 && <p className="text-xs text-gray-500 dark:text-slate-400">{[...picked].slice(0, 5).map((id) => label.get(id)).join(' · ')}{picked.size > 5 ? ` and ${picked.size - 5} more` : ''}</p>}
      </Step>
    </StepPanel>
  )
}
