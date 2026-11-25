/**
 * Overview: cross-shop command center grounded in stored database data across connected shops.
 * Shared page: shops come from the registry (`src/marketplaces/index.js`), never by name.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { SHOPS } from '../../marketplaces'
import Button from '../../components/ui/Button'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'
import { Change, PartError, QueuesSection, SalesSection, ShopCard } from './OverviewPanels'
import { CARD, MUTED, attentionItems, greeting, num, usd } from './overviewView'

export default function Overview() {
  const { token } = useAuth()
  const [fresh, setFresh] = useState(0)
  const { data, loading, error, refetch } = useApi(token ? `/api/dashboard/overview${fresh ? `?n=${fresh}` : ''}` : null)
  const [hour] = useState(() => new Date().getHours())
  const [today] = useState(() => new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))

  if (loading && !data) return <Spinner />
  if (error && !data) return <ErrorState message={error} onRetry={refetch} />

  const u = data?.unified || {}
  const prev = data?.previous
  const a = data?.attention
  const errors = data?.errors || {}
  const byShop = data?.byShop || null
  // Shops the user can see (server-scoped cards), in registry order; full registry if cards failed.
  const visibleKeys = byShop ? new Set(byShop.map((c) => c.marketplace)) : null
  const shops = SHOPS.filter((s) => !visibleKeys || visibleKeys.has(s.key))
  const items = attentionItems(data, shops)
  const soldOrders30 = u.soldOrders30 ?? data?.soldOrders30
  const cancelled30 = soldOrders30 != null && u.orders30 != null ? Math.max(0, u.orders30 - soldOrders30) : 0
  const hasPartError = Object.keys(errors).length > 0

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-heading text-2xl font-bold text-gray-900 sm:text-3xl dark:text-slate-100">
            {greeting(hour)} <span className={`text-base font-medium ${MUTED}`}>· {today}</span>
          </h1>
          <p className={`mt-1 text-sm ${MUTED}`}>
            {usd(u.revenue)} last 30 days
            {prev && <Change now={u.revenue} before={prev.revenue} />}
            {' · '}{num(u.orders30)} orders · {u.connected ?? 0} of {u.marketplaces ?? SHOPS.length} shops connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.loadedAt && <span className={`text-xs ${MUTED}`}>updated {new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <Button variant="secondary" disabled={loading} onClick={() => setFresh(Date.now())}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
        </div>
      </header>
      {error && data && <ErrorState message={error} onRetry={refetch} />}

      {items.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">Needs attention</h2>
          <ul className="flex flex-wrap gap-2">
            {items.map((i) => (
              <li key={i.id}>
                {i.to ? (
                  <Link to={i.to} className={`inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-amber-100 dark:bg-slate-900 dark:hover:bg-slate-800 ${i.urgent ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-gray-800 dark:text-slate-200'}`}>
                    ⚠ {i.text} →
                  </Link>
                ) : (
                  <span className="inline-flex rounded-lg bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm dark:bg-slate-900 dark:text-slate-200">⚠ {i.text}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : a && !hasPartError && (
        <section className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>All clear across connected shops — no pending shipments, unread buyer messages, or login issues.</span>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <div className={CARD}>
          <p className={`text-xs uppercase tracking-wide ${MUTED}`}>Revenue · 30 days</p>
          <p className="mt-1 text-xl font-bold">{usd(u.revenue)}{prev && <Change now={u.revenue} before={prev.revenue} />}</p>
          <p className={`mt-1 text-xs ${MUTED}`}>{prev ? `prev 30d: ${usd(prev.revenue)}` : 'paid & active orders'}</p>
        </div>
        <div className={CARD}>
          <p className={`text-xs uppercase tracking-wide ${MUTED}`}>Orders · 30 days</p>
          <p className="mt-1 text-xl font-bold">{num(u.orders30)}{prev && <Change now={u.orders30} before={prev.orders} />}</p>
          <p className={`mt-1 text-xs ${MUTED}`}>
            {soldOrders30 != null ? `${num(soldOrders30)} active${cancelled30 > 0 ? ` · ${num(cancelled30)} cancelled` : ''}` : 'all statuses'}
          </p>
        </div>
        <div className={CARD}>
          <p className={`text-xs uppercase tracking-wide ${MUTED}`}>Average order</p>
          <p className="mt-1 text-xl font-bold">
            {data?.avgOrder == null ? '—' : usd(data.avgOrder, 2)}
            {prev && <Change now={data?.avgOrder} before={prev.avgOrder} />}
          </p>
          <p className={`mt-1 text-xs ${MUTED}`}>non-cancelled orders</p>
        </div>
        <div className={CARD}>
          <p className={`text-xs uppercase tracking-wide ${MUTED}`}>Fulfillment queue</p>
          <p className="mt-1 text-xl font-bold">{num(u.readyToShip)} <span className={`text-sm font-normal ${MUTED}`}>to ship</span></p>
          <p className={`mt-1 text-xs ${a?.late ? 'font-medium text-rose-600 dark:text-rose-400' : MUTED}`}>
            {num(a?.late ?? 0)} past ship-by · {num(a?.openReturns ?? 0)} returns
          </p>
        </div>
        <div className={CARD}>
          <p className={`text-xs uppercase tracking-wide ${MUTED}`}>Catalog &amp; inbox</p>
          <p className="mt-1 text-xl font-bold">{num(u.liveListings)} <span className={`text-sm font-normal ${MUTED}`}>live</span></p>
          <p className={`mt-1 text-xs ${MUTED}`}>{num(u.openInbox)} unread buyers · {num(u.buyers)} buyers</p>
        </div>
      </div>

      <SalesSection daily={data?.daily} byShop={byShop} shops={shops} errors={errors} />

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Your shops</h2>
          <Link to="/settings" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Manage connections →</Link>
        </div>
        <PartError name="byShop" errors={errors} />
        {byShop && !byShop.length && <p className={`text-sm ${MUTED}`}>No shops yet. <Link to="/settings" className="text-indigo-600 hover:underline dark:text-indigo-400">Connect a shop →</Link></p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(byShop || []).map((card) => {
            const index = SHOPS.findIndex((s) => s.key === card.marketplace)
            return <ShopCard key={card.shopId} card={card} shop={SHOPS[index]} index={Math.max(index, 0)} />
          })}
        </div>
      </section>

      <QueuesSection data={data} shops={shops} errors={errors} />

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200/70 bg-indigo-50/50 px-4 py-3 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/20">
        <div>
          <p className="font-semibold text-gray-900 dark:text-slate-100">Product Discovery</p>
          <p className={`text-xs ${MUTED}`}>Find winning products and import ready-to-list drafts into any shop.</p>
        </div>
        <Link to="/market-research" className="rounded-lg bg-indigo-600 px-3.5 py-2 font-semibold text-white hover:bg-indigo-700">✦ Open Product Discovery →</Link>
      </footer>
    </div>
  )
}
