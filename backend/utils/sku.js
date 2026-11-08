const crypto = require('crypto')

const PREFIX = { ebay: 'EBAY', tiktok_shop: 'TTS', temu: 'TEMU' }

/** e.g. EBAY-261031-4F9A2C or TTS-261031-4F9A2C: shop prefix, date, random part. Fits eBay's and TikTok's 50-character limit. */
function newSku(marketplace) {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  return `${PREFIX[marketplace] || 'EP'}-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

// SKUs a tool made up rather than a seller: our own draft SKUs and random IDs (UUIDs).
const MACHINE_SKU = [/^BOT-/i, /^EP-/i, /^EBAY-\d{6}-[A-F0-9]{6}$/i, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i]

const isMachineSku = (sku) => MACHINE_SKU.some((pattern) => pattern.test(String(sku || '').trim()))

/**
 * The dashboard SKU for an eBay item: EBAY-<item ID>, unless the seller gave it a real SKU of
 * their own on eBay, which is kept. `raw` is eBay's SKU field, `itemId` the eBay item number.
 */
function ebaySku(raw, itemId) {
  const sku = String(raw || '').trim()
  const id = String(itemId || '').trim()
  if (/^\d+$/.test(sku)) return `EBAY-${sku}`
  if (/^EB-/i.test(sku)) return sku.replace(/^EB-/i, 'EBAY-')
  if (sku && !isMachineSku(sku)) return sku
  return id ? `EBAY-${id}` : sku
}

module.exports = { newSku, ebaySku, isMachineSku }
