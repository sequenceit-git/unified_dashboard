/** tiktok_shop "promotions" section: its tables, details, and actions for the shop section page. */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttMoney, ttPost, ttGet } = require('./helpers')
const { HttpError } = require('../../../utils/httpError')

const enc = encodeURIComponent
const REPUBLISHABLE = /EXPIRED|DEACTIVATED|INACTIVE/i

async function promotions(token, shop) {
  const list = await tables([
    {
      id: 'activities',
      title: 'Promotions',
      columns: [col('title', 'Name'), col('type', 'Type'), col('scope', 'Applies to'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
      load: async () => (await ttPost(token, shop, '/promotion/202309/activities/search', { page_size: 100 }, {})).activities?.map((row) => {
        const id = row.id || row.activity_id
        const rawStatus = row.status || ''
        const actions = id ? [
          { id: 'activity', label: 'Details', detail: true },
          { id: 'edit-activity', label: 'Rename', input: { label: 'New promotion name', placeholder: row.title || '' } },
          { id: 'remove-product', label: 'Remove product', danger: true, input: { label: 'Product ID to remove from promotion', placeholder: 'TikTok product_id' } },
        ] : []
        if (id && REPUBLISHABLE.test(rawStatus)) {
          actions.push({ id: 'republish', label: 'Republish', confirm: `Republish "${row.title || id}" as a new promotion?` })
        }
        return {
          id,
          promotionId: id,
          title: row.title,
          type: words(row.activity_type),
          scope: row.product_level === 'SHOP' ? 'Whole shop' : words(row.product_level),
          status: words(rawStatus),
          start: seconds(row.begin_time),
          end: row.duration_type === 'INDEFINITE' ? null : seconds(row.end_time),
          actions,
        }
      }) || [],
    },
    {
      id: 'coupons',
      title: 'Coupons',
      columns: [col('title', 'Name'), col('type', 'Type'), col('status', 'Status', 'status'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
      load: async () => (await ttPost(token, shop, '/promotion/202406/coupons/search')).coupons?.map((row) => {
        const id = row.id || row.coupon_id
        return {
          id: id || row.title || row.name,
          title: row.title || row.name || row.id,
          type: words(row.display_type || row.coupon_type),
          status: words(row.status),
          start: seconds(row.redemption_duration?.start_time || row.claim_duration?.start_time || row.start_time),
          end: seconds(row.redemption_duration?.end_time || row.claim_duration?.end_time || row.end_time),
          actions: id ? [{ id: 'coupon', label: 'Details', detail: true }] : [],
        }
      }) || [],
    },
  ])
  return {
    summary: [
      { label: 'Ongoing promotions', value: list[0].rows.filter((row) => /ongoing/i.test(row.status)).length, type: 'number' },
      { label: 'Coupons', value: list[1].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, tables }`. */
promotions.details = {
  /** Activity details + participating products. */
  activity: async (token, shop, id) => {
    const res = await ttGet(token, shop, `/promotion/202309/activities/${enc(id)}`)
    const act = res.activity || res
    const products = act.products || []
    return {
      title: act.title || `Promotion ${id}`,
      tables: [
        {
          id: 'activity-overview',
          title: 'Promotion summary',
          columns: [col('field', 'Field'), col('value', 'Value')],
          rows: [
            { field: 'ID', value: act.id || act.activity_id || id },
            { field: 'Type', value: words(act.activity_type) },
            { field: 'Applies to', value: act.product_level === 'SHOP' ? 'Whole shop' : words(act.product_level) },
            { field: 'Status', value: words(act.status) },
            { field: 'Starts', value: seconds(act.begin_time) || '—' },
            { field: 'Ends', value: act.duration_type === 'INDEFINITE' ? 'No end date' : (seconds(act.end_time) || '—') },
          ],
        },
        {
          id: 'activity-products',
          title: 'Products in promotion',
          columns: [col('productId', 'Product ID'), col('discount', 'Discount'), col('activityPrice', 'Promo price', 'money'), col('qtyLimit', 'Limit', 'number'), col('skuCount', 'SKUs', 'number')],
          rows: products.map((p) => ({
            productId: p.id || p.product_id || '',
            discount: p.discount != null ? `${p.discount}%` : (p.discount_amount ? String(p.discount_amount) : '—'),
            activityPrice: ttMoney(p.activity_price?.amount, p.activity_price?.currency),
            qtyLimit: p.quantity_limit ?? null,
            skuCount: Array.isArray(p.skus) ? p.skus.length : 0,
          })),
        },
      ],
    }
  },

  /** Single coupon configuration, threshold, discount and claim/redemption windows. */
  coupon: async (token, shop, id) => {
    const res = await ttGet(token, shop, `/promotion/202406/coupons/${enc(id)}`)
    const c = res.coupon || res
    const threshold = c.threshold || {}
    const discount = c.discount || {}
    const rows = [
      { field: 'ID', value: c.id || c.coupon_id || id },
      { field: 'Type', value: words(c.display_type || c.coupon_type) },
      { field: 'Status', value: words(c.status) },
      { field: 'Buyer segment', value: words(c.target_buyer_segment) || 'All' },
      { field: 'Discount', value: discount.reduction_amount ? `${discount.reduction_amount.amount} ${discount.reduction_amount.currency || ''}`.trim() : (discount.percentage ? `${discount.percentage}%` : '—') },
      { field: 'Minimum spend', value: threshold.min_spend ? `${threshold.min_spend.amount} ${threshold.min_spend.currency || ''}`.trim() : (threshold.type ? words(threshold.type) : 'None') },
      { field: 'Claim limit', value: c.usage_limits?.total_claim_limit ?? c.total_claim_limit ?? 'Unlimited' },
      { field: 'Redemption starts', value: seconds(c.redemption_duration?.start_time || c.start_time) || '—' },
      { field: 'Redemption ends', value: seconds(c.redemption_duration?.end_time || c.end_time) || '—' },
    ]
    return {
      title: c.title || c.name || `Coupon ${id}`,
      tables: [{
        id: 'coupon-summary',
        title: 'Coupon details',
        columns: [col('field', 'Setting'), col('value', 'Value')],
        rows,
      }],
    }
  },
}

/** Row actions: `actions[action](token, shop, id, value) → { message }`. */
promotions.actions = {
  /** Updates a promotion activity's title (merging existing fields required by TikTok PUT). */
  'edit-activity': async (token, shop, id, value) => {
    const title = String(typeof value === 'object' ? (value?.title ?? '') : (value ?? '')).trim()
    if (!title) throw new HttpError(400, { error: 'Enter the new promotion name.' })
    const existing = await ttGet(token, shop, `/promotion/202309/activities/${enc(id)}`).catch(() => ({}))
    const act = existing.activity || existing
    const body = {
      ...(act.activity_type ? { activity_type: act.activity_type } : {}),
      ...(act.product_level ? { product_level: act.product_level } : {}),
      ...(act.duration_type ? { duration_type: act.duration_type } : {}),
      ...(act.begin_time != null ? { begin_time: act.begin_time } : {}),
      ...(act.end_time != null ? { end_time: act.end_time } : {}),
      title,
    }
    const tiktok = require('../service')
    await tiktok.call(token, 'PUT', `/promotion/202309/activities/${enc(id)}`, { shop, body })
    return { message: `Promotion renamed to "${title}".` }
  },

  /** Removes product ID(s) from a promotion activity. */
  'remove-product': async (token, shop, id, value) => {
    const raw = typeof value === 'object' ? (value?.productIds || value?.productId || '') : (value ?? '')
    const productIds = String(raw).split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    if (!productIds.length) throw new HttpError(400, { error: 'Enter at least one TikTok product_id.' })
    const tiktok = require('../service')
    await tiktok.call(token, 'DELETE', `/promotion/202309/activities/${enc(id)}/products`, {
      shop,
      body: { product_ids: productIds, sku_ids: [] },
    })
    return { message: `Removed ${productIds.length} product(s) from promotion ${id}.` }
  },

  /** Republishes an expired or deactivated promotion activity. */
  republish: async (token, shop, id) => {
    const tiktok = require('../service')
    await tiktok.call(token, 'POST', `/promotion/202607/activities/${enc(id)}/republish`, { shop, body: {} })
    return { message: `Promotion ${id} republished.` }
  },
}

module.exports = promotions
