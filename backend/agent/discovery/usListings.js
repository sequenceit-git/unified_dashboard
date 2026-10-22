const ebay = require('../../services/marketplace/ebay')

const US_PLACES = [
  { id: 'ebay', label: 'eBay' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'walmart', label: 'Walmart' },
  { id: 'temu', label: 'Temu' },
]

function placeOf(url) {
  let parsed
  try {
    parsed = new URL(String(url || '').trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
  const path = `${parsed.pathname}${parsed.search}`

  if (host === 'ebay.com' && /\/itm\/(?:[^/]+\/)?\d{9,}/i.test(parsed.pathname)) return 'ebay'
  if (host === 'amazon.com' && /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(parsed.pathname)) return 'amazon'
  if (host === 'walmart.com' && /\/ip\/(?:[^/]+\/)?\d{5,}/i.test(parsed.pathname)) return 'walmart'
  if (host === 'temu.com' && /(?:goods\.html|[?&]goods_id=|-g-\d+)/i.test(path)) return 'temu'
  return null
}

function cleanUrl(url) {
  const parsed = new URL(String(url).trim())
  parsed.hash = ''
  parsed.protocol = 'https:'
  return parsed.href
}

async function ebayListingExists(url) {
  const itemId = String(url).match(/\/itm\/(?:[^/]+\/)?(\d{9,})/i)?.[1]
  if (!itemId) return false
  try {
    const token = await ebay.getApplicationToken()
    if (!token) return true
    const item = await ebay.getItemDetails(token, itemId)
    return Boolean(item && (item.title || item.itemId || item.image))
  } catch {
    return false
  }
}

async function pageExists(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 7000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    if (response.status === 404 || response.status === 410) return false
    if (response.status >= 500) return false
    return placeOf(response.url) != null || response.status === 200 || response.status === 403 || response.status === 429
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function validatedUsListings(links) {
  const candidates = []
  const seen = new Set()
  for (const link of links) {
    const raw = typeof link === 'string' ? link : link?.url
    const place = placeOf(raw)
    if (!place || seen.has(place)) continue
    seen.add(place)
    const amount = Number(link?.price)
    candidates.push({
      place,
      url: cleanUrl(raw),
      price: Number.isFinite(amount) ? amount : null,
    })
  }

  const checked = await Promise.all(candidates.map(async (link) => {
    const ok = link.place === 'ebay' ? await ebayListingExists(link.url) : await pageExists(link.url)
    if (!ok) return null
    const place = US_PLACES.find((item) => item.id === link.place)
    return {
      label: place.label,
      url: link.url,
      kind: 'listing',
      price: link.price,
    }
  }))

  return US_PLACES.map((place) => checked.find((link) => link?.label === place.label)).filter(Boolean)
}

module.exports = {
  US_PLACES,
  placeOf,
  validatedUsListings,
}
