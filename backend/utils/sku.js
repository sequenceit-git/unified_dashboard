const crypto = require('crypto')

const PREFIX = { ebay: 'EBAY', tiktok_shop: 'TTS', temu: 'TEMU' }

/** e.g. EBAY-261031-4F9A2C or TTS-261031-4F9A2C: shop prefix, date, random part. Fits eBay's and TikTok's 50-character limit. */
function newSku(marketplace) {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  return `${PREFIX[marketplace] || 'EP'}-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

module.exports = { newSku }
