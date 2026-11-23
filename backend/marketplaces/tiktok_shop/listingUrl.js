/**
 * TikTok Shop product IDs are US-shop IDs. Opening /shop/pdp/{id} from another country (e.g.
 * Bangladesh) is rewritten to that country's storefront and returns "Product ID is invalid", so
 * the US shop is locked with ?region=US. Drafts have no public page and open Seller Center.
 * A saved URL is ignored: it may be an old, wrong-region link.
 */
function listingUrl(id, saved, { status } = {}) {
  const productId = id.split(':')[0]
  if (!productId) return ''
  const publicPage = status === 'live' || status === 'out_of_stock'
  return publicPage
    ? `https://shop.tiktok.com/view/product/${productId}?region=US`
    : `https://seller-us.tiktok.com/product/edit?product_id=${productId}`
}

module.exports = { listingUrl }
