const ebay = require('../../services/marketplace/ebay')

const US_PLACES = [
  { id: 'ebay', label: 'eBay' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'walmart', label: 'Walmart' },
  { id: 'temu', label: 'Temu' },
]

const ID_PATTERNS = {
  ebay: /\/itm\/(?:[^/]+\/)?(\d{9,})/i,
  amazon: /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i,
  walmart: /\/ip\/(?:[^/]+\/)?(\d{5,})/i,
  temu: /(?:[?&]goods_id=|-g-)(\d+)/i,
}

const NOT_FOUND = /page not found|couldn.t find (?:this|that) page|looking for something\?|no longer available|listing (?:was|has) ended|item not found|404 error/i
const BOT_WALL = /captcha|robot or human|enter the characters you see|verify you are a human|access denied|press (?:&amp;|&) hold/i
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'new', 'set', 'pack', 'pcs', 'inch', 'from', 'your', 'that', 'this', 'best', 'seller'])

/** US product page on ebay.com, amazon.com, walmart.com, or temu.com; anything else is null. */
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

  if (host === 'ebay.com' && ID_PATTERNS.ebay.test(parsed.pathname)) return 'ebay'
  if (host === 'amazon.com' && ID_PATTERNS.amazon.test(parsed.pathname)) return 'amazon'
  if (host === 'walmart.com' && ID_PATTERNS.walmart.test(parsed.pathname)) return 'walmart'
  if (host === 'temu.com' && /(?:goods\.html|[?&]goods_id=|-g-\d+)/i.test(path)) return 'temu'
  return null
}

/** Stable identity for a US product page, e.g. "ebay:267805925551" or "amazon:B0C1234567". */
function listingKey(url) {
  const place = placeOf(url)
  if (!place) return null
  const href = String(url).trim()
  const id = href.match(ID_PATTERNS[place])?.[1]
  return id ? `${place}:${id.toUpperCase()}` : `${place}:${href.split(/[?#]/)[0].toLowerCase()}`
}

function cleanUrl(url) {
  const parsed = new URL(String(url).trim())
  parsed.hash = ''
  parsed.protocol = 'https:'
  return parsed.href
}

function titleWords(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
    .slice(0, 6)
}

/** Gate G1: the page names the product, so a real URL for a different item is rejected. */
function namesProduct(text, title) {
  const words = titleWords(title)
  if (!words.length) return false
  const haystack = String(text || '').toLowerCase()
  const hits = words.filter((word) => haystack.includes(word)).length
  return hits >= Math.min(2, words.length)
}

let appToken = { value: null, expiresAt: 0 }

async function ebayToken() {
  if (appToken.value && Date.now() < appToken.expiresAt) return appToken.value
  const value = await ebay.getApplicationToken()
  appToken = { value, expiresAt: value ? Date.now() + 90 * 60000 : 0 }
  return value
}

async function ebayListingMatches(url, title) {
  const itemId = String(url).match(ID_PATTERNS.ebay)?.[1]
  if (!itemId) return false
  try {
    const token = await ebayToken()
    if (!token) return false
    const item = await ebay.getItemDetails(token, itemId)
    return Boolean(item?.title) && namesProduct(item.title, title)
  } catch {
    return false
  }
}

async function pageMatches(url, title) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    if (response.status !== 200) return false
    if (listingKey(response.url) !== listingKey(url)) return false
    const html = (await response.text()).slice(0, 400000)
    if (BOT_WALL.test(html.slice(0, 20000)) || NOT_FOUND.test(html.slice(0, 60000))) return false
    const pageTitle = [
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1],
    ].filter(Boolean).join(' ')
    return namesProduct(pageTitle || html, title)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Keeps at most one confirmed US product page per site, in the order given. A link survives
 * only when the page is live and names the product; unreachable, blocked, or mismatched pages are dropped.
 */
async function validatedUsListings(links, title) {
  const candidates = []
  const seen = new Set()
  for (const link of links) {
    const raw = typeof link === 'string' ? link : link?.url
    const key = listingKey(raw)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const amount = Number(link?.price)
    candidates.push({
      place: placeOf(raw),
      url: cleanUrl(raw),
      price: Number.isFinite(amount) ? amount : null,
    })
  }

  const checked = await Promise.all(candidates.map(async (link) => {
    const ok = link.place === 'ebay' ? await ebayListingMatches(link.url, title) : await pageMatches(link.url, title)
    return ok ? link : null
  }))

  return US_PLACES.map((place) => {
    const link = checked.find((item) => item?.place === place.id)
    return link ? { label: place.label, url: link.url, kind: 'listing', price: link.price } : null
  }).filter(Boolean)
}

module.exports = {
  placeOf,
  listingKey,
  validatedUsListings,
}
