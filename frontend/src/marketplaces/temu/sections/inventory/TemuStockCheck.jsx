/**
 * On the Stock tab: a warning only when Temu's stock (read live) differs from the dashboard's,
 * with "Use dashboard stock" per SKU to send the dashboard's number to Temu. Stock syncs both
 * ways, so normally this shows nothing.
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { useApi } from '../../../../hooks/useApi'
import { api } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { stockCheck } from './stockCheck'

export default function TemuStockCheck() {
  const { token } = useAuth()
  const { data, refetch } = useApi('/api/temu/inventory/temu-stock')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState({ text: '', error: false })
  const check = stockCheck(data)
  if (!check.show && !note.text) return null

  const fix = async (r) => {
    setBusy(r.skuId)
    setNote({ text: '', error: false })
    try {
      const res = await api.post('/api/temu/inventory/temu-stock/fix', { goodsId: r.goodsId, skuId: r.skuId }, token)
      setNote({ text: res.message, error: false })
      refetch()
    } catch (err) {
      setNote({ text: err.message, error: true })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {check.differ.length > 0 && `${check.differ.length} SKU${check.differ.length === 1 ? '' : 's'} differ on Temu. `}
          {check.onlyOnTemu > 0 && `${check.onlyOnTemu} Temu SKU${check.onlyOnTemu === 1 ? ' is' : 's are'} not linked to a dashboard product.`}
        </span>
        {check.differ.length > 0 && <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button>}
      </div>
      {note.text && <p className={`mt-1 text-xs ${note.error ? 'text-rose-700' : 'text-emerald-700'}`}>{note.text}</p>}
      {open && (
        <ul className="mt-2 space-y-1">
          {check.differ.map((r) => (
            <li key={`${r.goodsId}:${r.skuId}`} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white/60 px-2 py-1 dark:bg-slate-900/40">
              <span>{r.product || r.sku} <span className="text-xs text-gray-500">({r.sku})</span>: Temu {r.temuStock}{r.preSale ? ` + ${r.preSale} pre-sale` : ''}, dashboard {r.dashboardStock}</span>
              <Button size="sm" disabled={Boolean(busy)} onClick={() => fix(r)}>{busy === r.skuId ? 'Sending…' : 'Use dashboard stock'}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
