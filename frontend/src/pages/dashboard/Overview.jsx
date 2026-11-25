/**
 * Overview: what needs doing today across every shop, how sales are going against the previous
 * 30 days, and how each shop is doing — each one click from its page. Shared page: shops come
 * from the registry (labels, links, colours), never by name.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../auth/AuthContext'
import { SHOPS } from '../../marketplaces'
import Button from '../../components/ui/Button'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'
import { attentionItems, change, chartRows, greeting, shopColor, shopLink } from './overviewView'

const usd = (v, digits = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(v) || 0)
const num = (v) => (v == null ? '—' : Number(v).toLocaleString())
const CARD = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'
const MUTED = 'text-gray-500 dark:text-slate-400'

function ago(date) {
  if (!date) return 'never synced'
  const m = Math.round((Date.now() - new Date(date).getTime()) / 60000)
  if (m < 1) return 'synced just now'
  if (m < 60) return `synced ${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `synced ${h} h ago` : `synced ${Math.round(h / 24)} days ago`
}

function PartError({ name, errors }) {
  return errors?.[name] ? <p className="text-sm text-rose-600 dark:text-rose-400">Couldn't load this part: {errors[name]}</p> : null
}

function Change({ now, before }) {
  const c = change(now, before)
  if (!c) return null
  return <span className={`ml-2 text-xs font-semibold ${c.up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{c.text}</span>
}

function SalesChart({ daily, shops, errors }) {
  const [metric, setMetric] = useState('revenue')
  const rows = chartRows(daily, metric, shops)
  const empty = !rows.some((r) => r.total)
  return (
    <section className={`${CARD} min-w-0`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Sales, last 30 days</h2>
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs dark:bg-slate-800">
          {[['revenue', 'Revenue'], ['orders', 'Orders']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMetric(k)} className={`rounded-md px-3 py-1 font-medium ${metric === k ? 'bg-white shadow-sm dark:bg-slate-900' : MUTED}`}>{label}</button>
          ))}
        </div>
      </div>
      <PartError name="daily" errors={errors} />
      {daily && empty && <p className={`py-10 text-center text-sm ${MUTED}`}>No sales in the last 30 days.</p>}
      {daily && !empty && (
        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={rows} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(v) => (metric === 'revenue' ? `$${v}` : v)} />
              <Tooltip formatter={(v, name) => [metric === 'revenue' ? usd(v, 2) : v, name]} />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
              {shops.map((shop, i) => <Line key={shop.key} type="monotone" dataKey={shop.key} name={shop.label} stroke={shopColor(shop, i)} dot={false} strokeWidth={2} />)}
              {shops.length > 1 && <Line type="monotone" dataKey="total" name="All shops" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function ShopCard({ card, shop, index }) {
  const broken = card.status !== 'connected'
  const orders = shopLink(shop, 'orders')
  const analytics = shopLink(shop, 'analytics')
  return (
    <article className={`${CARD} flex flex-col gap-2`} style={{ borderTop: `3px solid ${shopColor(shop, index)}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{card.name}</h3>
          <p className={`text-xs ${MUTED}`}>{shop?.label || card.marketplace}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${broken ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>
          {card.status === 'connected' ? 'Connected' : card.status === 'error' ? 'Login problem' : 'Not connected'}
        </span>
      </div>
      <p className="text-lg font-semibold">{usd(card.revenue)} <span className={`text-sm font-normal ${MUTED}`}>· {num(card.orders)} orders</span></p>
      <p className="text-sm">{num(card.toShip)} to ship · {num(card.live)} live listings</p>
      <p className={`text-xs ${MUTED}`}>{ago(card.lastSyncAt)}</p>
      {card.authError && <p className="text-xs text-rose-600 dark:text-rose-400">{card.authError}</p>}
      <div className="mt-auto flex flex-wrap gap-3 pt-1 text-sm">
        {broken ? <Link to="/settings" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{card.status === 'error' ? 'Reconnect' : 'Connect'} →</Link> : (
          <>
            {orders && <Link to={orders} className="text-indigo-600 hover:underline dark:text-indigo-400">Orders</Link>}
            {analytics && <Link to={analytics} className="text-indigo-600 hover:underline dark:text-indigo-400">Analytics</Link>}
          </>
        )}
      </div>
    </article>
  )
}

export default function Overview() {
  const { token } = useAuth()
  const [fresh, setFresh] = useState(0)
  const { data, loading, error, refetch } = useApi(token ? `/api/dashboard/overview${fresh ? `?n=${fresh}` : ''}` : null)
  const [hour] = useState(() => new Date().getHours())
  const [today] = useState(() => new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))

  if (loading && !data) return <Spinner />
  if (error && !data) return <ErrorState message={error} onRetry={refetch} />

  const u = data?.unified || {}
  const errors = data?.errors || {}
  const byShop = data?.byShop || null
  // Shops the user can see (server-scoped cards), in registry order; the registry when cards failed.
  const visibleKeys = byShop ? new Set(byShop.map((c) => c.marketplace)) : null
  const shops = SHOPS.filter((s) => !visibleKeys || visibleKeys.has(s.key))
  const items = attentionItems(data, shops)
  const orderShop = (o) => SHOPS.find((s) => s.key === o.marketplace)

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-heading text-2xl font-bold text-gray-900 sm:text-3xl dark:text-slate-100">{greeting(hour)} <span className={`text-base font-medium ${MUTED}`}>· {today}</span></h1>
          <p className={`mt-1 text-sm ${MUTED}`}>
            {usd(u.revenue)} last 30 days
            {data?.previous && <Change now={u.revenue} before={data.previous.revenue} />}
            {' · '}{num(u.orders30)} orders · {u.connected ?? 0} of {u.marketplaces ?? SHOPS.length} shops connected
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.loadedAt && <span className={`text-xs ${MUTED}`}>updated {new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <Button variant="secondary" disabled={loading} onClick={() => setFresh(Date.now())}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
        </div>
      </header>
      {error && data && <ErrorState message={error} onRetry={refetch} />}

      {items.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">Needs attention</h2>
          <ul className="flex flex-wrap gap-2">
            {items.map((i) => (
              <li key={i.id}>
                {i.to ? (
                  <Link to={i.to} className={`inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-amber-100 dark:bg-slate-900 dark:hover:bg-slate-800 ${i.urgent ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-gray-800 dark:text-slate-200'}`}>⚠ {i.text} →</Link>
                ) : <span className="inline-flex rounded-lg bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm dark:bg-slate-900 dark:text-slate-200">⚠ {i.text}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={CARD}><p className={`text-xs uppercase tracking-wide ${MUTED}`}>Revenue · 30 days</p><p className="mt-1 text-xl font-semibold">{usd(u.revenue)}{data?.previous && <Change now={u.revenue} before={data.previous.revenue} />}</p></div>
        <div className={CARD}><p className={`text-xs uppercase tracking-wide ${MUTED}`}>Orders · 30 days</p><p className="mt-1 text-xl font-semibold">{num(u.orders30)}{data?.previous && <Change now={u.orders30} before={data.previous.orders} />}</p></div>
        <div className={CARD}><p className={`text-xs uppercase tracking-wide ${MUTED}`}>Average order <span className="normal-case">(not cancelled)</span></p><p className="mt-1 text-xl font-semibold">{data?.avgOrder == null ? '—' : usd(data.avgOrder, 2)}</p></div>
        <div className={CARD}><p className={`text-xs uppercase tracking-wide ${MUTED}`}>Buyers</p><p className="mt-1 text-xl font-semibold">{num(u.buyers)}</p></div>
      </div>

      <SalesChart daily={data?.daily} shops={shops} errors={errors} />

      <section className="space-y-2">
        <h2 className="font-semibold">Your shops</h2>
        <PartError name="byShop" errors={errors} />
        {byShop && !byShop.length && <p className={`text-sm ${MUTED}`}>No shops yet. <Link to="/settings" className="text-indigo-600 hover:underline dark:text-indigo-400">Connect a shop →</Link></p>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(byShop || []).map((card) => {
            const index = SHOPS.findIndex((s) => s.key === card.marketplace)
            return <ShopCard key={card.shopId} card={card} shop={SHOPS[index]} index={Math.max(index, 0)} />
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="mb-2 font-semibold">To ship next</h2>
          <PartError name="toShipNext" errors={errors} />
          {data?.toShipNext && !data.toShipNext.length && <p className={`text-sm ${MUTED}`}>Nothing waiting to ship.</p>}
          <ul className="divide-y dark:divide-slate-800">
            {(data?.toShipNext || []).map((o) => {
              const shop = orderShop(o)
              const to = shopLink(shop, 'orders', o.externalOrderId)
              const due = o.shipBy ? new Date(o.shipBy) : null
              const late = due && due < new Date(data.loadedAt || 0)
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-mono text-xs">{o.externalOrderId}</span>
                    <span className={`ml-2 text-xs ${MUTED}`}>{shop?.label || o.marketplace}{o.buyer ? ` · ${o.buyer}` : ''}</span>
                    <span className={`block text-xs ${late ? 'font-semibold text-rose-600 dark:text-rose-400' : MUTED}`}>
                      {due ? `${late ? 'past ship-by' : 'ship by'} ${due.toLocaleDateString()}` : o.placedAt ? `ordered ${new Date(o.placedAt).toLocaleDateString()}` : ''}
                    </span>
                  </span>
                  {to && <Link to={to} className="shrink-0 text-indigo-600 hover:underline dark:text-indigo-400">Open</Link>}
                </li>
              )
            })}
          </ul>
        </section>
        <section className={CARD}>
          <h2 className="mb-2 font-semibold">Top products, last 30 days</h2>
          <PartError name="topProducts" errors={errors} />
          {data?.topProducts && !data.topProducts.length && <p className={`text-sm ${MUTED}`}>No sales in the last 30 days.</p>}
          <ol className="divide-y dark:divide-slate-800">
            {(data?.topProducts || []).map((p, i) => (
              <li key={p.productId || `${p.title}-${i}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate"><span className={`mr-2 ${MUTED}`}>{i + 1}.</span>{p.title}</span>
                <span className="shrink-0">{usd(p.revenue)} <span className={`text-xs ${MUTED}`}>· {num(p.units)} sold</span></span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3 text-sm dark:border-slate-800">
        <span className={MUTED}>{num(u.liveListings)} live listings · {num(u.openInbox)} open messages · {num(u.lowStock)} low stock · {num(u.readyToShip)} ready to ship</span>
        <Link to="/market-research" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">✦ Product Discovery →</Link>
      </footer>
    </div>
  )
}
