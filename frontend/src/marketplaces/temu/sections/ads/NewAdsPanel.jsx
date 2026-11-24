/**
 * New Temu ads as steps: goods → daily budget & target ROAS → review (Temu says which goods can
 * advertise and its predicted ROAS, read only) → create.
 */
import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'

const BASE = '/api/temu/sections/ads'
const STEPS = [{ id: 'goods', label: 'Goods' }, { id: 'budget', label: 'Budget & ROAS' }, { id: 'review', label: 'Review' }]
const positive = (v) => String(v ?? '').trim() !== '' && Number(v) > 0

export default function NewAdsPanel({ options, onClose, onDone }) {
  const { token } = useAuth()
  const [step, setStep] = useState('goods')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [budget, setBudget] = useState('')
  const [roas, setRoas] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [check, setCheck] = useState({ key: '', loading: false, error: '', data: null })

  const label = useMemo(() => new Map(options.map((o) => [String(o.value), o.label])), [options])
  const shown = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()))
  const problems = [
    ...(!picked.size ? [{ step: 'goods', field: 'goods', message: 'Pick at least one goods.' }] : []),
    ...(picked.size > 50 ? [{ step: 'goods', field: 'goods', message: 'Pick up to 50 goods at a time.' }] : []),
    ...(!positive(budget) ? [{ step: 'budget', field: 'budget', message: 'Enter a daily budget above 0.' }] : []),
    ...(String(roas).trim() && !positive(roas) ? [{ step: 'budget', field: 'roas', message: 'A target ROAS is above 0 (or leave it empty for Temu’s suggestion).' }] : []),
  ]
  const visible = tried ? problems : []
  const ids = [...picked].sort()
  const key = ids.join(',')

  // Review: ask Temu once per set of goods (read only); a reply for an older set is dropped.
  const latest = useRef('')
  const go = async (next, force = false) => {
    setStep(next)
    if (next !== 'review' || !ids.length || ids.length > 50) return
    if (!force && check.key === key && !check.error) return
    latest.current = key
    setCheck({ key, loading: true, error: '', data: null })
    try {
      const data = await api.get(`${BASE}/eligibility${queryString({ id: key })}`, token)
      if (latest.current === key) setCheck({ key, loading: false, error: '', data })
    } catch (err) {
      if (latest.current === key) setCheck({ key, loading: false, error: err.message, data: null })
    }
  }
  const current = check.key === key ? check : { loading: false, error: '', data: null }
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const close = () => {
    if (busy) return
    if ((picked.size || budget || roas) && !window.confirm('Close without creating ads? Your choices are lost.')) return
    onClose()
  }
  const create = async () => {
    setTried(true)
    if (problems.length) { go(problems[0].step); return }
    setBusy(true)
    setSaveError('')
    try {
      onDone(await api.post(`${BASE}/create-ad`, { id: '', value: { goods: ids, budget, roas } }, token))
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const eligible = check.key === key ? check.data?.eligible || [] : []
  const refused = check.key === key ? check.data?.refused || [] : []
  const noSuggestion = !String(roas).trim() ? eligible.filter((g) => g.roas == null) : []

  return (
    <StepPanel
      title="New Temu ads"
      steps={STEPS}
      active={step}
      onStep={go}
      problemSteps={new Set(visible.map((p) => p.step))}
      onClose={close}
      actions={<>
        {saveError && <span className="text-sm text-rose-600 dark:text-rose-400">{saveError}</span>}
        <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
        <Button onClick={create} disabled={busy}>{busy ? 'Creating…' : picked.size ? `Create ${picked.size} ad${picked.size === 1 ? '' : 's'}` : 'Create ads'}</Button>
      </>}
    >
      <Step id="goods" active={step}>
        <StepProblems problems={visible} step="goods" />
        <p className="text-xs text-gray-500 dark:text-slate-400">Your goods on Temu that don't have an ad yet. Each picked goods gets its own ad.</p>
        <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or goods id" />
        <p className="text-sm text-gray-500 dark:text-slate-400">{picked.size} picked</p>
        <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border dark:divide-slate-800 dark:border-slate-700">
          {shown.map((o) => (
            <li key={o.value}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800/60">
                <input type="checkbox" checked={picked.has(String(o.value))} onChange={() => toggle(String(o.value))} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </label>
            </li>
          ))}
          {!shown.length && <li className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">No goods match.</li>}
        </ul>
      </Step>
      <Step id="budget" active={step}>
        <StepProblems problems={visible} step="budget" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Daily budget per goods (USD) *" type="number" min="0.01" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <Input label="Target ROAS (empty: Temu's suggestion)" type="number" min="0.01" step="0.01" value={roas} onChange={(e) => setRoas(e.target.value)} />
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-400">ROAS is ad sales ÷ ad spend: 3 means $3 of sales for each $1 spent. Under 1 loses money.</p>
      </Step>
      <Step id="review" active={step}>
        {problems.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Fix {problems.length} thing{problems.length === 1 ? '' : 's'} first: {problems[0].message}</p>}
        {current.loading && <Spinner />}
        {current.error && <ErrorState message={current.error} onRetry={() => go('review', true)} />}
        {current.data && (
          <div className="space-y-3 text-sm">
            <p>{eligible.length} of {ids.length} goods can advertise · {positive(budget) ? `$${Number(budget).toFixed(2)} a day each` : 'no budget yet'} · target ROAS {String(roas).trim() || 'Temu’s suggestion'}</p>
            {eligible.length > 0 && (
              <ul className="divide-y rounded-lg border dark:divide-slate-800 dark:border-slate-700">
                {eligible.map((g) => <li key={g.goodsId} className="flex justify-between gap-2 px-3 py-2"><span className="truncate">{label.get(g.goodsId) || `Goods ${g.goodsId}`}</span><span className="shrink-0 text-gray-500 dark:text-slate-400">Temu predicts ROAS {g.roas ?? '—'}</span></li>)}
              </ul>
            )}
            {noSuggestion.length > 0 && <p className="text-amber-700 dark:text-amber-300">Temu has no ROAS suggestion for {noSuggestion.length} goods: enter a target ROAS or they won't be created.</p>}
            {refused.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-semibold">Temu won't advertise these:</p>
                <ul className="list-disc pl-5">{refused.map((r) => <li key={r.goodsId}>{label.get(r.goodsId) || `Goods ${r.goodsId}`}: {r.reason}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-slate-400">Ads start spending once Temu creates them. You can change budget and ROAS later per ad.</p>
      </Step>
    </StepPanel>
  )
}
