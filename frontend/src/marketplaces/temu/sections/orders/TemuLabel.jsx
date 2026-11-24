/**
 * Buy a Temu shipping label for this order (Temu US: weight in lb, size in inches): Temu's
 * services with prices for the package, buy (Temu confirms before it says bought), buy again after
 * a failure, open the label (fetched through the dashboard, never stored), or book a pickup.
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { labelButtons } from './labelState'
import { openLabel as fetchLabel } from './openLabel'

const money = (a) => (a ? new Intl.NumberFormat(undefined, { style: 'currency', currency: a.currency || 'USD' }).format(a.value) : '—')

export default function TemuLabel({ orderId }) {
  const { token } = useAuth()
  const [pkg, setPkg] = useState({ weight: '', length: '', width: '', height: '' })
  const [services, setServices] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState({ text: '', error: false })
  const [window_, setWindow] = useState({ start: '', end: '' })
  const ready = ['weight', 'length', 'width', 'height'].every((k) => Number(pkg[k]) > 0)
  const say = (text, error = false) => setNote({ text, error })
  const can = labelButtons(result)

  const quote = async () => {
    setBusy('quote')
    say('')
    try {
      const res = await api.get(`/api/temu/orders/${orderId}/label-services${queryString(pkg)}`, token)
      setServices(res)
      if (res.message) say(res.message, true)
    } catch (err) {
      say(err.message, true)
    } finally {
      setBusy('')
    }
  }
  const buy = async (s) => {
    setBusy(`buy-${s.channelId}`)
    say('')
    try {
      if (!can.buy && !can.retry) return
      const path = can.retry ? 'label-retry' : 'buy-label'
      const res = await api.post(`/api/temu/orders/${orderId}/${path}`, { channelId: s.channelId, shipCompanyId: s.shipCompanyId, service: s.service, ...pkg, ...(can.retry ? { packageSn: result.packageSn } : {}) }, token)
      setResult(res)
      say(res.message || '', res.status === 'failed')
    } catch (err) {
      say(err.message, true)
    } finally {
      setBusy('')
    }
  }
  /** Asks Temu again for a label still being bought (never buys a second one). */
  const checkAgain = async () => {
    setBusy('check')
    say('')
    try {
      const res = await api.get(`/api/temu/orders/${orderId}/label-result${queryString({ packageSn: result.packageSn })}`, token)
      setResult(res)
      say(res.message || '', res.status === 'failed')
    } catch (err) {
      say(err.message, true)
    } finally {
      setBusy('')
    }
  }
  const openLabel = async () => {
    setBusy('label')
    say('')
    try {
      await fetchLabel(orderId, result.packageSn, token)
    } catch (err) {
      say(err.message, true)
    } finally {
      setBusy('')
    }
  }
  const bookPickup = async () => {
    setBusy('pickup')
    say('')
    try {
      const res = await api.post(`/api/temu/orders/${orderId}/pickup`, { packageSn: result.packageSn, start: new Date(window_.start).toISOString(), end: new Date(window_.end).toISOString() }, token)
      say(res.message)
    } catch (err) {
      say(err.message, true)
    } finally {
      setBusy('')
    }
  }
  const field = (k, label) => (
    <label className="text-xs">
      <span className="block text-gray-500">{label}</span>
      <input className="w-20 rounded border px-1 py-1 dark:bg-slate-900" type="number" step="0.1" min="0.1" value={pkg[k]} onChange={(e) => setPkg({ ...pkg, [k]: e.target.value })} />
    </label>
  )

  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-semibold text-gray-900 dark:text-slate-100">Buy a Temu label</h3>
      <div className="flex flex-wrap items-end gap-2">
        {field('weight', 'Weight (lb)')}{field('length', 'Length (in)')}{field('width', 'Width (in)')}{field('height', 'Height (in)')}
        <Button size="sm" type="button" variant="secondary" disabled={!ready || Boolean(busy)} onClick={quote}>{busy === 'quote' ? 'Asking Temu…' : 'See services'}</Button>
      </div>
      {can.check && <Button size="sm" type="button" variant="secondary" disabled={Boolean(busy)} onClick={checkAgain}>{busy === 'check' ? 'Asking Temu…' : 'Check again'}</Button>}
      {services?.services?.length > 0 && (can.buy || can.retry) && (
        <ul className="space-y-1">
          {services.services.map((s) => (
            <li key={s.channelId} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
              <span>{s.carrier} {s.service} <span className="text-xs text-gray-500">{s.estimate}</span></span>
              <span className="flex items-center gap-2">{money(s.price)}<Button size="sm" type="button" disabled={Boolean(busy)} onClick={() => buy(s)}>{busy === `buy-${s.channelId}` ? 'Buying…' : can.retry ? 'Buy again' : 'Buy'}</Button></span>
            </li>
          ))}
        </ul>
      )}
      {services?.unavailable?.length > 0 && <p className="text-xs text-gray-500">Not available: {services.unavailable.map((u) => `${u.carrier} (${u.reason})`).join(', ')}</p>}
      {note.text && <p className={`text-xs ${note.error ? 'text-rose-600' : 'text-emerald-700'}`}>{note.text}</p>}
      {can.open && (
        <div className="space-y-2">
          <Button size="sm" type="button" disabled={busy === 'label'} onClick={openLabel}>{busy === 'label' ? 'Opening…' : 'Open label'}</Button>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label><span className="block text-gray-500">Pickup from</span><input type="datetime-local" className="rounded border px-1 py-1 dark:bg-slate-900" value={window_.start} onChange={(e) => setWindow({ ...window_, start: e.target.value })} /></label>
            <label><span className="block text-gray-500">until</span><input type="datetime-local" className="rounded border px-1 py-1 dark:bg-slate-900" value={window_.end} onChange={(e) => setWindow({ ...window_, end: e.target.value })} /></label>
            <Button size="sm" type="button" variant="secondary" disabled={!window_.start || !window_.end || Boolean(busy)} onClick={bookPickup}>{busy === 'pickup' ? 'Booking…' : 'Book pickup'}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
