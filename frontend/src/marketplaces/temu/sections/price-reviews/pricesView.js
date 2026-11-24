/** What the Temu Price reviews page shows. A table Temu didn't load gives no number (null), not 0. */

const table = (section, id) => (section?.tables || []).find((t) => t.id === id)
const rowsOf = (section, id) => { const t = table(section, id); return t && !t.error ? t.rows : null }

export function priceCounts(section) {
  const reviews = rowsOf(section, 'reviews')
  const guide = rowsOf(section, 'pricing')
  const goods = rowsOf(section, 'catalog')
  return {
    waiting: reviews ? reviews.filter((r) => r.waiting).length : null,
    reviews: reviews ? reviews.length : null,
    above: guide ? guide.filter((r) => r.difference > 0).length : null,
    guide: guide ? guide.length : null,
    goods: goods ? goods.length : null,
  }
}

export function pricePills(c) {
  return [
    { key: 'waiting', label: 'Waiting for you', count: c.waiting },
    { key: 'reviews', label: 'All reviews', count: c.reviews },
    { key: 'guide', label: 'Price guide', count: c.guide },
    { key: 'current', label: 'Current prices', count: c.goods },
  ]
}

export function priceSummary(c) {
  return [c.waiting != null && `${c.waiting} waiting for you`, c.above != null && `${c.above} SKUs priced above Temu`].filter(Boolean).join(' · ')
}

export function priceAttention(c) {
  const items = []
  if (c.waiting) items.push({ id: 'waiting', text: `${c.waiting} price review${c.waiting === 1 ? '' : 's'} waiting for your answer`, pill: 'waiting', action: 'Show' })
  if (c.above) items.push({ id: 'above', text: `${c.above} SKUs priced above Temu’s recommendation`, pill: 'guide', action: 'Price guide' })
  return items
}
