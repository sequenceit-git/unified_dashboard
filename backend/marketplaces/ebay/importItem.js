const { cleanDescription } = require('./description')
const ebay = require('./service')

/** eBay item pages: matches(url) says whether the shared importer should ask eBay's Browse API. */
const matches = (url) => /(^|\.)ebay\.[a-z.]+$/i.test(url.hostname)

/**
 * Reads an eBay item through the Browse API. Returns raw details; the shared importer cleans the
 * description (HTML) and turns `attributes` ([{ name, value }]) into its attribute map.
 */
async function readItem(url) {
  const itemId = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/)?.[1]
  if (!itemId) return null
  const token = await ebay.getApplicationToken().catch(() => null)
  if (!token) return null
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${itemId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
  })
  if (!res.ok) return null
  const item = await res.json()
  return {
    title: item.title || '',
    description: cleanDescription(item.description || item.shortDescription || ''),
    brand: item.brand || '',
    price: Number(item.price?.value) || null,
    currency: item.price?.currency || 'USD',
    images: [item.image?.imageUrl, ...(item.additionalImages || []).map((img) => img.imageUrl)].filter(Boolean),
    sku: '',
    gtin: item.gtin || '',
    condition: /used/i.test(item.condition || '') ? 'USED_GOOD' : 'NEW',
    category: item.categoryPath || '',
    attributes: (item.localizedAspects || []).map((aspect) => ({ name: aspect.name, value: aspect.value ?? aspect.values })),
  }
}

module.exports = { matches, readItem, source: 'ebay_api' }
