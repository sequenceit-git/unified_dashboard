const CANONICAL = {
  ebay: 'ebay',
  tiktok: 'tiktok_shop',
  tiktok_shop: 'tiktok_shop',
  temu: 'temu',
}

function canonicalMarketplace(value) {
  if (!value || value === 'all') return null
  return CANONICAL[value] || null
}

module.exports = { canonicalMarketplace }
