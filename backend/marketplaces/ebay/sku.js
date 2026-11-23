const { isMachineSku } = require('../../utils/sku')

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

module.exports = { ebaySku }
