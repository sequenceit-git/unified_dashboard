/**
 * Temu goods status → the dashboard's listing status. Temu's sub-status codes come from the
 * product listing and delisting guide (api-integration-guide/26): goodsStatusFilterType 1 holds
 * Active (2xxx) and Inactive (3xxx) goods, 4 Incomplete (4xxx), 5 Draft, 6 Deleted.
 * Seller Center shows "Product to be completed" (4004) for goods Temu took down for a violation,
 * including after an appeal was refused: that is Rejected here, never On sale.
 */

const SUB_STATUS = {
  2001: { status: 'live', label: 'On sale' },
  2002: { status: 'live', label: 'On sale: documents due' },
  2005: { status: 'live', label: 'On sale: category to fix' },
  2006: { status: 'live', label: 'On sale: SKU set to fix' },
  2101: { status: 'live', label: 'On sale: low traffic' },
  3001: { status: 'error', label: 'Off sale: penalty', reason: 'Temu took this goods off sale as a penalty. See the violation in Temu Seller Center.' },
  3002: { status: 'paused', label: 'Off sale' },
  3003: { status: 'out_of_stock', label: 'Sold out' },
  3004: { status: 'paused', label: 'Inactive: price too high', reason: 'Temu took this goods off sale because the price is too high.' },
  4001: { status: 'pending', label: 'Price evaluation in progress' },
  4002: { status: 'pending', label: 'Under review' },
  4003: { status: 'error', label: 'Price evaluation failed', reason: 'Temu did not accept the price.' },
  4004: { status: 'error', label: 'Product to be completed', reason: 'Temu found a problem with this goods (e.g. a listing violation). See the issue, fix it or appeal in Temu Seller Center.' },
  5001: { status: 'pending', label: 'Draft', raw: 'DRAFT' },
  6001: { status: 'ended', label: 'Deleted', raw: 'DELETED' },
  6002: { status: 'ended', label: 'Deleted: price rejected', raw: 'DELETED' },
}

// What the goods list calls the sub-status (the field names vary between Temu's list calls).
const SUB_FIELDS = ['goodsShowSubStatus', 'subStatus4VO', 'goodsSubStatus', 'subStatus', 'goodsStatusSubType']

/** The goods' Temu sub-status code (a known 4-digit code), or null. */
function subStatusOf(good = {}) {
  for (const field of SUB_FIELDS) {
    const code = Number(good[field])
    if (SUB_STATUS[code]) return code
  }
  return null
}

/**
 * `{ status, marketplaceStatus, reason? }` for a goods from bg.local.goods.list.query.
 * `filterType` is the goodsStatusFilterType the goods was listed under (used when Temu sends no
 * known sub-status): 4 is Incomplete (under review), otherwise on sale.
 */
function goodsState(good, filterType) {
  const code = subStatusOf(good)
  if (code) {
    const s = SUB_STATUS[code]
    return { status: s.status, marketplaceStatus: s.raw || String(code), ...(s.reason ? { reason: s.reason } : {}) }
  }
  if (Number(filterType) === 4) return { status: 'pending', marketplaceStatus: 'INCOMPLETE' }
  return { status: 'live', marketplaceStatus: 'ONSALE' }
}

/** Badge per stored marketplaceStatus (the profile's rawStatuses). */
const COLOR = { live: 'green', paused: 'gray', out_of_stock: 'yellow', pending: 'blue', error: 'red', ended: 'gray' }
const rawStatuses = Object.fromEntries(Object.entries(SUB_STATUS)
  .filter(([, s]) => !s.raw)
  .map(([code, s]) => [code, { label: s.label, color: COLOR[s.status] }]))

module.exports = { SUB_STATUS, subStatusOf, goodsState, rawStatuses }
