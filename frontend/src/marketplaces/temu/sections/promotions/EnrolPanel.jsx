/**
 * Enrol goods in a Temu promotion: pick goods → activity quantity and price per SKU (starting
 * from Temu's recommendation) → confirm. Prices may not go above Temu's recommended price.
 */
import { useMemo, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import { useApi } from '../../../../hooks/useApi'
import Button from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { EmptyState, ErrorState, Spinner } from '../../../../components/ui/Feedback'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'
import { bigCuts, enrolItems, enrolProblems, shownPrice, startEdits } from './enrolView'

const BASE = '/api/temu/sections/promotions'
const STEPS = [{ id: 'pick', label: 'Pick goods' }, { id: 'prices', label: 'Quantity & prices' }, { id: 'confirm', label: 'Confirm' }]
const usd = (v) => (v == null ? 'no price' : `$${Number(v).toFixed(2)}`)

export default function EnrolPanel({ activity, onClose, onDone }) {
  const { token } = useAuth()
  const { data, loading, error, refetch } = useApi(`${BASE}/candidates${queryString({ id: activity.id })}`)
  const goods = useMemo(() => data?.goods || [], [data])
  const [chosenIds, setPicked] = useState(() => new Set())
  const [edited, setEdited] = useState({})
  const [step, setStep] = useState('pick')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  // Only goods still in Temu's list count as picked.
  const picked = useMemo(() => new Set(goods.map((g) => g.goodsId).filter((id) => chosenIds.has(id))), [goods, chosenIds])
  const edits = useMemo(() => ({ ...startEdits(goods), ...edited }), [goods, edited])
  const problems = enrolProblems(goods, picked, edits)
  const shown = tried ? problems : []
  const cuts = bigCuts(goods, picked, edits)

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const change = (goodsId, patch) => setEdited((e) => ({ ...e, [goodsId]: { ...edits[goodsId], ...patch, prices: { ...edits[goodsId].prices, ...(patch.prices || {}) } } }))
  const submit = async () => {
    setTried(true)
    if (problems.length) { setStep(problems[0].step); return }
    setBusy(true)
    setSaveError('')
    try {
      const res = await api.post(`${BASE}/enrol`, { id: activity.id, value: enrolItems(goods, picked, edits) }, token)
      onDone(res)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const chosen = goods.filter((g) => picked.has(g.goodsId))
  // Not while submitting; ask before throwing away picks or changes.
  const close = () => {
    if (busy) return
    if ((picked.size || Object.keys(edited).length) && !window.confirm('Close without enrolling? Your picks and changes are lost.')) return
    onClose()
  }

  return (
    <StepPanel
      title={`Enrol goods · ${activity.name || `Activity ${activity.id}`}`}
      steps={STEPS}
      active={step}
      onStep={setStep}
      problemSteps={new Set(shown.map((p) => p.step))}
      onClose={close}
      actions={<>
        {saveError && <span className="text-sm text-rose-600 dark:text-rose-400">{saveError}</span>}
        <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy || loading || !goods.length}>{busy ? 'Submitting…' : `Enrol ${picked.size || ''} goods`.replace('  ', ' ')}</Button>
      </>}
    >
      <Step id="pick" active={step}>
        <StepProblems problems={shown} step="pick" />
        {loading && <Spinner />}
        {error && <ErrorState message={error} onRetry={refetch} />}
        {data && !goods.length && <EmptyState message="Temu allows none of your goods in this promotion right now." />}
        {goods.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-slate-400">{goods.length} goods Temu allows · {picked.size} picked</span>
              <Button size="sm" variant="secondary" onClick={() => setPicked(picked.size === goods.length ? new Set() : new Set(goods.map((g) => g.goodsId)))}>{picked.size === goods.length ? 'Clear' : 'Pick all'}</Button>
            </div>
            <ul className="divide-y rounded-lg border dark:divide-slate-800 dark:border-slate-700">
              {goods.map((g) => (
                <li key={g.goodsId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/60">
                    <input type="checkbox" checked={picked.has(g.goodsId)} onChange={() => toggle(g.goodsId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{g.title || `Goods ${g.goodsId}`}</span>
                      <span className="text-xs text-gray-500 dark:text-slate-400">Goods {g.goodsId} · {g.skus.length} SKU{g.skus.length === 1 ? '' : 's'} · Temu suggests {g.quantity ?? '—'} units</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Step>
      <Step id="prices" active={step}>
        <StepProblems problems={shown} step="prices" />
        {!chosen.length && <p className="text-sm text-gray-500 dark:text-slate-400">Pick goods first.</p>}
        {chosen.length > 0 && <p className="text-xs text-gray-500 dark:text-slate-400">Filled in with Temu's recommendation. You can lower a price or change the quantity; a price can't go above Temu's recommended activity price. A SKU without a Temu price keeps Temu's own.</p>}
        {chosen.map((g) => (
          <div key={g.goodsId} className="space-y-2 rounded-lg border p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h4 className="font-semibold">{g.title || `Goods ${g.goodsId}`}</h4>
              <div className="w-40"><Input label="Activity quantity" type="number" min="1" step="1" value={edits[g.goodsId].quantity} onChange={(e) => change(g.goodsId, { quantity: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.skus.map((s) => (s.price == null
                ? <p key={s.skuId} className="self-end text-xs text-gray-500 dark:text-slate-400">SKU {s.skuId}: Temu gave no price; Temu's own is used.</p>
                : <Input key={s.skuId} label={`SKU ${s.skuId} · Temu ${usd(s.price)}`} type="number" min="0.01" step="0.01" max={Number(s.price).toFixed(2)} value={edits[g.goodsId].prices[s.skuId]} onChange={(e) => change(g.goodsId, { prices: { [s.skuId]: e.target.value } })} />))}
            </div>
          </div>
        ))}
      </Step>
      <Step id="confirm" active={step}>
        {problems.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Fix {problems.length} thing{problems.length === 1 ? '' : 's'} first: {problems[0].message}</p>}
        {cuts.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">Check these before enrolling:</p>
            <ul className="list-disc pl-5">{cuts.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        <ul className="divide-y rounded-lg border text-sm dark:divide-slate-800 dark:border-slate-700">
          {chosen.map((g) => (
            <li key={g.goodsId} className="px-3 py-2">
              <span className="font-medium">{g.title || `Goods ${g.goodsId}`}</span>
              <span className="block text-xs text-gray-500 dark:text-slate-400">{edits[g.goodsId].quantity} units · {g.skus.map((s) => (s.price == null ? `SKU ${s.skuId} Temu's price` : `SKU ${s.skuId} $${shownPrice(edits[g.goodsId].prices[s.skuId]) || '—'}`)).join(' · ')}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500 dark:text-slate-400">Temu reviews each enrolment; the result shows on the page after you submit.</p>
      </Step>
    </StepPanel>
  )
}
