/** Temu goods page: https://www.temu.com/goods.html?goods_id=<goods id>. A saved URL wins. */
function listingUrl(id, saved) {
  if (saved) return saved
  const goodsId = id.split(':')[0]
  return /^\d+$/.test(goodsId) ? `https://www.temu.com/goods.html?goods_id=${goodsId}` : ''
}

module.exports = { listingUrl }
