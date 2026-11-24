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

/** TikTok's "No shop performance data matches <shop>": the shop hasn't been scored yet (new or low volume). */
const unscored = (err) => /no .*shop performance data|resource not found/i.test(err?.message || '')

async function healthRows(token, shop) {
  const { metrics = [] } = await ttGet(token, shop, '/analytics/202606/shop_performances/metrics')
  return metrics.map((m) => ({
    id: m.metric_code,
    metric: m.metric_name || m.metric_code,
    area: m.dimension || '',
    value: m.value != null ? `${m.value}${m.value_unit || ''}` : '',
    target: m.benchmarks?.excellent_threshold != null ? `${m.benchmarks.excellent_threshold}${m.value_unit || ''}` : '',
    status: m.status_text || m.status || '',
    statusCode: m.status || '',
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

const soft = (err) => {
  if (/scope|permission|authorize|403/i.test(err?.message || '')) throw err
  return {}
}

async function analytics(token, shop, { now = new Date() } = {}) {
  let healthTiles = []
  let accTiles = []
  let offSiteTiles = []

  let accBrandsPromise
  const getAccBrands = () => (accBrandsPromise ||= ttGet(token, shop, '/analytics/202610/acc/brands').catch(soft))
  const getAccContext = async () => {
    const res = await getAccBrands()
    const first = (res.brands || firstList(res))[0]
    return {
      brandsRes: res,
      brandId: String(first?.brand_id || first?.id || ''),
      industryId: String(first?.industry_id || ''),
    }
  }

  let pixelsPromise
  const getPixels = () => (pixelsPromise ||= ttGet(token, shop, '/analytics/202610/off_site/pixels').catch(soft))
  const getPixelContext = async () => {
    const res = await getPixels()
    const first = (res.pixels || firstList(res))[0]
    return { pixelsRes: res, pixelId: String(first?.pixel_id || first?.id || '') }
  }

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
          healthRows(token, shop).catch((err) => { if (unscored(err)) return null; throw err }),
        ])
        if (rows === null) {
          healthTiles = [{ id: 'sps-unscored', tab: 'Shop health', label: 'Shop performance score', value: 'Not scored yet', type: 'text', sub: 'TikTok scores a shop once it has enough orders.' }]
          return []
        }
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
    {
      id: 'accPreferences',
      tab: 'Audience (ACC)',
      title: 'Audience segments & preferences',
      columns: [col('name', 'Preference / segment'), col('group', 'Dimension'), col('share', 'Share'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money')],
      load: scopeAware(async () => {
        const { brandId, industryId } = await getAccContext()
        if (!brandId || !industryId) {
          accTiles = [{ tab: 'Audience (ACC)', label: 'ACC brand status', value: 'No authorized ACC brand', type: 'text', sub: 'TikTok ACC audience metrics require an authorized brand on this shop.' }]
          return []
        }
        const accBrand = { brand_id: brandId, industry_id: industryId }
        const accPref = { ...accBrand, trend_days: 30, audience_type: 'CONVERSION' }
        const [ov, pen, prefSum, prefs] = await Promise.all([
          ttGet(token, shop, '/analytics/202610/acc/overview', accBrand).catch(soft),
          ttGet(token, shop, '/analytics/202610/acc/penetration', { ...accBrand, trend_days: 30 }).catch(soft),
          ttGet(token, shop, '/analytics/202610/acc/preferences/summary', accPref).catch(soft),
          ttGet(token, shop, '/analytics/202610/acc/preferences', { ...accPref, entity_type: 'PRODUCT' }).catch(soft),
        ])
        const audienceVal = ov.total_customers ?? ov.audience_size ?? ov.active_customers ?? null
        const penRate = pen.penetration_rate ?? pen.rate ?? null
        accTiles = [
          { tab: 'Audience (ACC)', label: 'Audience reach', value: audienceVal ?? '—', type: audienceVal != null ? 'number' : 'text' },
          { tab: 'Audience (ACC)', label: 'Buyer penetration', value: penRate != null ? `${penRate}%` : '—', type: 'text' },
          { tab: 'Audience (ACC)', label: 'Top affinity', value: prefSum.top_category || prefSum.dominant_preference || prefSum.summary || '—', type: 'text' },
        ]
        const rows = prefs.preferences || prefs.segments || firstList(prefs)
        return rows.map((r) => ({
          name: r.name || r.preference_name || r.segment_name || r.label || r.trait || '',
          group: r.dimension || r.group || r.type || '',
          share: r.share != null ? `${r.share}%` : (r.ratio != null ? `${r.ratio}%` : (r.percentage || '')),
          orders: r.orders ?? r.sku_orders ?? null,
          gmv: r.gmv?.amount != null ? money(r.gmv) : null,
        }))
      }, SCOPE),
    },
    {
      id: 'accCategories',
      tab: 'Audience (ACC)',
      title: 'Product category affinity',
      columns: [col('category', 'Category'), col('affinity', 'Affinity index'), col('share', 'Buyer share'), col('gmv', 'GMV', 'money')],
      load: scopeAware(async () => {
        const { brandId, industryId } = await getAccContext()
        if (!brandId || !industryId) return []
        const res = await ttGet(token, shop, '/analytics/202610/acc/preferences/product/categories', { brand_id: brandId, industry_id: industryId, trend_days: 30, audience_type: 'CONVERSION' }).catch(soft)
        return (res.categories || firstList(res)).map((c) => ({
          category: c.category_name || c.name || c.title || '',
          affinity: c.affinity_index ?? c.index ?? c.score ?? '',
          share: c.share != null ? `${c.share}%` : (c.percentage || ''),
          gmv: c.gmv?.amount != null ? money(c.gmv) : null,
        }))
      }, SCOPE),
    },
    {
      id: 'accLiveFactors',
      tab: 'Audience (ACC)',
      title: 'LIVE audience & conversion factors',
      columns: [col('factor', 'Factor'), col('impact', 'Impact / score'), col('signal', 'Signal')],
      load: scopeAware(async () => {
        const { brandId, industryId } = await getAccContext()
        if (!brandId || !industryId) return []
        const res = await ttGet(token, shop, '/analytics/202610/acc/preferences/live/factors', { brand_id: brandId, industry_id: industryId, trend_days: 30, audience_type: 'CONVERSION' }).catch(soft)
        return (res.factors || firstList(res)).map((f) => ({
          factor: f.factor_name || f.name || f.title || '',
          impact: f.impact ?? f.score ?? f.value ?? '',
          signal: f.description || f.signal || f.summary || '',
        }))
      }, SCOPE),
    },
    {
      id: 'accBrands',
      tab: 'Audience (ACC)',
      title: 'Brand affinity',
      columns: [col('brand', 'Brand'), col('affinity', 'Affinity index'), col('share', 'Audience share')],
      load: scopeAware(async () => {
        const { brandsRes } = await getAccContext()
        return (brandsRes.brands || firstList(brandsRes)).map((b) => ({
          brand: b.brand_name || b.name || '',
          affinity: b.affinity_index ?? b.index ?? b.score ?? '',
          share: b.share != null ? `${b.share}%` : (b.percentage || ''),
        }))
      }, SCOPE),
    },
    {
      id: 'offSiteDetails',
      tab: 'Off-site & pixels',
      title: 'Off-site channel performance',
      columns: [col('channel', 'Channel / campaign'), col('visits', 'Visits', 'number'), col('orders', 'Orders', 'number'), col('gmv', 'GMV', 'money'), col('roas', 'ROAS')],
      load: scopeAware(async () => {
        const { pixelId } = await getPixelContext()
        if (!pixelId) {
          offSiteTiles = [{ tab: 'Off-site & pixels', label: 'Off-site pixels', value: '0 connected', type: 'text', sub: 'Connect a TikTok Pixel to track off-site attribution.' }]
          return []
        }
        const offSiteQuery = { pixel_id: pixelId, attribution_setting: 'CLICK_14D_OR_VIEW_1D' }
        const [ov, det] = await Promise.all([
          ttGet(token, shop, '/analytics/202610/off_site/overview', offSiteQuery).catch(soft),
          ttGet(token, shop, '/analytics/202610/off_site/details', { ...offSiteQuery, content_type: 'PRODUCT' }).catch(soft),
        ])
        const gmvObj = ov.gmv?.amount != null ? ov.gmv : (ov.off_site_gmv?.amount != null ? ov.off_site_gmv : null)
        offSiteTiles = [
          { tab: 'Off-site & pixels', label: 'Off-site GMV', value: gmvObj ? money(gmvObj) : '—', type: gmvObj ? 'money' : 'text' },
          { tab: 'Off-site & pixels', label: 'Attributed orders', value: ov.orders ?? ov.attributed_orders ?? ov.sku_orders ?? 0, type: 'number' },
          { tab: 'Off-site & pixels', label: 'Off-site clicks / visits', value: ov.visits ?? ov.clicks ?? ov.traffic ?? 0, type: 'number' },
        ]
        return (det.details || det.channels || firstList(det)).map((d) => ({
          channel: d.channel_name || d.campaign_name || d.source || d.name || '',
          visits: d.visits ?? d.clicks ?? d.traffic ?? 0,
          orders: d.orders ?? d.attributed_orders ?? d.sku_orders ?? 0,
          gmv: d.gmv?.amount != null ? money(d.gmv) : null,
          roas: d.roas != null ? `${d.roas}x` : '',
        }))
      }, SCOPE),
    },
    {
      id: 'offSiteInsights',
      tab: 'Off-site & pixels',
      title: 'Off-site attribution insights',
      columns: [col('title', 'Insight'), col('type', 'Type'), col('metric', 'Metric'), col('detail', 'Summary')],
      load: scopeAware(async () => {
        const { pixelId } = await getPixelContext()
        if (!pixelId) return []
        const res = await ttGet(token, shop, '/analytics/202610/off_site/insights', { pixel_id: pixelId, attribution_setting: 'CLICK_14D_OR_VIEW_1D' }).catch(soft)
        return (res.insights || firstList(res)).map((i) => ({
          title: i.title || i.name || i.insight_name || '',
          type: i.type || i.category || '',
          metric: i.metric_value ?? i.value ?? i.impact ?? '',
          detail: i.summary || i.description || i.recommendation || '',
        }))
      }, SCOPE),
    },
    {
      id: 'offSitePixels',
      tab: 'Off-site & pixels',
      title: 'Tracking pixels',
      columns: [col('pixelId', 'Pixel ID'), col('name', 'Name'), col('status', 'Status', 'status'), col('events', 'Events', 'number')],
      load: scopeAware(async () => {
        const { pixelsRes } = await getPixelContext()
        return (pixelsRes.pixels || firstList(pixelsRes)).map((p) => ({
          id: String(p.pixel_id || p.id || ''),
          pixelId: String(p.pixel_id || p.id || ''),
          name: p.pixel_name || p.name || '',
          status: p.status || '',
          events: p.events_count ?? p.events ?? null,
        }))
      }, SCOPE),
    },
  ])
  return { summary: [...healthTiles, ...accTiles, ...offSiteTiles], tables: list }
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
