/** ebay "offers" section: its tables (subsections) for the shop section page. */
const { col, tables, listingTitles } = require('../../../services/marketplace/sectionKit')
const { ebayGet } = require('./helpers')

async function offers(token) {
  const list = await tables([{
    id: 'eligible',
    title: 'Listings with interested buyers',
    note: 'Send targeted discount offers directly to buyers and watchers watching these items.',
    columns: [col('listingId', 'Item'), col('title', 'Product'), col('sku', 'SKU'), col('url', '', 'link')],
    load: async () => {
      const ids = (await ebayGet(token, '/sell/negotiation/v1/find_eligible_items?limit=200')).eligibleItems?.map((row) => row.listingId) || []
      const titles = await listingTitles('ebay', ids)
      return ids.map((id) => ({
        listingId: id,
        title: titles.get(id)?.title || '',
        sku: titles.get(id)?.sku || '',
        url: `https://www.ebay.com/itm/${id}`,
      }))
    },
  }])
  return { summary: [{ label: 'Eligible listings', value: list[0].rows.length, type: 'number' }], tables: list }
}

module.exports = offers
