/** ebay "offers" section: its tables (subsections) for the shop section page. */
const { col, tables, listingTitles } = require('../../../services/marketplace/sectionKit')
const { ebayGet } = require('./helpers')
const trading = require('../trading')

async function offers(token) {
  const list = await tables([{
    id: 'bestOffers',
    tab: 'Best Offers',
    title: 'Best Offers from buyers',
    note: 'Offers buyers made on your listings. Accept, decline, or counter before they expire.',
    columns: [col('itemId', 'Item'), col('title', 'Product'), col('buyer', 'Buyer'), col('price', 'Offer', 'money'), col('quantity', 'Qty', 'number'), col('message', 'Message'), col('expires', 'Expires', 'date')],
    load: async () => (await trading.getBestOffers(token)).map((offer) => ({
      ...offer,
      id: `${offer.itemId}:${offer.offerId}`,
      actions: [
        { id: 'offer-accept', label: 'Accept', confirm: `Accept ${offer.buyer || 'the buyer'}'s offer on item ${offer.itemId}?` },
        { id: 'offer-decline', label: 'Decline', confirm: `Decline ${offer.buyer || 'the buyer'}'s offer on item ${offer.itemId}?` },
        { id: 'offer-counter', label: 'Counter', input: { label: `Counter price (${offer.price?.currency || 'USD'})`, type: 'number' } },
      ],
    })),
  }, {
    id: 'eligible',
    tab: 'Send offers',
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
  return {
    summary: [
      { tab: 'Best Offers', label: 'Offers waiting', value: list[0].rows.length, type: 'number' },
      { tab: 'Send offers', label: 'Eligible listings', value: list[1].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = offers
