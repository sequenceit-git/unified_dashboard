/** What the eBay Inventory page shows. `stock` = { lowCount (incl. out of stock), outCount }. */

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
 * What eBay does with the new quantity (backend pushProductChanges): live, out-of-stock, pending
 * and paused listings are revised; an ended listing given stock is relisted.
 */
export function stockNote(listing, quantity, variant) {
  const status = listing?.externalListingId ? listing.status : ''
  if (['live', 'out_of_stock', 'pending', 'paused'].includes(status)) return `eBay gets ${quantity} for this ${variant ? 'variant' : 'listing'} when you save.`
  if (status === 'ended' && quantity > 0) return `Saving relists this on eBay with ${quantity} in stock (eBay may charge a listing fee).`
  return "This product isn't on sale on eBay: only the dashboard changes."
}
