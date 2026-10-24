const ebay = require('../../services/marketplace/ebay')

/** US marketplaces the agent may search, in display order, with the product-page shape the model must return. */
const US_PLACES = [
  { id: 'ebay', label: 'eBay', domain: 'ebay.com', page: 'ebay.com/itm/<id>' },
  { id: 'amazon', label: 'Amazon', domain: 'amazon.com', page: 'amazon.com/dp/<ASIN>' },
  { id: 'walmart', label: 'Walmart', domain: 'walmart.com', page: 'walmart.com/ip/<id>' },
  { id: 'temu', label: 'Temu', domain: 'temu.com', page: 'temu.com goods page (US site, no country path such as /uk/)' },
  { id: 'tiktok', label: 'TikTok Shop', domain: 'tiktok.com', page: 'tiktok.com/shop/pdp/<slug>/<id> or shop.tiktok.com/view/product/<id>?region=US' },
  { id: 'etsy', label: 'Etsy', domain: 'etsy.com', page: 'etsy.com/listing/<id> (no country path such as /uk/)' },
  { id: 'wish', label: 'Wish', domain: 'wish.com', page: 'wish.com/product/<id>' },
]

const US_DOMAINS = US_PLACES.map((place) => place.domain)
const PLACE_IDS = US_PLACES.map((place) => place.id)

const ID_PATTERNS = {
  ebay: /\/itm\/(?:[^/]+\/)?(\d{9,})/i,
  amazon: /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i,
  walmart: /\/ip\/(?:[^/]+\/)?(\d{5,})/i,
  temu: /(?:[?&]goods_id=|-g-)(\d+)/i,
  tiktok: /\/(?:shop\/pdp\/(?:[^/]+\/)?|view\/product\/)(\d{10,})/i,
  etsy: /\/listing\/(\d{6,})/i,
  wish: /\/product\/([a-f0-9]{24})/i,
}

const COUNTRY_PATH = /^\/[a-z]{2}(?:-[a-z]{2})?\//i

/**
 * Shopify, the eighth shop. Each Shopify store runs on its own domain, so a store page is
 * recognised by Shopify's markup, not by its URL.
 */
const STOREFRONTS = [
  { id: 'shopify', label: 'Shopify', mark: /cdn\.shopify\.com|Shopify\.theme|shopify-section/i },
]

const MAX_STORE_SOURCES = 1
const MARKETPLACE_HOST = /(?:^|\.)(?:ebay|amazon|walmart|temu|tiktok|etsy|wish|aliexpress|alibaba)\.[a-z.]+$/i
const US_FRIENDLY_TLDS = new Set(['us', 'co', 'io'])
const STORE_NON_PRODUCT = /^\/(?:$|search|collections\/?$|cart|account|blogs?\/|pages\/|policies\/)|[?&](?:q|s|search)=/i
const PRODUCT_SCHEMA = /"@type"\s*:\s*\[?\s*"Product"|property=["']og:type["'][^>]*content=["'](?:og:)?product/i
const USD_PRICE = /"priceCurrency"\s*:\s*"USD"|(?:og|product):price:currency["'][^>]*content=["']USD|Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"USD"/i

const NOT_FOUND = /page not found|couldn.t find (?:this|that) page|looking for something\?|no longer available|listing (?:was|has) ended|item not found|404 error/i
const BOT_WALL = /captcha|robot or human|enter the characters you see|verify you are a human|access denied|press (?:&amp;|&) hold/i
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'new', 'set', 'pack', 'pcs', 'inch', 'from', 'your', 'that', 'this', 'best', 'seller'])

/** Product page on one of the US marketplaces in US_PLACES; other sites, countries, and search pages are null. */
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
  if (host === 'temu.com' && !COUNTRY_PATH.test(parsed.pathname) && /(?:goods\.html|[?&]goods_id=|-g-\d+)/i.test(path)) return 'temu'
  if (host === 'tiktok.com' && /^\/shop\/pdp\//i.test(parsed.pathname) && ID_PATTERNS.tiktok.test(parsed.pathname)) return 'tiktok'
  if (host === 'shop.tiktok.com' && parsed.searchParams.get('region')?.toUpperCase() === 'US' && ID_PATTERNS.tiktok.test(parsed.pathname)) return 'tiktok'
  if (host === 'etsy.com' && !COUNTRY_PATH.test(parsed.pathname) && ID_PATTERNS.etsy.test(parsed.pathname)) return 'etsy'
  if (host === 'wish.com' && ID_PATTERNS.wish.test(parsed.pathname)) return 'wish'
  return null
}

