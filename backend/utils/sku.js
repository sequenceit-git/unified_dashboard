const crypto = require('crypto')

const registry = require('../marketplaces')

/** The shop's SKU prefix (any spelling of the shop), or EP when there is no shop. */
function skuPrefix(marketplace) {
  const key = registry.canonical(marketplace)
  return (key && registry.get(key).skuPrefix) || 'EP'
}

/** e.g. EBAY-261031-4F9A2C or TTS-261031-4F9A2C: shop prefix, date, random part. Fits eBay's and TikTok's 50-character limit. */
function newSku(marketplace) {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '')
  return `${skuPrefix(marketplace)}-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

// SKUs a tool made up rather than a seller: our own draft SKUs and random IDs (UUIDs).
const MACHINE_SKU = [/^BOT-/i, /^EP-/i, /^EBAY-\d{6}-[A-F0-9]{6}$/i, /^TEMU-\d{6}-[A-F0-9]{6}$/i, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i]

const isMachineSku = (sku) => MACHINE_SKU.some((pattern) => pattern.test(String(sku || '').trim()))


module.exports = { skuPrefix, newSku, isMachineSku }
