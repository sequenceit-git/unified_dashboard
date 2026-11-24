/**
 * TikTok Shop "analytics" section (next to the sales charts): SKU and product performance, shop
 * health (score, benefits, each metric with a diagnosis), and today by hour, from TikTok's
 * Analytics API. `details` are read-only drill-downs opened from a row.
 */
const { col, tables, listingTitles } = require('../../../services/marketplace/sectionKit')
const { ttGet, ttMoney, ttRange, scopeAware } = require('./helpers')

const SCOPE = 'TikTok Shop Analytics'
const money = (m) => (m ? ttMoney(m.amount, m.currency) : null)
const enc = encodeURIComponent

/** A table from whatever list TikTok returns (problem and top-item lists differ per metric). */
function listTable(id, title, rows) {
  const keys = Object.keys(rows[0] || {}).filter((k) => !/image_url/.test(k)).slice(0, 8)
  return {
    id,
    title,
    columns: keys.map((k) => col(k, k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), rows.some((r) => r[k]?.amount != null) ? 'money' : 'text')),
    rows: rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k]?.amount != null ? money(r[k]) : Array.isArray(r[k]) ? r[k].join(', ') : r[k]]))),
  }
}
const firstList = (data) => Object.values(data || {}).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object') || []

async function skuRows(token, shop, now) {
  const { skus = [] } = await ttGet(token, shop, '/analytics/202509/shop_skus/performance', { ...ttRange(30, now), page_size: 100, sort_field: 'gmv', sort_order: 'DESC' })
  const titles = await listingTitles('tiktok_shop', [...new Set(skus.map((s) => String(s.product_id)))])
  return skus
    .map((s) => ({
      id: `${s.id}:${s.product_id}`,
      skuId: String(s.id),
      productId: String(s.product_id),
      product: titles.get(String(s.product_id))?.title || '',
      orders: s.sku_orders ?? 0,
      unitsSold: s.units_sold ?? 0,
      gmv: money(s.gmv),
      actions: [{ id: 'sku', label: 'Details', detail: true }],
    }))
    .sort((a, b) => (b.gmv?.value || 0) - (a.gmv?.value || 0))
}

async function healthRows(token, shop) {
  const { metrics = [] } = await ttGet(token, shop, '/analytics/202606/shop_performances/metrics')
  return metrics.map((m) => ({
    id: m.metric_code,
    metric: m.metric_name || m.metric_code,
    area: m.dimension || '',
    value: m.value != null ? `${m.value}${m.value_unit || ''}` : '',
    target: m.benchmarks?.excellent_threshold != null ? `${m.benchmarks.excellent_threshold}${m.value_unit || ''}` : '',
    status: m.status_text || m.status || '',
    reason: m.top_reason_text || '',
    actions: [{ id: 'metric', label: 'Diagnose', detail: true }],
  }))
}

async function hourlyRows(token, shop, now) {
  const date = now.toISOString().slice(0, 10)
  const { performance } = await ttGet(token, shop, `/analytics/202510/shop/performance/${date}/performance_per_hour`)
  return (performance?.intervals || []).map((h) => ({
    hour: `${String(h.index).padStart(2, '0')}:00`,
    gmv: money(h.gmv),
    orders: h.orders_count ?? 0,
    visitors: h.visitors ?? 0,
    productClicks: h.product_clicks ?? 0,
  }))
}

