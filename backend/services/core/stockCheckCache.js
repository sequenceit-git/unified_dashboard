/**
 * Cache key for a stock check's live marketplace reading (Temu/TikTok "SKU differs" banners).
 * Under `shop:<id>:` so every orders sync clears it; the listed ids are hashed in, so a new
 * listing gets a fresh reading straight away.
 */
const crypto = require('crypto')

const STOCK_CHECK_TTL = 2 * 60

function stockCheckKey(shopId, ids) {
  const hash = crypto.createHash('sha1').update(ids.join(',')).digest('hex').slice(0, 16)
  return `shop:${shopId}:stock-check:${hash}`
}

/** Drops the cached readings of these shops (after their stock changed). */
async function clearStockCheck(shopIds) {
  const cache = require('./cache')
  await Promise.all([...new Set(shopIds.filter(Boolean).map(String))].map((id) => cache.invalidate(`shop:${id}:stock-check`)))
}

module.exports = { STOCK_CHECK_TTL, stockCheckKey, clearStockCheck }
