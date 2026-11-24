/**
 * The goods as Temu has it: publication status (and why), every SKU with its price and stock, and
 * the seller's own SKU codes on Temu (editable: Temu checks each code before any is saved).
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../../../../../auth/AuthContext'
import { api } from '../../../../../lib/api'
import Button from '../../../../../components/ui/Button'

const fmt = (m) => (m ? new Intl.NumberFormat(undefined, { style: 'currency', currency: m.currency || 'USD' }).format(m.value) : '—')

export default function TemuDetail({ externalListingId }) {
  const { token } = useAuth()
  const goodsId = String(externalListingId || '').split(':')[0]
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [codes, setCodes] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = () => {
    setError('')
    return api.get(`/api/temu/goods/${goodsId}/temu-detail`, token)
      .then((res) => { setData(res); setCodes(Object.fromEntries(res.skus.map((s) => [s.skuId, s.sellerCode || '']))) })
      .catch((err) => setError(err.message))
  }
  useEffect(() => {
    if (/^\d+$/.test(goodsId)) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goodsId])

  if (!/^\d+$/.test(goodsId)) return null
  const changed = data ? data.skus.filter((s) => (codes[s.skuId] || '').trim() && (codes[s.skuId] || '').trim() !== (s.sellerCode || '')) : []
  const save = async () => {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await api.post(`/api/temu/goods/${goodsId}/sku-codes`, { codes: changed.map((s) => ({ skuId: s.skuId, code: codes[s.skuId].trim() })) }, token)
      setMessage(res.message)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 p-4 space-y-3 dark:border-orange-900/50 dark:bg-orange-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">On Temu</h3>
        {data && <span className="text-xs font-medium">{data.status.state}{data.status.detail ? ` · ${data.status.detail}` : ''}</span>}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {!data && !error && <p className="text-xs text-gray-500">Loading from Temu…</p>}
      {data && (
        <>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500"><th className="py-1">SKU</th><th>Spec</th><th>Price</th><th>Stock</th><th>Your SKU code</th></tr></thead>
            <tbody>
              {data.skus.map((s) => (
                <tr key={s.skuId} className="border-t border-orange-100 dark:border-orange-900/40">
                  <td className="py-1">{s.skuId}</td>
                  <td>{s.spec || '—'}</td>
                  <td>{fmt(s.price)}</td>
                  <td>{s.stock ?? '—'}</td>
                  <td><input id={`temu-code-${s.skuId}`} className="w-full rounded border px-1.5 py-0.5" value={codes[s.skuId] || ''} onChange={(e) => setCodes({ ...codes, [s.skuId]: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end">
            <Button size="sm" type="button" disabled={saving || changed.length === 0} onClick={save}>{saving ? 'Saving…' : `Save ${changed.length || ''} SKU code${changed.length === 1 ? '' : 's'} on Temu`}</Button>
          </div>
        </>
      )}
    </div>
  )
}
