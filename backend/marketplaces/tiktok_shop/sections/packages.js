/**
 * TikTok Shop "packages" section: packages with ship / label / deliver / uncombine actions,
 * package detail (tracking events + handover time slots), "Ship all ready packages", and
 * combinable orders tab ("Combine orders").
 */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { HttpError } = require('../../../utils/httpError')
const { ttPost, ttGet, scopeAware } = require('./helpers')

// The same "ready" states the page's own Ship package button uses.
const READY = /awaiting_shipment|processing|packed/i
const DELIVERABLE = /in_transit|shipped/i
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

function rowActionsFor(row) {
  const raw = String(row.package_status || row.status || '')
  const actions = [{ id: 'package', label: 'Details', detail: true }]
  if ((row.orders || []).length > 1 && READY.test(raw)) {
    actions.push({ id: 'uncombine', label: 'Uncombine', confirm: 'Split this combined package back into separate packages per order?' })
  }
  if (DELIVERABLE.test(raw)) {
    actions.push({ id: 'deliver', label: 'Mark delivered', confirm: 'Mark this seller-shipped package as delivered on TikTok Shop?' })
  }
  return actions
}

async function packages(token, shop) {
  const list = await tables([
    {
      id: 'packages',
      tab: 'Packages',
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
        actions: rowActionsFor(row),
      })),
    },
    {
      id: 'combinable',
      tab: 'Combine orders',
      title: 'Eligible to combine into one package',
      note: 'Orders from the same buyer address that TikTok allows you to combine before printing labels.',
      columns: [col('id', 'Draft package'), col('orderCount', 'Orders count', 'number'), col('orders', 'Order IDs')],
      load: scopeAware(async () => (await ttGet(token, shop, '/fulfillment/202309/combinable_packages/search', { page_size: 50 })).combinable_packages?.map((row) => ({
        id: String(row.id),
        orderCount: (row.order_ids || []).length,
        orders: (row.order_ids || []).join(', '),
        orderIds: row.order_ids || [],
        actions: [{ id: 'combine', label: 'Combine package', confirm: `Combine orders ${(row.order_ids || []).join(', ')} into package ${row.id}?` }],
      })) || [], 'Package Split And Combine'),
    },
  ])
  const ready = list[0].rows.filter((r) => READY.test(r.rawStatus)).length
  list[0].actions = [{ id: 'ship-all', label: 'Ship all ready packages', confirm: `Mark every package that is ready (${ready} now) as shipped by drop-off on TikTok Shop?` }]
  list[1].actions = [{ id: 'combine-all', label: 'Combine all eligible', confirm: 'Combine all eligible multi-order groups on TikTok Shop?' }]
  return {
    summary: [
      { tab: 'Packages', label: 'Packages', value: list[0].rows.length, type: 'number' },
      { tab: 'Packages', label: 'Ready to ship', value: ready, type: 'number' },
      { tab: 'Combine orders', label: 'Combinable groups', value: list[1].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

/** Read-only drill-downs: `details[action](token, shop, id) → { title, summary, tables }`. */
packages.details = {
  /** A package, its order's tracking events newest first, and handover time slots when available. */
  package: async (token, shop, id) => {
    const [pkg, handover] = await Promise.all([
      ttGet(token, shop, `/fulfillment/202309/packages/${enc(id)}`),
      ttGet(token, shop, `/fulfillment/202309/packages/${enc(id)}/handover_time_slots`).catch(() => null),
    ])
    const orderId = pkg.orders?.[0]?.id
    const tracking = orderId ? await ttGet(token, shop, `/fulfillment/202309/orders/${enc(orderId)}/tracking`).catch(() => ({ tracking: [] })) : { tracking: [] }
    const detailTables = [{
      id: 'tracking',
      title: 'Tracking events',
      columns: [col('time', 'When', 'date'), col('event', 'Event')],
      rows: (tracking.tracking || [])
        .map((t) => ({ time: t.update_time_millis ? new Date(Number(t.update_time_millis)).toISOString() : null, event: t.description || '' }))
        .sort((a, b) => String(b.time).localeCompare(String(a.time))),
    }]
    if (handover?.pickup_slots?.length) {
      detailTables.push({
        id: 'handover',
        title: 'Handover pickup slots',
        columns: [col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
        rows: handover.pickup_slots.map((s) => ({ start: seconds(s.start_time), end: seconds(s.end_time) })),
      })
    }
    const methods = handover ? [handover.can_drop_off && 'Drop-off', handover.can_pickup && 'Pickup', handover.can_van_collection && 'Van'].filter(Boolean) : []
    return {
      title: `Package ${id}`,
      summary: [
        { label: 'Status', value: words(pkg.package_status), type: 'text' },
        { label: 'Carrier', value: pkg.shipping_provider_name || '—', type: 'text' },
        { label: 'Tracking', value: pkg.tracking_number || '—', type: 'text' },
        { label: 'Orders', value: (pkg.orders || []).map((o) => o.id).join(', ') || '—', type: 'text' },
        ...(methods.length ? [{ label: 'Handover methods', value: methods.join(', '), type: 'text' }] : []),
      ],
      tables: detailTables,
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

  /** Combines one eligible draft package group from TikTok's combinable search. */
  combine: scopeAware(async (token, shop, id) => {
    const { combinable_packages: groups = [] } = await ttGet(token, shop, '/fulfillment/202309/combinable_packages/search', { page_size: 50 })
    const match = groups.find((g) => String(g.id) === String(id))
    if (!match) throw new HttpError(404, { error: `Draft combine group ${id} is no longer available.` })
    const res = await ttPost(token, shop, '/fulfillment/202309/packages/combine', { combinable_packages: [{ id: String(match.id), order_ids: match.order_ids || [] }] }, {})
    if (res.errors?.length) throw new HttpError(400, { error: res.errors.map((e) => e.message).join('; ') })
    return { message: `Combined ${match.order_ids?.length || 0} orders into package ${res.packages?.[0]?.id || id}.` }
  }, 'Package Split And Combine'),

  /** Combines all eligible multi-order groups on TikTok Shop. */
  'combine-all': scopeAware(async (token, shop) => {
    const { combinable_packages: groups = [] } = await ttGet(token, shop, '/fulfillment/202309/combinable_packages/search', { page_size: 50 })
    if (!groups.length) return { message: 'No orders are eligible to combine right now.' }
    const res = await ttPost(token, shop, '/fulfillment/202309/packages/combine', { combinable_packages: groups.map((g) => ({ id: String(g.id), order_ids: g.order_ids || [] })) }, {})
    const failed = (res.errors || []).map((e) => `${e.detail?.package_id || '?'} (${e.message || 'failed'})`)
    const combined = (res.packages || []).length
    return { message: `Combined ${combined} package${combined === 1 ? '' : 's'}.${failed.length ? ` Failed: ${failed.join(', ')}.` : ''}` }
  }, 'Package Split And Combine'),

  /** Splits a combined package back into per-order packages. */
  uncombine: scopeAware(async (token, shop, id) => {
    const pkg = await ttGet(token, shop, `/fulfillment/202309/packages/${enc(id)}`)
    const orderIds = (pkg.orders || []).map((o) => String(o.id)).filter(Boolean)
    if (!orderIds.length) throw new HttpError(400, { error: `Package ${id} has no orders to uncombine.` })
    const res = await ttPost(token, shop, `/fulfillment/202309/packages/${enc(id)}/uncombine`, { order_ids: orderIds }, {})
    const count = (res.packages || []).length
    return { message: `Uncombined package ${id} into ${count || orderIds.length} package${count === 1 ? '' : 's'}.` }
  }, 'Package Split And Combine'),

  /** Marks a seller-shipped (SOF) package as delivered on TikTok Shop. */
  deliver: scopeAware(async (token, shop, id) => {
    const res = await ttPost(token, shop, '/fulfillment/202309/packages/deliver', { packages: [{ id: String(id), delivery_type: 'DELIVERY_SUCCESS' }] }, {})
    if (res.errors?.length) throw new HttpError(400, { error: res.errors.map((e) => e.message).join('; ') })
    return { message: `Marked package ${id} as delivered.` }
  }, 'Update Delivery Status'),
}

module.exports = packages
