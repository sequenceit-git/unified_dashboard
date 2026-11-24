/**
 * eBay "promotions" section: the shop's promotions, and their results (sales, orders, items,
 * discount given and sales lift) from the Marketing API's promotion reports.
 */
const { money, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet } = require('./helpers')
const { ebaySend } = require('../client')
const { HttpError } = require('../../../utils/httpError')

const DELETABLE = /^(DRAFT|ENDED)$/

/** Delete lives on the API of the promotion's kind: markdown sales vs. threshold discounts. */
const deletePath = (p) => (p.promotionType === 'MARKDOWN_SALE' ? `/sell/marketing/v1/item_price_markdown/${encodeURIComponent(p.promotionId)}` : `/sell/marketing/v1/item_promotion/${encodeURIComponent(p.promotionId)}`)

async function promotions(token) {
  let byId = new Map()
  const list = await tables([{
    id: 'promotions',
    tab: 'Promotions',
    title: 'Promotions',
    columns: [col('name', 'Name'), col('type', 'Type'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
    load: async () => {
      const rows = (await ebayGet(token, '/sell/marketing/v1/promotion?marketplace_id=EBAY_US&limit=100')).promotions?.map((row) => ({
        id: String(row.promotionId),
        promotionId: row.promotionId,
        name: row.name,
        actions: [
          { id: 'items', label: 'Listings', detail: true },
          ...(DELETABLE.test(row.promotionStatus || '') ? [{ id: 'delete', label: 'Delete', danger: true, confirm: `Delete promotion "${row.name}"?` }] : []),
        ],
        type: words(row.promotionType),
        status: words(row.promotionStatus),
        start: row.startDate,
        end: row.endDate,
      })) || []
      byId = new Map(rows.map((row) => [String(row.promotionId), row]))
      return rows
    },
  }])
  // The report has no names or status: they come from the promotion list loaded above.
  const [results] = await tables([{
    id: 'results',
    tab: 'Results',
    title: 'Results per promotion',
    note: 'What each promotion sold, how much it discounted, and how much it lifted sales.',
    columns: [col('name', 'Promotion'), col('type', 'Type'), col('status', 'Status', 'status'), col('orders', 'Orders', 'number'), col('items', 'Items sold', 'number'), col('promotionSales', 'Sales from promotion', 'money'), col('totalSales', 'Total sales', 'money'), col('discount', 'Discount given', 'money'), col('lift', 'Sales lift %', 'number')],
    load: async () => ((await ebayGet(token, '/sell/marketing/v1/promotion_report?marketplace_id=EBAY_US&limit=50')).promotionReports || []).map((row) => {
      const promo = byId.get(String(row.promotionId))
      return {
        promotionId: row.promotionId,
        name: promo?.name || row.promotionId,
        type: words(row.promotionType),
        status: promo?.status || '',
        orders: row.numberOfOrdersSold ?? 0,
        items: row.itemsSoldQuantity ?? 0,
        promotionSales: money(row.promotionSale),
        totalSales: money(row.totalSale),
        discount: money(row.totalDiscount),
        lift: row.percentageSalesLift != null ? Number(row.percentageSalesLift) : null,
      }
    }),
  }])
  const report = await ebayGet(token, '/sell/marketing/v1/promotion_summary_report?marketplace_id=EBAY_US').catch(() => null)
  const rows = list[0].rows
  return {
    summary: [
      { tab: 'Promotions', label: 'Running', value: rows.filter((row) => /running/i.test(row.status)).length, type: 'number' },
      { tab: 'Promotions', label: 'Scheduled', value: rows.filter((row) => /scheduled/i.test(row.status)).length, type: 'number' },
      { tab: 'Promotions', label: 'Total', value: rows.length, type: 'number' },
      ...(report?.totalSale ? [
        { tab: 'Results', label: 'Sales from promotions', value: money(report.promotionSale), type: 'money' },
        { tab: 'Results', label: 'Total sales', value: money(report.totalSale), type: 'money' },
        { tab: 'Results', label: 'Sales lift', value: Number(report.percentageSalesLift || 0), type: 'percent' },
      ] : []),
    ],
    tables: [...list, results],
  }
}

/** Read-only drill-downs. */
promotions.details = {
  /** The listings a promotion covers. */
  items: async (token, shop, id) => {
    const res = await ebayGet(token, `/sell/marketing/v1/promotion/${encodeURIComponent(id)}/get_listing_set?limit=200`)
    return {
      title: `Listings in promotion ${id}`,
      tables: [{
        id: 'listings',
        title: 'Listings',
        ...(res.total > (res.listings || []).length ? { note: `Showing ${(res.listings || []).length} of ${res.total}.` } : {}),
        columns: [col('listingId', 'Listing'), col('title', 'Title'), col('price', 'Price', 'money'), col('quantity', 'Quantity', 'number')],
        rows: (res.listings || []).map((l) => ({ listingId: String(l.listingId), title: l.title || '', price: money(l.currentPrice), quantity: l.quantity ?? null })),
      }],
    }
  },
}

/** Row actions served by the generic section action route. */
promotions.actions = {
  /** A draft or ended promotion; its kind and status are read again from eBay. */
  delete: async (token, shop, id) => {
    const list = (await ebayGet(token, '/sell/marketing/v1/promotion?marketplace_id=EBAY_US&limit=200')).promotions || []
    const promo = list.find((p) => String(p.promotionId) === String(id))
    if (!promo) throw new HttpError(404, { error: `eBay has no promotion ${id}.` })
    if (!DELETABLE.test(promo.promotionStatus || '')) throw new HttpError(400, { error: 'Only a draft or ended promotion can be deleted. Pause or end it first.' })
    await ebaySend(token, 'DELETE', deletePath(promo))
    return { message: `Promotion "${promo.name || id}" deleted.` }
  },
}

module.exports = promotions
