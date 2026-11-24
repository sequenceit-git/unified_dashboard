/** After the sale on Temu: each package's tracking, the buyer's customisation, and Temu's out-of-stock cancellation results. */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { useApi } from '../../../../hooks/useApi'
import { api } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { openLabel } from './openLabel'

/** Serial number / IMEI Temu asks for on some items before shipping. */
function Verification({ orderId, items }) {
  const { token } = useAuth()
  const [orderSn, setOrderSn] = useState(items[0]?.orderSn || '')
  const [serial, setSerial] = useState('')
  const [imei, setImei] = useState('')
  const [note, setNote] = useState({ text: '', error: false })
  const send = async () => {
    try {
      const r = await api.post(`/api/temu/orders/${orderId}/verification`, { items: [{ orderSn, serialNumber: serial, imeiNumbers: imei.split(/[\s,]+/) }] }, token)
      setNote({ text: r.message, error: false })
    } catch (err) {
      setNote({ text: err.message, error: true })
    }
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold">Send serial number / IMEI to Temu</summary>
      <div className="mt-2 space-y-2">
        <select className="w-full rounded border px-2 py-1 dark:bg-slate-900" value={orderSn} onChange={(e) => setOrderSn(e.target.value)}>
          {items.map((i) => <option key={i.orderSn} value={i.orderSn}>{i.item || i.orderSn}</option>)}
        </select>
        <input className="w-full rounded border px-2 py-1 dark:bg-slate-900" placeholder="Serial number" value={serial} onChange={(e) => setSerial(e.target.value)} />
        <input className="w-full rounded border px-2 py-1 dark:bg-slate-900" placeholder="IMEI (several: comma separated)" value={imei} onChange={(e) => setImei(e.target.value)} />
        {note.text && <p className={note.error ? 'text-rose-600' : 'text-emerald-700'}>{note.text}</p>}
        <Button size="sm" type="button" disabled={!orderSn || !(serial.trim() || imei.trim())} onClick={send}>Send</Button>
      </div>
    </details>
  )
}

export default function TemuFollowUp({ orderId }) {
  const { token } = useAuth()
  const [labelError, setLabelError] = useState('')
  const { data, loading, error } = useApi(orderId ? `/api/temu/orders/${orderId}/temu-follow-up` : null)
  if (loading && !data) return <p className="text-xs text-gray-500">Loading tracking…</p>
  if (error) return <p className="text-xs text-rose-600">{error}</p>
  if (!data) return null
  return (
    <div className="space-y-3 text-sm">
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-slate-100">Tracking on Temu</h3>
        {labelError && <p className="text-xs text-rose-600">{labelError}</p>}
        {data.packages.length ? data.packages.map((p) => (
          <div key={p.packageSn} className="mt-1">
            <p className="flex items-center gap-2 text-xs text-gray-600">{p.carrier} {p.trackingNumber} · package {p.packageSn}
              <Button size="sm" type="button" variant="secondary" onClick={() => { setLabelError(''); openLabel(orderId, p.packageSn, token).catch((err) => setLabelError(err.message)) }}>Open label</Button>
            </p>
            <ul className="ml-2 border-l pl-2 text-xs">
              {p.events.length ? p.events.map((e, i) => <li key={i}>{e.time ? `${new Date(e.time).toLocaleString()} · ` : ''}{e.status}</li>) : <li className="text-gray-500">No tracking events yet.</li>}
            </ul>
          </div>
        )) : <p className="text-xs text-gray-500">Not shipped yet.</p>}
      </div>
      {data.customizations.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">Buyer's customisation</h3>
          {data.customizations.map((c) => (
            <div key={c.orderSn} className="mt-1">
              <p><span className="text-gray-500">{c.item || c.orderSn}:</span> {c.text}</p>
              <div className="flex gap-2">{c.images.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Customisation preview" className="h-16 rounded border" /></a>)}</div>
            </div>
          ))}
        </div>
      )}
      {data.items?.length > 0 && <Verification orderId={orderId} items={data.items} />}
      {data.cancellations.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">Out-of-stock cancellations</h3>
          <ul className="text-xs">{data.cancellations.map((c) => <li key={c.orderSn}>{c.item || c.orderSn}: {c.status}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
