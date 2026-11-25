/** What the TikTok Shop Inventory page shows. `stock` = { lowCount (incl. out of stock), outCount }. */

const lowOnly = (s) => Math.max(0, (s?.lowCount || 0) - (s?.outCount || 0))

export function inventoryPills(stock, total) {
  return [
    { key: 'all', label: 'All', count: total ?? null },
    { key: 'low', label: 'Low stock', count: stock ? lowOnly(stock) : null },
    { key: 'out', label: 'Out of stock', count: stock ? stock.outCount || 0 : null },
    { key: 'history', label: 'History', count: null },
  ]
}

export function inventorySummary(stock, total) {
  if (total == null) return ''
  const low = lowOnly(stock)
  return [`${total} products`, low && `${low} low`, stock?.outCount && `${stock.outCount} out of stock`].filter(Boolean).join(' · ')
}

export function inventoryAttention(stock) {
  const items = []
  if (stock?.outCount) items.push({ id: 'out', text: `${stock.outCount} out of stock`, pill: 'out', action: 'Restock' })
  if (lowOnly(stock)) items.push({ id: 'low', text: `${lowOnly(stock)} running low`, pill: 'low', action: 'Show' })
  return items
}

/**
 * TikTok's stock (read live) against the dashboard's. Stock syncs both ways, so normally nothing
 * shows; `differ` are SKUs where they disagree, `notLinked` TikTok SKUs no dashboard product has.
 */
export function stockCheck(rows) {
  const list = Array.isArray(rows) ? rows : []
  const differ = list.filter((r) => r.mismatch)
  const notLinked = list.filter((r) => r.dashboardStock == null).length
  return { show: differ.length > 0 || notLinked > 0, differ, notLinked }
}

/** What TikTok does with the new number (backend pushProductChanges sends stock to these listings). */
export function stockNote(listing, quantity, variant) {
  const status = listing?.externalListingId ? listing.status : ''
  if (['live', 'out_of_stock', 'pending', 'paused'].includes(status)) return `TikTok gets ${quantity} for this ${variant ? 'variant' : 'product'} when you save.`
  return "This product isn't on sale on TikTok: only the dashboard changes."
}
