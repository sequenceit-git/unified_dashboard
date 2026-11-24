/** TikTok's price breakdown of one order (discounts, shipping, tax, what the buyer paid), in the order drawer. */
import { useApi } from '../../../../hooks/useApi'

const fmt = (a) => (a ? new Intl.NumberFormat(undefined, { style: 'currency', currency: a.currency || 'USD' }).format(a.value) : '—')

export default function PriceDetail({ orderId }) {
  const { data, loading, error } = useApi(orderId ? `/api/tiktok/orders/${orderId}/price-detail` : null)
  return (
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-slate-100">Price breakdown (TikTok)</h3>
      {loading && <p className="mt-1 text-xs text-gray-500">Loading…</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {data && (
        <ul className="mt-1 space-y-1 text-sm">
          {data.lines.filter((l) => l.amount.value !== 0).map((l) => (
            <li key={l.label} className="flex justify-between py-0.5 border-b border-gray-50 dark:border-slate-800/60">
              <span>{l.label}</span>
              <span className={l.amount.value < 0 ? 'text-emerald-700 dark:text-emerald-400' : ''}>{fmt(l.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between pt-1 font-bold text-gray-900 dark:text-slate-100">
            <span>{data.total.label}</span>
            <span>{fmt(data.total.amount)}</span>
          </li>
        </ul>
      )}
    </div>
  )
}
