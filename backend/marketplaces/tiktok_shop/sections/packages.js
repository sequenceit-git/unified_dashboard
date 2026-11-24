/**
 * TikTok Shop "packages" section: packages with ship / label buttons (the page's own), a package
 * detail with its tracking events, and "Ship all ready packages" (batch ship, drop-off).
 */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttPost, ttGet } = require('./helpers')

// The same "ready" states the page's own Ship package button uses.
const READY = /awaiting_shipment|processing|packed/i
const BATCH = 50
const enc = encodeURIComponent

async function searchPackages(token, shop) {
  return (await ttPost(token, shop, '/fulfillment/202309/packages/search')).packages || []
}

/** Every package TikTok has waiting to ship (PROCESSING), following all pages. */
async function packagesToShip(token, shop) {
  const all = []
  let pageToken = ''
  for (let page = 0; page < 40; page += 1) {
    const res = await ttPost(token, shop, '/fulfillment/202309/packages/search', { package_status: 'PROCESSING' }, { page_size: 50, ...(pageToken ? { page_token: pageToken } : {}) })
    all.push(...(res.packages || []))
    pageToken = res.next_page_token || ''
    if (!pageToken) break
  }
  return all
}

async function packages(token, shop) {
  const list = await tables([{
    id: 'packages',
    title: 'Packages',
    columns: [col('id', 'Package'), col('orders', 'Orders'), col('status', 'Status', 'status'), col('carrier', 'Carrier'), col('tracking', 'Tracking'), col('created', 'Created', 'date')],
    load: async () => (await searchPackages(token, shop)).map((row) => ({
      id: row.id,
      packageId: row.id,
      orders: (row.orders || []).map((order) => order.id).join(', '),
      status: words(row.package_status || row.status),
      rawStatus: row.package_status || row.status || '',
      carrier: row.shipping_provider_name || '',
      tracking: row.tracking_number || '',
      created: seconds(row.create_time),
      actions: [{ id: 'package', label: 'Details', detail: true }],
    })),
  }])
  const ready = list[0].rows.filter((r) => READY.test(r.rawStatus)).length
  list[0].actions = [{ id: 'ship-all', label: 'Ship all ready packages', confirm: `Mark every package that is ready (${ready} now) as shipped by drop-off on TikTok Shop?` }]
  return {
    summary: [
      { label: 'Packages', value: list[0].rows.length, type: 'number' },
      { label: 'Ready to ship', value: ready, type: 'number' },
    ],
    tables: list,
  }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, summary, tables }`. */
packages.details = {
  /** A package and its order's tracking events, newest first. */
  package: async (token, shop, id) => {
    const pkg = await ttGet(token, shop, `/fulfillment/202309/packages/${enc(id)}`)
    const orderId = pkg.orders?.[0]?.id
    const tracking = orderId ? await ttGet(token, shop, `/fulfillment/202309/orders/${enc(orderId)}/tracking`).catch(() => ({ tracking: [] })) : { tracking: [] }
    return {
      title: `Package ${id}`,
      summary: [
        { label: 'Status', value: words(pkg.package_status), type: 'text' },
        { label: 'Carrier', value: pkg.shipping_provider_name || '—', type: 'text' },
        { label: 'Tracking', value: pkg.tracking_number || '—', type: 'text' },
        { label: 'Orders', value: (pkg.orders || []).map((o) => o.id).join(', ') || '—', type: 'text' },
      ],
      tables: [{
        id: 'tracking',
        title: 'Tracking events',
        columns: [col('time', 'When', 'date'), col('event', 'Event')],
        rows: (tracking.tracking || [])
          .map((t) => ({ time: t.update_time_millis ? new Date(Number(t.update_time_millis)).toISOString() : null, event: t.description || '' }))
          .sort((a, b) => String(b.time).localeCompare(String(a.time))),
      }],
    }
  },
}

/** Row and table actions: `actions[action](token, shop, id, value) → { message }`. */
packages.actions = {
  /** Ships every package TikTok has waiting to ship (asked again here, all pages, not taken from the page), 50 per call. */
  'ship-all': async (token, shop) => {
    const ready = (await packagesToShip(token, shop)).filter((p) => READY.test(p.package_status || p.status || 'PROCESSING')).map((p) => p.id)
    if (!ready.length) return { message: 'No packages are ready to ship.' }
    const failed = []
    for (let i = 0; i < ready.length; i += BATCH) {
      const res = await ttPost(token, shop, '/fulfillment/202309/packages/ship', { packages: ready.slice(i, i + BATCH).map((id) => ({ id, handover_method: 'DROP_OFF' })) }, {})
      for (const e of res.errors || []) failed.push(`${e.detail?.package_id || '?'} (${e.message || 'failed'})`)
    }
    const shipped = ready.length - failed.length
    return { message: `Shipped ${shipped} package${shipped === 1 ? '' : 's'}.${failed.length ? ` Not shipped: ${failed.join(', ')}.` : ''}` }
  },
}

module.exports = packages
