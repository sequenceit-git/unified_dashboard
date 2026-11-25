/**
 * What the Overview page shows, from /api/dashboard/overview and the shop registry. Shared code:
 * shops are only ever looked up in the registry (labels, page links, colours), never named.
 */

export const CARD = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'
export const MUTED = 'text-gray-500 dark:text-slate-400'
export const usd = (v, digits = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(v) || 0)
export const num = (v) => (v == null ? '—' : Number(v).toLocaleString())

export function ago(date, prefix = 'synced ') {
  if (!date) return 'never synced'
  const m = Math.round((Date.now() - new Date(date).getTime()) / 60000)
  if (m < 1) return `${prefix}just now`
  if (m < 60) return `${prefix}${m}m ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${prefix}${h}h ago` : `${prefix}${Math.round(h / 24)}d ago`
}

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

/** Resolves a standard kind ('catalog', 'returns', 'messages', 'orders', 'inventory', 'analytics') to this shop's section id. */
export function shopSection(shop, sectionOrKind) {
  if (!shop || !sectionOrKind) return null
  if (has(shop, sectionOrKind)) return sectionOrKind
  const mapped = (() => {
    if (sectionOrKind === 'catalog') {
      return shop.renamedSections?.products || shop.subsections?.find((s) => s.route === 'products')?.id || 'products'
    }
    if (sectionOrKind === 'returns') return shop.renamedSections?.returns || 'returns'
    if (sectionOrKind === 'messages') return shop.renamedSections?.inbox || 'messages'
    if (sectionOrKind === 'fulfillment') return shop.renamedSections?.fulfillment || 'orders'
    return shop.renamedSections?.[sectionOrKind] || sectionOrKind
  })()
  return has(shop, mapped) ? mapped : null
}

/** Display label of a shop subsection from its registry metadata. */
export function sectionLabel(shop, sectionOrKind) {
  const id = shopSection(shop, sectionOrKind)
  return shop?.subsections?.find((s) => s.id === id)?.label || id || ''
}

/** A shop page (`/<urlId>/<section>`, optional ?q= & extra query params), or null when missing. */
export function shopLink(shop, sectionOrKind, q, params) {
  const section = shopSection(shop, sectionOrKind)
  if (!section) return null
  const entries = []
  if (q) entries.push(`q=${encodeURIComponent(q)}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') entries.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
  }
  return `/${shop.urlId}/${section}${entries.length ? `?${entries.join('&')}` : ''}`
}

/** Picks the visible shop with the matching section that ranks highest by `scoreCard(card)`. */
function bestShopFor(shops, sectionOrKind, byShop, scoreCard) {
  const eligible = shops.filter((s) => Boolean(shopSection(s, sectionOrKind)))
  if (!eligible.length) return null
  if (!byShop?.length || !scoreCard) return eligible[0]
  const cardByKey = new Map(byShop.map((c) => [c.marketplace, c]))
  return [...eligible].sort((a, b) => scoreCard(cardByKey.get(b.key)) - scoreCard(cardByKey.get(a.key)))[0]
}

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
  const byShop = data?.byShop || []
  const items = []
  if (u.readyToShip) {
    const shop = bestShopFor(shops, 'orders', byShop, (c) => c?.toShip || 0)
    items.push({ id: 'toShip', text: `${plural(u.readyToShip, 'order')} to ship${a?.late ? ` (${a.late} past ship-by)` : ''}`, to: shop ? shopLink(shop, 'orders') : null, urgent: Boolean(a?.late) })
  }
  if (a?.openReturns) {
    const shop = bestShopFor(shops, 'returns', byShop, (c) => c?.openReturns || 0)
    items.push({ id: 'returns', text: `${plural(a.openReturns, 'return')} awaiting action`, to: shop ? shopLink(shop, 'returns') : null })
  }
  if (u.openInbox) {
    const shop = bestShopFor(shops, 'messages', byShop, (c) => c?.unread || 0)
    const msgSuffix = a?.unreadMessages > u.openInbox ? ` (${a.unreadMessages} messages)` : ''
    items.push({ id: 'inbox', text: `${plural(u.openInbox, 'unread buyer chat')}${msgSuffix}`, to: shop ? shopLink(shop, 'messages', null, { type: 'unread' }) : null })
  }
  if (!a && u.lowStock) {
    // The detailed checks failed: the low-stock count (out of stock included) is still known.
    const shop = bestShopFor(shops, 'inventory', byShop, (c) => (c?.outOfStock || 0) + (c?.lowStock || 0))
    items.push({ id: 'stock', text: `${u.lowStock} low or out of stock`, to: shop ? shopLink(shop, 'inventory') : null })
  }
  if (a && (a.outOfStock || u.lowStock)) {
    const low = Math.max(0, (u.lowStock || 0) - (a.outOfStock || 0))
    const shop = bestShopFor(shops, 'inventory', byShop, (c) => (c?.outOfStock || 0) * 10 + (c?.lowStock || 0))
    items.push({ id: 'stock', text: [a.outOfStock && `${a.outOfStock} out of stock`, low && `${low} low`].filter(Boolean).join(' · '), to: shop ? shopLink(shop, 'inventory') : null, urgent: Boolean(a.outOfStock) })
  }
  if (a?.listingErrors) {
    const shop = bestShopFor(shops, 'catalog', byShop, (c) => c?.listingErrors || 0)
    items.push({ id: 'listingErrors', text: `${plural(a.listingErrors, 'listing error')}`, to: shop ? shopLink(shop, 'catalog') : null, urgent: true })
  }
  for (const p of a?.loginProblems || []) {
    const shop = shops.find((s) => s.key === p.marketplace)
    items.push({ id: `login-${p.shopId}`, text: `${p.name}${shop ? ` (${shop.label})` : ''}: ${p.problem}`, to: '/settings', urgent: true })
  }
  if (a?.syncFailed24h) items.push({ id: 'sync', text: `${plural(a.syncFailed24h, 'sync stream')} failing`, to: '/settings' })
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

/** Per-shop 30-day revenue share across visible shops, keeping shop colour and delta metadata. */
export function shopShare(byShop, shops) {
  const total = (byShop || []).reduce((sum, c) => sum + (Number(c.revenue) || 0), 0)
  return (byShop || []).map((card) => {
    const index = shops.findIndex((s) => s.key === card.marketplace)
    const shop = index >= 0 ? shops[index] : null
    const revenue = Number(card.revenue) || 0
    return {
      shopId: card.shopId,
      name: card.name,
      key: card.marketplace,
      label: shop?.label || card.marketplace,
      revenue,
      prevRevenue: Number(card.prevRevenue) || 0,
      orders: Number(card.orders) || 0,
      pct: total > 0 ? Math.round((revenue / total) * 100) : 0,
      color: shopColor(shop, Math.max(index, 0)),
    }
  })
}
