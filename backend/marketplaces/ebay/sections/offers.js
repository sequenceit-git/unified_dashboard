/** ebay "offers" section: its tables (subsections) for the shop section page. */
const { col, tables } = require('../../../services/marketplace/sectionKit')
const Listing = require('../../../models/Listing')
const Product = require('../../../models/Product')
const { ebayGet } = require('./helpers')
const trading = require('../trading')

/**
 * Title, SKU, your price (the listing's, else the product's) and cost for eBay item ids, so offers
 * can be shown against your price and margin.
 */
async function listingPrices(ids) {
  const aliases = ids.flatMap((id) => [String(id), `item-${id}`, `ebay-item-${id}`])
  const listings = await Listing.find({ marketplace: 'ebay', externalListingId: { $in: aliases } }).select('externalListingId productId price').lean()
  const products = await Product.find({ _id: { $in: listings.map((row) => row.productId) } }).select('title sku price basePrice costPrice').lean()
  const byId = new Map(products.map((row) => [String(row._id), row]))
  const usd = (v) => (v == null || !Number.isFinite(Number(v)) ? null : { value: Number(v), currency: 'USD' })
  return new Map(listings.map((row) => {
    const p = byId.get(String(row.productId)) || {}
    return [String(row.externalListingId || '').replace(/^(ebay-)?item-/, ''), { title: p.title || '', sku: p.sku || '', listPrice: usd(row.price ?? p.price ?? p.basePrice), cost: usd(p.costPrice) }]
  }))
}

async function offers(token) {
  const list = await tables([{
    id: 'bestOffers',
    tab: 'Best Offers',
    title: 'Best Offers from buyers',
    note: 'Offers buyers made on your listings. Accept, decline, or counter before they expire.',
    columns: [col('itemId', 'Item'), col('title', 'Product'), col('buyer', 'Buyer'), col('price', 'Offer', 'money'), col('quantity', 'Qty', 'number'), col('message', 'Message'), col('expires', 'Expires', 'date')],
    load: async () => {
      const found = await trading.getBestOffers(token)
      const prices = await listingPrices(found.map((o) => o.itemId)).catch(() => new Map())
      return found.map((offer) => {
        const known = prices.get(String(offer.itemId)) || {}
        const list = known.listPrice?.value
        return {
      ...offer,
      listPrice: known.listPrice || null,
      cost: known.cost || null,
      // How far the offer is below your price, in % (null when the price isn't known).
      belowPrice: list ? Math.round((1 - Number(offer.price?.value || 0) / list) * 100) : null,
      // Quantity rides along so a counter keeps the quantity the buyer asked for.
      id: `${offer.itemId}:${offer.offerId}:${offer.quantity || 1}`,
      actions: [
        { id: 'offer-accept', label: 'Accept', confirm: `Accept ${offer.buyer || 'the buyer'}'s offer on item ${offer.itemId}?` },
        { id: 'offer-decline', label: 'Decline', confirm: `Decline ${offer.buyer || 'the buyer'}'s offer on item ${offer.itemId}?` },
        { id: 'offer-counter', label: 'Counter', input: { label: `Counter price (${offer.price?.currency || 'USD'})`, type: 'number' } },
      ],
        }
      })
    },
  }, {
    id: 'eligible',
    tab: 'Send offers',
    title: 'Listings with interested buyers',
    note: 'Send targeted discount offers directly to buyers and watchers watching these items.',
    columns: [col('listingId', 'Item'), col('title', 'Product'), col('sku', 'SKU'), col('url', '', 'link')],
    load: async () => {
      const ids = (await ebayGet(token, '/sell/negotiation/v1/find_eligible_items?limit=200')).eligibleItems?.map((row) => row.listingId) || []
      const known = await listingPrices(ids).catch(() => new Map())
      return ids.map((id) => ({
        listingId: id,
        title: known.get(String(id))?.title || '',
        sku: known.get(String(id))?.sku || '',
        listPrice: known.get(String(id))?.listPrice || null,
        cost: known.get(String(id))?.cost || null,
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
