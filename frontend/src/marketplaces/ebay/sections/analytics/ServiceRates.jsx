/**
 * eBay's "not as described" and "not received" rates per category against similar sellers:
 * one card per kind, worst first, with the problem orders behind each rate.
 */
const ORDER = ['VERY_HIGH', 'HIGH', 'AVERAGE', 'LOW', 'NOT_APPLICABLE', '']
const BADGE = {
  VERY_HIGH: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200',
  HIGH: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  AVERAGE: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200',
  LOW: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
}
const TITLES = {
  'Not as described': ['Items not as described', 'Returns and cases where the buyer says the item differs from the listing.'],
  'Not received': ['Items not received', 'Cases where the buyer says the item never arrived.'],
}

function Row({ r }) {
  const worse = ['HIGH', 'VERY_HIGH'].includes(r.ratingCode)
  const unrated = !r.ratingCode || r.ratingCode === 'NOT_APPLICABLE'
  return (
    <li className={`grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] sm:items-center ${unrated ? 'text-gray-400 dark:text-slate-500' : ''}`}>
      <span className="col-span-2 font-medium sm:col-span-1">{r.category || '—'}</span>
      <span>
        <span className="text-[11px] uppercase tracking-wide text-gray-500 sm:hidden">You </span>
        <strong className={worse ? 'text-rose-600 dark:text-rose-400' : ''}>{r.yourRate || '—'}</strong>
      </span>
      <span>
        <span className="text-[11px] uppercase tracking-wide text-gray-500 sm:hidden">Similar sellers </span>
        {r.peerRate || '—'}
      </span>
      <span className="text-gray-600 dark:text-slate-300">
        {r.problems != null && r.orders != null ? `${r.problems} of ${r.orders} orders` : r.problems != null ? `${r.problems} orders` : '—'}
      </span>
      <span className={`w-max rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.ratingCode] || 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'}`}>
        {unrated ? 'Not rated' : r.rating}
      </span>
    </li>
  )
}

export default function ServiceRates({ rows }) {
  const groups = {}
  for (const r of rows || []) (groups[r.metric] ||= []).push(r)
  const rank = (r) => ORDER.indexOf(r.ratingCode) === -1 ? ORDER.length : ORDER.indexOf(r.ratingCode)
  const names = Object.keys(groups)
  if (!names.length) return <p className="text-sm text-gray-500">No rates from eBay yet</p>
  return (
    <div className="space-y-4">
      {names.map((name) => {
        const [title, hint] = TITLES[name] || [name, '']
        const list = [...groups[name]].sort((a, b) => rank(a) - rank(b))
        return (
          <section key={name} className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-800">
            <header className="border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
              <h3 className="text-sm font-semibold">{title}</h3>
              {hint && <p className="text-xs text-gray-500 dark:text-slate-400">{hint}</p>}
            </header>
            <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] gap-x-3 px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:grid">
              <span>Category</span><span>Your rate</span><span>Similar sellers</span><span>Problem orders</span><span>eBay rating</span>
            </div>
            <ul className="divide-y divide-gray-100 text-sm dark:divide-slate-800">
              {list.map((r) => <Row key={`${r.metric}:${r.category}`} r={r} />)}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
