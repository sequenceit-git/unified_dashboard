/**
 * What the Overview page shows, from /api/dashboard/overview and the shop registry. Shared code:
 * shops are only ever looked up in the registry (labels, page links, colours), never named.
 */

export function greeting(hour) {
  return hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening'
}

/** Change against the previous period; null when there is nothing to compare with. */
export function change(now, before) {
  if (before == null || !Number(before)) return null
  const pct = Math.round(((Number(now) - Number(before)) / Number(before)) * 100)
  return { pct, text: `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`, up: pct >= 0 }
}

const has = (shop, section) => (shop?.subsections || []).some((s) => s.id === section)

/** A shop page (`/<urlId>/<section>`, optional ?q=), or null when the shop has no such page. */
export function shopLink(shop, section, q) {
  if (!has(shop, section)) return null
  return `/${shop.urlId}/${section}${q ? `?q=${encodeURIComponent(q)}` : ''}`
}

/** The first shop that has a page for this section. */
const firstWith = (shops, section) => shops.find((s) => has(s, section))

const NAMED = { blue: '#2563eb', purple: '#9333ea', yellow: '#ca8a04', green: '#16a34a', red: '#dc2626', gray: '#64748b', indigo: '#4f46e5' }
const PALETTE = ['#4f46e5', '#0891b2', '#d97706', '#db2777', '#16a34a', '#7c3aed']
export const shopColor = (shop, index = 0) => NAMED[shop?.badgeColor] || PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Needs attention: only items with a count; a check that failed says so (never "all good").
 * `shops`: the shops this user can see, so links never open someone else's shop.
 */
export function attentionItems(data, shops) {
  const u = data?.unified || {}
  const a = data?.attention
  const items = []
  if (u.readyToShip) {
    const shop = firstWith(shops, 'orders')
    items.push({ id: 'toShip', text: `${plural(u.readyToShip, 'order')} to ship${a?.late ? ` (${a.late} past ship-by)` : ''}`, to: shop ? shopLink(shop, 'orders') : null, urgent: Boolean(a?.late) })
  }
  if (u.openInbox) {
    const shop = firstWith(shops, 'messages')
    items.push({ id: 'inbox', text: `${plural(u.openInbox, 'message')} waiting`, to: shop ? shopLink(shop, 'messages') : null })
  }
  if (!a && u.lowStock) {
    // The detailed checks failed: the low-stock count (out of stock included) is still known.
    const shop = firstWith(shops, 'inventory')
    items.push({ id: 'stock', text: `${u.lowStock} low or out of stock`, to: shop ? shopLink(shop, 'inventory') : null })
  }
  if (a && (a.outOfStock || u.lowStock)) {
    const low = Math.max(0, (u.lowStock || 0) - (a.outOfStock || 0))
    const shop = firstWith(shops, 'inventory')
    items.push({ id: 'stock', text: [a.outOfStock && `${a.outOfStock} out of stock`, low && `${low} low`].filter(Boolean).join(' · '), to: shop ? shopLink(shop, 'inventory') : null, urgent: Boolean(a.outOfStock) })
  }
  for (const p of a?.loginProblems || []) {
    const shop = shops.find((s) => s.key === p.marketplace)
    items.push({ id: `login-${p.shopId}`, text: `${p.name}${shop ? ` (${shop.label})` : ''}: ${p.problem}`, to: '/settings', urgent: true })
  }
  if (a?.syncFailed24h) items.push({ id: 'sync', text: `${plural(a.syncFailed24h, 'sync')} failed in the last 24 hours`, to: '/settings' })
  if (!a && data?.errors?.attention) items.push({ id: 'attentionError', text: `We couldn't check stock, late orders, logins and syncs (${data.errors.attention}). Refresh to try again.`, to: null })
  return items
}

/** Recharts rows: one value per shop per day (revenue or orders), and the day's total. */
export function chartRows(daily, metric, shops) {
  return (daily || []).map((d) => {
    const row = { date: d.date, label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) }
    let total = 0
    for (const shop of shops) {
      const v = Number(d.shops?.[shop.key]?.[metric]) || 0
      row[shop.key] = Math.round(v * 100) / 100
      total += v
    }
    row.total = Math.round(total * 100) / 100
    return row
  })
}