/** Host of a possible independent-store product page (not a marketplace, not a non-US country domain). */
function storeHostOf(url) {
  let parsed
  try {
    parsed = new URL(String(url || '').trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
  const tld = host.split('.').pop()
  if (!host.includes('.') || MARKETPLACE_HOST.test(host)) return null
  if (tld.length === 2 && !US_FRIENDLY_TLDS.has(tld)) return null
  if (STORE_NON_PRODUCT.test(`${parsed.pathname}${parsed.search}`)) return null
  return host
}

/** Stable identity for a US product page, e.g. "ebay:267805925551" or "amazon:B0C1234567". */
function listingKey(url) {
  const place = placeOf(url)
  if (!place) {
    const host = storeHostOf(url)
    if (!host) return null
    return `store:${host}${new URL(String(url).trim()).pathname.replace(/\/+$/, '').toLowerCase()}`
  }
  const href = String(url).trim()
  const id = href.match(ID_PATTERNS[place])?.[1]
  return id ? `${place}:${id.toUpperCase()}` : `${place}:${href.split(/[?#]/)[0].toLowerCase()}`
}

function cleanUrl(url) {
  const parsed = new URL(String(url).trim())
  parsed.hash = ''
  if (placeOf(parsed.href) === 'tiktok' && parsed.hostname === 'shop.tiktok.com') {
    parsed.search = '?region=US'
  }
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

/** Live HTML of a page that stayed on the same listing after redirects and is not a bot wall or not-found page. */
async function loadPage(url, maxChars) {
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
    if (response.status !== 200) return null
    if (listingKey(response.url) !== listingKey(url)) return null
    const html = (await response.text()).slice(0, maxChars)
    if (BOT_WALL.test(html.slice(0, 20000)) || NOT_FOUND.test(html.slice(0, 60000))) return null
    return html
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function pageTitleOf(html) {
  return [
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1],
  ].filter(Boolean).join(' ')
}

async function pageMatches(url, title) {
  const html = await loadPage(url, 400000)
  return Boolean(html) && namesProduct(pageTitleOf(html) || html, title)
}

/** Platform of a live US Shopify store product page that names the product, or null. */
async function storefrontMatch(url, title) {
  const html = await loadPage(url, 1500000)
  if (!html || !PRODUCT_SCHEMA.test(html) || !USD_PRICE.test(html)) return null
  if (!namesProduct(pageTitleOf(html), title)) return null
  return STOREFRONTS.find((platform) => platform.mark.test(html)) || null
}

/**
 * Confirmed US product pages, in display order: at most one per marketplace, then up to
 * MAX_STORE_SOURCES Shopify store. A link survives only when
 * the page is live and names the product; unreachable, blocked, or mismatched pages are dropped.
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
      host: storeHostOf(raw),
      url: cleanUrl(raw),
      price: Number.isFinite(amount) ? amount : null,
    })
  }

  const checked = await Promise.all(candidates.map(async (link) => {
    if (link.place === 'ebay') return (await ebayListingMatches(link.url, title)) ? link : null
    if (link.place) return (await pageMatches(link.url, title)) ? link : null
    const platform = await storefrontMatch(link.url, title)
    return platform ? { ...link, place: platform.id, label: `${platform.label} store · ${link.host}` } : null
  }))

  const marketplaces = US_PLACES.map((place) => {
    const link = checked.find((item) => item?.place === place.id && !item.host)
    return link ? { place: place.id, label: place.label, url: link.url, kind: 'listing', price: link.price } : null
  }).filter(Boolean)

  const stores = []
  for (const link of checked) {
    if (!link?.host || stores.length >= MAX_STORE_SOURCES || stores.some((store) => store.host === link.host)) continue
    stores.push(link)
  }

  return [
    ...marketplaces,
    ...stores.map((link) => ({ place: link.place, label: link.label, url: link.url, kind: 'store', price: link.price })),
  ]
}

module.exports = {
  US_PLACES,
  US_DOMAINS,
  PLACE_IDS,
  placeOf,
  listingKey,
  validatedUsListings,
}
