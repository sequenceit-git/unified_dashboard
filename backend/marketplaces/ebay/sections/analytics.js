/**
 * eBay "analytics" section tables (shown next to the sales charts): listing traffic from the
 * Analytics API traffic report, and seller level (standards profile, customer-service metrics).
 */
const { HttpError } = require('../../../utils/httpError')
const { col, tables, words, listingTitles } = require('../../../services/marketplace/sectionKit')
const { ebayGet, scopeAware } = require('./helpers')

const MARKETPLACE = 'EBAY_US'
const METRICS = ['LISTING_IMPRESSION_TOTAL', 'LISTING_VIEWS_TOTAL', 'CLICK_THROUGH_RATE', 'SALES_CONVERSION_RATE', 'TRANSACTION']
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '')
const num = (v) => (v == null || v === '' ? 0 : Number(v?.value ?? v) || 0)
const rate = (v) => {
  const raw = v && typeof v === 'object' ? v.value : v
  return raw == null || raw === '' ? '' : `${Number(raw)}%`
}

/** Last 30 full days, ending yesterday (UTC). */
function lastThirtyDays(now) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
  const start = new Date(end.getTime() - 29 * 86400000)
  return `${ymd(start)}..${ymd(end)}`
}

function trafficUrl(now) {
  const filter = `marketplace_ids:{${MARKETPLACE}},date_range:[${lastThirtyDays(now)}]`.replace(/[{}[\]]/g, encodeURIComponent)
  return `/sell/analytics/v1/traffic_report?dimension=LISTING&metric=${METRICS.join(',')}&filter=${filter}`
}

const day = (s) => String(s).replace(/-/g, '')
const DAY_METRICS = ['LISTING_IMPRESSION_TOTAL', 'LISTING_VIEWS_TOTAL', 'TRANSACTION']

/**
 * Shop traffic by day for exact calendar days (`from`/`to` as YYYY-MM-DD) and eBay's last day with
 * data: `{ latestDate, days: [{ date, impressions, views, sold }] }`.
 */
async function dailyTraffic(token, from, to) {
  const filter = `marketplace_ids:{${MARKETPLACE}},date_range:[${day(from)}..${day(to)}]`.replace(/[{}[\]]/g, encodeURIComponent)
  const report = await ebayGet(token, `/sell/analytics/v1/traffic_report?dimension=DAY&metric=${DAY_METRICS.join(',')}&filter=${filter}`)
  const order = (report.header?.metrics || []).map((m) => m.key)
  const days = (report.records || []).map((record) => {
    const m = Object.fromEntries(order.map((key, i) => [key, num(record.metricValues?.[i])]))
    const d = String(record.dimensionValues?.[0]?.value ?? '')
    return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, impressions: m.LISTING_IMPRESSION_TOTAL, views: m.LISTING_VIEWS_TOTAL, sold: m.TRANSACTION }
  }).sort((a, b) => a.date.localeCompare(b.date))
  const latestDate = report.endDate ? String(report.endDate).slice(0, 10) : days.at(-1)?.date || null
  return { latestDate, days }
}

async function trafficRows(token, now) {
  const report = await ebayGet(token, trafficUrl(now))
  const order = (report.header?.metrics || []).map((m) => m.key)
  const rows = (report.records || []).map((record) => {
    const m = Object.fromEntries(order.map((key, i) => [key, num(record.metricValues?.[i])]))
    return {
      listingId: String(record.dimensionValues?.[0]?.value ?? ''),
      impressions: m.LISTING_IMPRESSION_TOTAL,
      views: m.LISTING_VIEWS_TOTAL,
      ctr: m.CLICK_THROUGH_RATE,
      conversion: m.SALES_CONVERSION_RATE,
      sold: m.TRANSACTION,
    }
  })
  const titles = await listingTitles('ebay', rows.map((r) => r.listingId))
  return rows
    .map((r) => ({ ...r, title: titles.get(r.listingId)?.title || '', url: `https://www.ebay.com/itm/${r.listingId}` }))
    .sort((a, b) => b.views - a.views)
}

const STANDARD_KEYS = { defectRate: 'DEFECTIVE_TRANSACTION_RATE', lateShipmentRate: 'SHIPPING_MISS_RATE', casesClosed: 'CLAIMS_SAF_RATE' }

async function standardsRows(token) {
  const { standardsProfiles = [] } = await ebayGet(token, '/sell/analytics/v1/seller_standards_profile')
  return standardsProfiles.map((p) => {
    const metric = (key) => (p.metrics || []).find((m) => m.metricKey === key)?.value
    return {
      id: `${p.program}|${p.cycle?.cycleType}`,
      actions: [{ id: 'standards', label: 'Metrics', detail: true }],
      program: words(String(p.program || '').replace(/^PROGRAM_/, '')),
      cycle: words(p.cycle?.cycleType),
      level: words(p.standardsLevel),
      levelCode: p.standardsLevel || '',
      defectRate: rate(metric(STANDARD_KEYS.defectRate)),
      lateShipmentRate: rate(metric(STANDARD_KEYS.lateShipmentRate)),
      casesClosed: rate(metric(STANDARD_KEYS.casesClosed)),
    }
  })
}

