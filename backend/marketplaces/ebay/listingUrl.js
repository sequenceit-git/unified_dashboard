/** eBay item page: https://www.ebay.com/itm/<item id>. A saved URL wins. */
function listingUrl(id, saved) {
  if (saved) return saved
  if (!id) return ''
  const itemId = id.replace(/^(ebay-)?item-/, '')
  return /^\d{9,}$/.test(itemId) ? `https://www.ebay.com/itm/${itemId}` : ''
}

module.exports = { listingUrl }
