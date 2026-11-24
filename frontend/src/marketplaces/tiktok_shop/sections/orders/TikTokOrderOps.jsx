/**
 * TikTok-specific order operational panel inside TikTok's OrderDrawer:
 * package split eligibility & action, POD customizations, and ERP external reference linking.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import Badge from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'

export default function TikTokOrderOps({ order, onChanged }) {
  const { token } = useAuth()
  const [ops, setOps] = useState(null)
  const [refInput, setRefInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = () => {
    if (!order?.externalOrderId) return
    api.get(`/api/tiktok/sections/orders/ops${queryString({ id: order.externalOrderId })}`, token)
      .then(setOps)
      .catch(() => setOps(null))
  }

  useEffect(() => {
    setOps(null)
    setMsg('')
    setErr('')
    setRefInput('')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.externalOrderId])

  if (!order?.externalOrderId) return null

  const runAction = async (actionId, value) => {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const res = await api.post(`/api/tiktok/sections/orders/${actionId}`, { id: order.externalOrderId, ...(value !== undefined ? { value } : {}) }, token)
      setMsg(res?.message || 'Updated on TikTok Shop.')
      load()
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const canSplit = Boolean(ops?.split?.canSplit) && (order.items?.length || 0) > 1
  const canWriteRef = !['cancelled', 'refunded'].includes(order.status)

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30 p-3.5 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">TikTok fulfillment & references</h3>
        {ops?.split && (
          <div className="flex flex-wrap items-center gap-1.5">
            {ops.split.mustSplit && <Badge color="yellow">Must split</Badge>}
            {ops.split.canSplit && !ops.split.mustSplit && <Badge color="blue">Splittable</Badge>}
            {canSplit && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Split order ${order.externalOrderId} into ${order.items.length} separate TikTok packages?`)) return
                  runAction('split-order')
                }}
              >
                Split into separate packages
              </Button>
            )}
          </div>
        )}
      </div>

      {ops?.split?.reason && (
        <p className="text-amber-700 dark:text-amber-300">Split note: {ops.split.reason}</p>
      )}

      {ops?.pod?.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-200/60 dark:border-slate-800 pt-2">
          <p className="font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">POD customizations</p>
          <ul className="space-y-1">
            {ops.pod.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between gap-2 rounded bg-white dark:bg-slate-900 px-2.5 py-1.5 border border-gray-200/70 dark:border-slate-800">
                <span>{item.text || `Item ${item.lineItemId || item.skuId}`}</span>
                {item.imageUrl && (
                  <a href={item.imageUrl} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                    Preview
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5 border-t border-gray-200/60 dark:border-slate-800 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">External ERP reference</span>
          <div className="flex flex-wrap gap-1">
            {(ops?.externalRefs || []).map((ref, i) => (
              <span key={i} className="rounded bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 font-mono text-[11px] text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40">
                {ref.platform}: {ref.id}
              </span>
            ))}
          </div>
        </div>
        {canWriteRef && (
          <div className="flex gap-2">
            <input
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              placeholder={`Link external ref (e.g. ${order._id})`}
              className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !refInput.trim()}
              onClick={() => runAction('link-external', refInput.trim())}
            >
              Link reference
            </Button>
          </div>
        )}
      </div>

      {msg && <p className="text-emerald-600 dark:text-emerald-400 font-medium">{msg}</p>}
      {err && <p className="text-red-600 dark:text-red-400 font-medium">{err}</p>}
    </div>
  )
}