async function serviceRows(token) {
  const types = [['ITEM_NOT_AS_DESCRIBED', 'Not as described'], ['ITEM_NOT_RECEIVED', 'Not received']]
  const all = await Promise.all(types.map(async ([type, label]) => {
    const evaluation = 'CURRENT'
    const res = await ebayGet(token, `/sell/analytics/v1/customer_service_metric/${type}/${evaluation}?evaluation_marketplace_id=${MARKETPLACE}`)
    return (res.dimensionMetrics || []).flatMap((d) => (d.metrics || []).map((m) => ({
      metric: label,
      category: d.dimension?.name || d.dimension?.value || '',
      rating: words(m.benchmark?.rating),
      ratingCode: m.benchmark?.rating || '',
      yourRate: rate(m.value),
      peerRate: rate(m.benchmark?.metadata?.average),
    })))
  }))
  return all.flat()
}

async function analytics(token, shop, { now = new Date() } = {}) {
  const list = await tables([
    {
      id: 'traffic',
      tab: 'Listing traffic',
      title: 'Listing traffic (last 30 days)',
      note: 'How many buyers saw each listing in search (impressions), opened it (views), and bought.',
      columns: [col('listingId', 'Item'), col('title', 'Product'), col('impressions', 'Impressions', 'number'), col('views', 'Page views', 'number'), col('ctr', 'Click-through %', 'number'), col('conversion', 'Conversion %', 'number'), col('sold', 'Sold', 'number'), col('url', '', 'link')],
      load: scopeAware(() => trafficRows(token, now), 'listing traffic'),
    },
    {
      id: 'standards',
      tab: 'Seller level',
      title: 'Seller level',
      columns: [col('program', 'Program'), col('cycle', 'Cycle'), col('level', 'Level', 'status'), col('defectRate', 'Defect rate'), col('lateShipmentRate', 'Late shipment rate'), col('casesClosed', 'Cases closed without resolution')],
      load: scopeAware(() => standardsRows(token), 'seller level'),
    },
    {
      id: 'service',
      tab: 'Seller level',
      title: 'Returns and not-received rates vs similar sellers',
      columns: [col('metric', 'Metric'), col('category', 'Category'), col('rating', 'Rating', 'status'), col('yourRate', 'Your rate'), col('peerRate', 'Similar sellers')],
      load: scopeAware(() => serviceRows(token), 'seller level'),
    },
  ])
  const rows = list[0].rows
  const total = (key) => rows.reduce((sum, r) => sum + r[key], 0)
  const impressions = total('impressions')
  const views = total('views')
  return {
    summary: list[0].error ? [] : [
      { tab: 'Listing traffic', label: 'Impressions', value: impressions, type: 'number' },
      { tab: 'Listing traffic', label: 'Page views', value: views, type: 'number' },
      { tab: 'Listing traffic', label: 'Click-through', value: impressions ? (views / impressions) * 100 : 0, type: 'percent' },
    ],
    tables: list,
  }
}

const metricValue = (v) => String(v && typeof v === 'object' ? v.value ?? '' : v ?? '')

/** Read-only drill-downs. */
analytics.details = {
  /** Every metric eBay rates for one seller-level program and cycle (id `PROGRAM|CYCLE`). */
  standards: async (token, shop, id) => {
    const [program, cycle] = String(id).split('|')
    if (!/^PROGRAM_[A-Z_]+$/.test(program || '') || !/^[A-Z_]+$/.test(cycle || '')) throw new HttpError(400, { error: 'Unknown seller level.' })
    const p = await ebayGet(token, `/sell/analytics/v1/seller_standards_profile/${program}/${cycle}`)
    return {
      title: `Seller level: ${words(program.replace(/^PROGRAM_/, ''))} (${words(cycle)})`,
      summary: [{ label: 'Level', value: words(p.standardsLevel), type: 'text' }],
      tables: [{
        id: 'metrics',
        title: 'Metrics',
        columns: [col('metric', 'Metric'), col('value', 'Value'), col('benchmark', 'Compared with eBay')],
        rows: (p.metrics || []).map((m) => ({ metric: words(m.metricKey), value: metricValue(m.value), benchmark: words(m.benchmark?.rating) })),
      }],
    }
  },
}

analytics.dailyTraffic = dailyTraffic

module.exports = analytics
