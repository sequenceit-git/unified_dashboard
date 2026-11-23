/** tiktok_shop "fulfillment" section: its tables (subsections) for the shop section page. */
const { seconds, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ttPost } = require('./helpers')

async function fulfillment(token, shop) {
  const list = await tables([{
    id: 'packages',
    title: 'Packages',
    columns: [col('id', 'Package'), col('orders', 'Orders'), col('status', 'Status', 'status'), col('carrier', 'Carrier'), col('tracking', 'Tracking'), col('created', 'Created', 'date')],
    load: async () => (await ttPost(token, shop, '/fulfillment/202309/packages/search')).packages?.map((row) => ({
      id: row.id,
      packageId: row.id,
      orders: (row.orders || []).map((order) => order.id).join(', '),
      status: words(row.package_status || row.status),
      rawStatus: row.package_status || row.status || '',
      carrier: row.shipping_provider_name || '',
      tracking: row.tracking_number || '',
      created: seconds(row.create_time),
    })) || [],
  }])
  return { summary: [{ label: 'Packages', value: list[0].rows.length, type: 'number' }], tables: list }
}

module.exports = fulfillment
