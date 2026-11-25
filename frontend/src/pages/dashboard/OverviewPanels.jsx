/**
 * Overview UI sections: Sales chart + shop revenue mix, per-shop command cards, and operational queues.
 * Shared code: consumes only registry metadata from `src/marketplaces/index.js`, never naming shops.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CARD, MUTED, ago, change, chartRows, num, sectionLabel, shopColor, shopLink, shopShare, usd } from './overviewView'

export function PartError({ name, errors }) {
  return errors?.[name] ? <p className="text-sm text-rose-600 dark:text-rose-400">Couldn&apos;t load this part: {errors[name]}</p> : null
}

export function Change({ now, before }) {
  const c = change(now, before)
  if (!c) return null
  return <span className={`ml-2 text-xs font-semibold ${c.up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{c.text}</span>
}

function ShopPill({ shop, marketplace, index = 0 }) {
  const color = shopColor(shop, index)
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-slate-800 dark:text-slate-300">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {shop?.label || marketplace}
    </span>
  )
}

function StatTile({ to, label, value, tone = '' }) {
  const inner = (
    <div className="rounded-lg bg-gray-50 p-2.5 transition-colors hover:bg-gray-100 dark:bg-slate-800/70 dark:hover:bg-slate-800">
      <p className={`text-[11px] font-medium uppercase tracking-wide ${MUTED}`}>{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

export function SalesSection({ daily, byShop, shops, errors }) {
  const [metric, setMetric] = useState('revenue')
  const rows = chartRows(daily, metric, shops)
  const empty = !rows.some((r) => r.total)
  const mix = shopShare(byShop, shops)

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <section className={`${CARD} min-w-0 lg:col-span-2`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Sales trend · last 30 days</h2>
            <p className={`text-xs ${MUTED}`}>Non-cancelled orders by day across connected channels</p>
          </div>
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs dark:bg-slate-800">
            {[['revenue', 'Revenue'], ['orders', 'Orders']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setMetric(k)} className={`rounded-md px-3 py-1 font-medium ${metric === k ? 'bg-white shadow-sm dark:bg-slate-900' : MUTED}`}>{label}</button>
            ))}
          </div>
        </div>
        <PartError name="daily" errors={errors} />
        {daily && empty && <p className={`py-14 text-center text-sm ${MUTED}`}>No sales in the last 30 days.</p>}
        {daily && !empty && (
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={rows} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.35} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => (metric === 'revenue' ? `$${v}` : v)} />
                <Tooltip formatter={(v, name) => [metric === 'revenue' ? usd(v, 2) : v, name]} />
                <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
                {shops.map((shop, i) => {
                  const color = shopColor(shop, i)
                  return <Area key={shop.key} type="monotone" dataKey={shop.key} name={shop.label} stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} />
                })}
                {shops.length > 1 && <Area type="monotone" dataKey="total" name="All shops" stroke="#94a3b8" fillOpacity={0} strokeDasharray="4 4" strokeWidth={1.5} />}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className={`${CARD} flex flex-col justify-between gap-3`}>
        <div>
          <h2 className="font-semibold">Channel share · 30 days</h2>
          <p className={`text-xs ${MUTED}`}>Revenue mix &amp; order volume per shop</p>
        </div>
        <PartError name="byShop" errors={errors} />
        <div className="space-y-3">
          {mix.map((m) => (
            <div key={m.shopId} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="truncate">{m.name}</span>
                </span>
                <span className="shrink-0 font-semibold">{usd(m.revenue)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
              </div>
              <div className={`flex items-center justify-between text-xs ${MUTED}`}>
                <span>{num(m.orders)} sold · {m.pct}%</span>
                <Change now={m.revenue} before={m.prevRevenue} />
              </div>
            </div>
          ))}
          {byShop && !byShop.length && <p className={`py-6 text-center text-sm ${MUTED}`}>No shops connected yet.</p>}
        </div>
        <div className={`border-t border-gray-100 pt-2 text-xs ${MUTED} dark:border-slate-800`}>
          Period change compares against the prior 30-day window.
        </div>
      </section>
    </div>
  )
}

export function ShopCard({ card, shop, index }) {
  const broken = card.status !== 'connected'
  const Icon = shop?.icon
  const catalogTo = shopLink(shop, 'catalog')
  const ordersTo = shopLink(shop, 'orders')
  const inventoryTo = shopLink(shop, 'inventory')
  const analyticsTo = shopLink(shop, 'analytics')
  const fourthKind = card.hasInbox || card.unread > 0 ? 'messages' : 'returns'
  const fourthTo = fourthKind === 'messages' ? shopLink(shop, 'messages', null, { type: 'unread' }) : shopLink(shop, 'returns')
  const stockIssues = (card.outOfStock || 0) + (card.lowStock || 0)

  return (
    <article className={`${CARD} flex flex-col gap-3`} style={{ borderTop: `3px solid ${shopColor(shop, index)}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{card.name}</h3>
            <p className={`text-xs ${MUTED}`}>{shop?.label || card.marketplace}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${broken ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>
          {card.status === 'connected' ? 'Connected' : card.status === 'error' ? 'Login problem' : 'Not connected'}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xl font-bold">{usd(card.revenue)}<Change now={card.revenue} before={card.prevRevenue} /></p>
        <span className={`text-xs ${MUTED}`}>{num(card.orders)} sold · 30d</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile to={ordersTo} label="To ship" value={num(card.toShip)} tone={card.toShip > 0 ? 'text-amber-700 dark:text-amber-300' : ''} />
        <StatTile to={catalogTo} label="Live catalog" value={card.listingErrors > 0 ? `${num(card.live)} · ${card.listingErrors} err` : num(card.live)} tone={card.listingErrors > 0 ? 'text-rose-600 dark:text-rose-400' : ''} />
        <StatTile to={inventoryTo} label="Stock alerts" value={stockIssues > 0 ? `${card.outOfStock || 0} out · ${card.lowStock || 0} low` : 'Healthy'} tone={card.outOfStock > 0 ? 'text-rose-600 dark:text-rose-400' : stockIssues > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-400'} />
        {fourthKind === 'messages'
          ? <StatTile to={fourthTo} label="Unread buyers" value={num(card.unread)} tone={card.unread > 0 ? 'text-indigo-600 dark:text-indigo-400' : ''} />
          : <StatTile to={fourthTo} label="Returns" value={num(card.openReturns)} tone={card.openReturns > 0 ? 'text-amber-700 dark:text-amber-300' : ''} />}
      </div>

      {card.authError && <p className="text-xs text-rose-600 dark:text-rose-400">{card.authError}</p>}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5 text-xs dark:border-slate-800">
        <span className={card.failingSyncs > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : MUTED}>
          {ago(card.lastSyncAt)}{card.failingSyncs > 0 ? ` · ${card.failingSyncs} failing` : ''}
        </span>
        <div className="flex flex-wrap gap-3 font-medium">
          {broken ? (
            <Link to="/settings" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">{card.status === 'error' ? 'Reconnect' : 'Connect'} →</Link>
          ) : (
            <>
              {ordersTo && <Link to={ordersTo} className="text-indigo-600 hover:underline dark:text-indigo-400">Orders</Link>}
              {catalogTo && <Link to={catalogTo} className="text-indigo-600 hover:underline dark:text-indigo-400">{sectionLabel(shop, 'catalog')}</Link>}
              {inventoryTo && <Link to={inventoryTo} className="text-indigo-600 hover:underline dark:text-indigo-400">Inventory</Link>}
              {analyticsTo && <Link to={analyticsTo} className="text-indigo-600 hover:underline dark:text-indigo-400">Analytics</Link>}
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export function QueuesSection({ data, shops, errors }) {
  const findShop = (key) => shops.find((s) => s.key === key)
  const shopIdx = (key) => Math.max(shops.findIndex((s) => s.key === key), 0)
  const inboxShop = shops.find((s) => Boolean(shopLink(s, 'messages')))

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <section className={CARD}>
        <h2 className="mb-2 font-semibold">Orders to ship next</h2>
        <PartError name="toShipNext" errors={errors} />
        {data?.toShipNext && !data.toShipNext.length && <p className={`py-4 text-sm ${MUTED}`}>Nothing waiting to ship.</p>}
        <ul className="divide-y dark:divide-slate-800">
          {(data?.toShipNext || []).map((o) => {
            const shop = findShop(o.marketplace)
            const to = shopLink(shop, 'orders', o.externalOrderId)
            const due = o.shipBy ? new Date(o.shipBy) : null
            const late = due && due < new Date(data.loadedAt || 0)
            return (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-medium">{o.externalOrderId}</span>
                    <ShopPill shop={shop} marketplace={o.marketplace} index={shopIdx(o.marketplace)} />
                    {o.buyer && <span className={`truncate text-xs ${MUTED}`}>{o.buyer}</span>}
                  </div>
                  <p className={`text-xs ${late ? 'font-semibold text-rose-600 dark:text-rose-400' : MUTED}`}>
                    {due ? `${late ? 'Past ship-by' : 'Ship by'} ${due.toLocaleDateString()}` : o.placedAt ? `Ordered ${new Date(o.placedAt).toLocaleDateString()}` : ''}
                    {o.total != null ? ` · ${usd(o.total, 2)}` : ''}
                  </p>
                </div>
                {to && <Link to={to} className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Open →</Link>}
              </li>
            )
          })}
        </ul>
      </section>

      <section className={CARD}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Unread buyer messages</h2>
          {inboxShop && <Link to={shopLink(inboxShop, 'messages', null, { type: 'unread' })} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Open unread →</Link>}
        </div>
        <PartError name="unreadThreads" errors={errors} />
        {data?.unreadThreads && !data.unreadThreads.length && <p className={`py-4 text-sm ${MUTED}`}>No unread buyer messages.</p>}
        <ul className="divide-y dark:divide-slate-800">
          {(data?.unreadThreads || []).map((t) => {
            const shop = findShop(t.marketplace)
            const to = shopLink(shop, 'messages', null, { type: 'unread' })
            return (
              <li key={t.id} className="flex items-start justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{t.customerName}</span>
                    <ShopPill shop={shop} marketplace={t.marketplace} index={shopIdx(t.marketplace)} />
                    <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">{t.unreadCount} unread</span>
                  </div>
                  {t.preview && <p className={`truncate text-xs ${MUTED}`}>{t.preview}</p>}
                  {t.lastMessageAt && <p className={`text-[11px] ${MUTED}`}>{ago(t.lastMessageAt, '')}</p>}
                </div>
                {to && <Link to={to} className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Reply →</Link>}
              </li>
            )
          })}
        </ul>
      </section>

      <section className={CARD}>
        <h2 className="mb-2 font-semibold">Top products · last 30 days</h2>
        <PartError name="topProducts" errors={errors} />
        {data?.topProducts && !data.topProducts.length && <p className={`py-4 text-sm ${MUTED}`}>No sales in the last 30 days.</p>}
        <ol className="divide-y dark:divide-slate-800">
          {(data?.topProducts || []).map((p, i) => {
            const shop = findShop(p.marketplace)
            return (
              <li key={p.productId || `${p.title}-${i}`} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`w-4 shrink-0 text-xs ${MUTED}`}>{i + 1}.</span>
                  <span className="truncate font-medium">{p.title}</span>
                  {p.marketplace && <ShopPill shop={shop} marketplace={p.marketplace} index={shopIdx(p.marketplace)} />}
                </span>
                <span className="shrink-0 font-semibold">{usd(p.revenue)} <span className={`text-xs font-normal ${MUTED}`}>· {num(p.units)} sold</span></span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className={CARD}>
        <h2 className="mb-2 font-semibold">Low &amp; out-of-stock listed items</h2>
        <PartError name="stockAlerts" errors={errors} />
        {data?.stockAlerts && !data.stockAlerts.length && <p className={`py-4 text-sm ${MUTED}`}>All listed products are above their stock threshold.</p>}
        <ul className="divide-y dark:divide-slate-800">
          {(data?.stockAlerts || []).map((item) => {
            const shop = findShop(item.marketplace)
            const to = shopLink(shop, 'inventory', item.sku || item.title)
            const out = item.stock <= 0
            return (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium">{item.title}</span>
                    {item.marketplace && <ShopPill shop={shop} marketplace={item.marketplace} index={shopIdx(item.marketplace)} />}
                  </div>
                  <p className={`text-xs ${MUTED}`}>
                    {item.sku && <span className="mr-2 font-mono">{item.sku}</span>}
                    <span className={out ? 'font-semibold text-rose-600 dark:text-rose-400' : 'font-medium text-amber-700 dark:text-amber-300'}>
                      {out ? 'Out of stock' : `${item.stock} left (min ${item.threshold})`}
                    </span>
                  </p>
                </div>
                {to && <Link to={to} className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Restock →</Link>}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
