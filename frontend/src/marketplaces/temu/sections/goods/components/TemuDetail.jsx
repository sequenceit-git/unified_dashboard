/**
 * The goods as Temu has it: publication status (and why) and every SKU with its price and stock.
 * The SKU is Temu's own SKU id: the dashboard does not push its own SKU codes.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../../../../../auth/AuthContext'
import { api } from '../../../../../lib/api'

const fmt = (m) => (m ? new Intl.NumberFormat(undefined, { style: 'currency', currency: m.currency || 'USD' }).format(m.value) : '—')

export default function TemuDetail({ externalListingId }) {
  const { token } = useAuth()
  const goodsId = String(externalListingId || '').split(':')[0]
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    return api.get(`/api/temu/goods/${goodsId}/temu-detail`, token)
      .then(setData)
      .catch((err) => setError(err.message))
  }
  useEffect(() => {
    if (/^\d+$/.test(goodsId)) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goodsId])

  if (!/^\d+$/.test(goodsId)) return null
  return (
    <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 p-4 space-y-3 dark:border-orange-900/50 dark:bg-orange-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">On Temu</h3>
        {data && <span className={`text-xs font-medium ${data.status.listingStatus === 'error' ? 'text-rose-600' : ''}`}>{data.status.state}</span>}
      </div>
      {data?.status.detail && <p className={`text-xs ${data.status.listingStatus === 'error' ? 'text-rose-600' : 'text-gray-500'}`}>{data.status.detail}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {!data && !error && <p className="text-xs text-gray-500">Loading from Temu…</p>}
      {data && (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-gray-500"><th className="py-1">SKU</th><th>Spec</th><th>Price</th><th>Stock</th></tr></thead>
          <tbody>
            {data.skus.map((s) => (
              <tr key={s.skuId} className="border-t border-orange-100 dark:border-orange-900/40">
                <td className="py-1">{s.skuId}</td>
                <td>{s.spec || '—'}</td>
                <td>{fmt(s.price)}</td>
                <td>{s.stock ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