async function analytics(token, shop, { now = new Date() } = {}) {
  let healthTiles = []
  const list = await tables([
    {
      id: 'skus',
      tab: 'Products',
      title: 'SKU performance (last 30 days)',
      columns: [col('skuId', 'SKU'), col('product', 'Product'), col('orders', 'Orders', 'number'), col('unitsSold', 'Units sold', 'number'), col('gmv', 'GMV', 'money')],
      load: scopeAware(() => skuRows(token, shop, now), SCOPE),
    },
    {
      id: 'health',
      tab: 'Shop health',
      title: 'Shop performance metrics',
      note: 'TikTok scores the shop on each metric. Diagnose one to see its trend, the problem orders and the items behind it.',
      columns: [col('metric', 'Metric'), col('area', 'Area'), col('value', 'Value'), col('target', 'Excellent at'), col('status', 'Status', 'status'), col('reason', 'Top reason')],
      load: scopeAware(async () => {
        const [overview, benefits, rows] = await Promise.all([
          ttGet(token, shop, '/analytics/202610/shop_performances/overview').catch(() => null),
          ttGet(token, shop, '/analytics/202610/shop_performances/benefits').catch(() => null),
          healthRows(token, shop),
        ])
        if (overview) {
          healthTiles = [
            { id: 'sps-score', tab: 'Shop health', label: 'Shop performance score', value: overview.sps_score ?? '—', type: 'text', sub: overview.sps_tier_text || '' },
            ...(overview.peer_percentile ? [{ id: 'peers', tab: 'Shop health', label: 'Better than peers', value: `${overview.peer_percentile}%`, type: 'text' }] : []),
            ...(overview.dimensions || []).map((d) => ({ id: 'dimension', tab: 'Shop health', label: d.name, value: d.score ?? '—', type: 'text', sub: d.status_text || '' })),
          ]
        }
        const unlocked = (benefits?.benefits || []).filter((b) => b.is_unlocked).length
        if (benefits?.benefits?.length) healthTiles.push({ id: 'benefits', tab: 'Shop health', label: 'Benefits unlocked', value: `${unlocked} of ${benefits.benefits.length}`, type: 'text' })
        return rows
      }, SCOPE),
    },
    {
      id: 'hourly',
      tab: 'Today by hour',
      title: 'Today by hour',
      columns: [col('hour', 'Hour'), col('gmv', 'GMV', 'money'), col('orders', 'Orders', 'number'), col('visitors', 'Visitors', 'number'), col('productClicks', 'Product clicks', 'number')],
      load: scopeAware(() => hourlyRows(token, shop, now), SCOPE),
    },
  ])
  return { summary: healthTiles, tables: list }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, summary?, tables }`. */
analytics.details = {
  /** id = "<skuId>:<productId>": the SKU's daily sales and its product's sales, traffic and ratings. */
  sku: async (token, shop, id, { now = new Date() } = {}) => {
    const [skuId, productId] = String(id).split(':')
    const range = { ...ttRange(30, now), granularity: '1D' }
    const [sku, product] = await Promise.all([
      ttGet(token, shop, `/analytics/202509/shop_skus/${enc(skuId)}/performance`, range),
      productId ? ttGet(token, shop, `/analytics/202509/shop_products/${enc(productId)}/performance`, range).catch(() => null) : null,
    ])
    const days = (sku.performance?.intervals || []).map((d) => ({ date: d.start_date, gmv: money(d.gmv), orders: d.sku_orders ?? 0, itemsSold: d.items_sold ?? 0 }))
    const productDays = (product?.performance?.intervals || []).map((d) => ({
      date: d.start_date,
      gmv: money(d.sales?.gmv),
      orders: d.sales?.orders ?? 0,
      returned: d.cancel_and_refunds?.returned ?? 0,
      refunded: d.cancel_and_refunds?.refunded ?? 0,
    }))
    return {
      title: `SKU ${skuId}`,
      tables: [
        { id: 'sku', title: 'This SKU by day', columns: [col('date', 'Date', 'date'), col('gmv', 'GMV', 'money'), col('orders', 'Orders', 'number'), col('itemsSold', 'Items sold', 'number')], rows: days },
        ...(product ? [{ id: 'product', title: 'Whole product by day', columns: [col('date', 'Date', 'date'), col('gmv', 'GMV', 'money'), col('orders', 'Orders', 'number'), col('returned', 'Returned', 'number'), col('refunded', 'Refunded', 'number')], rows: productDays }] : []),
      ],
    }
  },
  /** id = metric code: diagnosis (trend and analysis), the problem orders, and the items behind it. */
  metric: async (token, shop, code) => {
    const [diagnosis, problems, top] = await Promise.all([
      ttGet(token, shop, `/analytics/202606/shop_performances/metrics/${enc(code)}/diagnosis`),
      ttGet(token, shop, `/analytics/202606/shop_performances/metrics/${enc(code)}/problem_details`, { page_size: 50 }).catch(() => ({})),
      ttGet(token, shop, `/analytics/202606/shop_performances/metrics/${enc(code)}/top_items`).catch(() => ({})),
    ])
    const notes = (diagnosis.analyses || []).flatMap((a) => [...(a.summaries || []), ...(a.details || [])]).map((text) => ({ note: text }))
    const trend = (diagnosis.trend?.data_points || []).map((p) => ({ note: `${p.record_date}: ${p.value}${diagnosis.value_unit || ''}` }))
    return {
      title: `Diagnosis: ${diagnosis.metric_code || code}`,
      summary: [
        { label: 'Value', value: `${diagnosis.value ?? '—'}${diagnosis.value_unit || ''}`, type: 'text' },
        { label: 'Status', value: diagnosis.status_text || diagnosis.status || '—', type: 'text' },
      ],
      tables: [
        { id: 'diagnosis', title: 'What TikTok sees', columns: [col('note', 'Finding')], rows: [...notes, ...trend] },
        listTable('problems', 'Problem orders', firstList(problems)),
        listTable('top', 'Items behind it', firstList(top)),
      ],
    }
  },
}

module.exports = analytics
