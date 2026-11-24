/** Dashboard product titles for Temu goods ids. */
const Listing = require('../../../models/Listing')
const Product = require('../../../models/Product')

/** Dashboard titles of Temu goods ids (listings are "<goodsId>:<skuId>"). */
async function goodsTitles(shop, goodsIds) {
  if (!goodsIds.length) return new Map()
  // One anchored pattern per goods id (each can use the listing index), with or without a SKU part.
  const ids = [...new Set(goodsIds)].filter((g) => /^\d+$/.test(g))
  if (!ids.length) return new Map()
  const listings = await Listing.find({ shopId: shop?._id, marketplace: 'temu', externalListingId: { $in: ids.map((g) => new RegExp(`^${g}(:|$)`)) } }).select('externalListingId productId').lean()
  const products = await Product.find({ _id: { $in: listings.map((l) => l.productId) } }).select('title').lean()
  const byId = new Map(products.map((p) => [String(p._id), p.title]))
  return new Map(listings.map((l) => [String(l.externalListingId).split(':')[0], byId.get(String(l.productId)) || '']))
}

module.exports = goodsTitles
