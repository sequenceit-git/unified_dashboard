/**
 * A warning only when TikTok's stock (read live) differs from the dashboard's, with
 * "Use dashboard stock" per SKU to send the dashboard's number to TikTok. Stock syncs both ways,
 * so normally this shows nothing — it replaces the old separate "TikTok stock" tab.
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { useApi } from '../../../../hooks/useApi'
import { api } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { stockCheck } from './inventoryView'

export default function TikTokStockCheck() {
  const { token } = useAuth()
  const { data, refetch } = useApi('/api/tiktok/inventory/tiktok-stock')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState({ text: '', error: false })
  const check = stockCheck(data)
  if (!check.show && !note.text) return null

  const fix = async (r) => {
    setBusy(r.tiktokSkuId)
    setNote({ text: '', error: false })
    try {
      const res = await api.post('/api/tiktok/inventory/tiktok-stock/fix', { productId: r.productId, skuId: r.tiktokSkuId }, token)
      setNote({ text: res.message, error: false })
      refetch()
    } catch (err) {
      setNote({ text: err.message, error: true })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {check.differ.length > 0 && `${check.differ.length} SKU${check.differ.length === 1 ? '' : 's'} differ on TikTok. `}
          {check.notLinked > 0 && `${check.notLinked} TikTok SKU${check.notLinked === 1 ? ' is' : 's are'} not linked to a dashboard product.`}
        </span>
        {check.differ.length > 0 && <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button>}
      </div>
      {note.text && <p className={`mt-1 text-xs ${note.error ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{note.text}</p>}
      {open && (
        <ul className="mt-2 space-y-1">
          {check.differ.map((r) => (
            <li key={`${r.productId}:${r.tiktokSkuId}`} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white/60 px-2 py-1 dark:bg-slate-900/40">
              <span>
                {r.product || r.sku} <span className="text-xs text-gray-500">({r.sku})</span>: TikTok {r.tiktokTotal}, dashboard {r.dashboardStock}
                {r.warehouses.length > 1 && <span className="text-xs text-gray-500"> · {r.warehouses.map((w) => `${w.name}: ${w.available}`).join(', ')}</span>}
              </span>
              <Button size="sm" disabled={Boolean(busy)} onClick={() => fix(r)}>{busy === r.tiktokSkuId ? 'Sending…' : 'Use dashboard stock'}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
