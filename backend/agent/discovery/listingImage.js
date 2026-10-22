const ebay = require('../../services/marketplace/ebay')

const LISTING_HOST = /(^|\.)(ebay\.com|amazon\.com|walmart\.com|temu\.com|tiktok\.com)$/i
const IMAGE_HOST = /(ebayimg\.com|media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com|walmartimages\.com|kwcdn\.com|ibyteimg\.com|tiktokcdn\.com)/i

function isDirectImage(url) {
  try {
    const parsed = new URL(url)
    if (!/^https?:$/i.test(parsed.protocol)) return false
    if (IMAGE_HOST.test(parsed.hostname)) return true
    return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(parsed.pathname)
  } catch {
    return false
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function imageUrlsFromHtml(html) {
  const found = []
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || []
  for (const tag of tags) {
    if (!/og:image|twitter:image/i.test(tag)) continue
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1]
    if (content) found.push(decodeHtml(content))
  }
  const cdn = String(html || '').match(/https?:\/\/[^"'\\\s>]*(?:ebayimg\.com|media-amazon\.com|walmartimages\.com|kwcdn\.com)[^"'\\\s>]*/gi) || []
  return [...found, ...cdn].filter(isDirectImage)
}

async function imagesFromListing(pageUrl) {
  let parsed
  try {
    parsed = new URL(pageUrl)
  } catch {
    return []
  }
  if (parsed.protocol !== 'https:' || !LISTING_HOST.test(parsed.hostname)) return []

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(parsed.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    if (!response.ok) return []
    const html = await response.text()
    const seen = new Set()
    const images = []
    for (const url of imageUrlsFromHtml(html)) {
      if (seen.has(url)) continue
      seen.add(url)
      images.push(url)
      if (images.length >= 4) break
    }
    return images
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

function ebayItemId(pageUrl) {
  const match = String(pageUrl || '').match(/\/itm\/(?:[^/]+\/)?(\d{9,})/i)
  return match ? match[1] : ''
}

let applicationToken
function ebayToken() {
  if (!applicationToken) applicationToken = ebay.getApplicationToken().catch(() => null)
  return applicationToken
}

async function ebayImages({ pages = [], title = '' }) {
  const token = await ebayToken()
  if (!token) return []

  const itemId = pages.map(ebayItemId).find(Boolean)
  if (itemId) {
    const item = await ebay.getItemDetails(token, itemId)
    const urls = [
      item?.image?.imageUrl,
      ...(item?.additionalImages || []).map((image) => image?.imageUrl),
    ].filter(isDirectImage).map((url) => url.replace(/\/s-l\d+\./i, '/s-l960.'))
    if (urls.length) return urls.slice(0, 4)
  }

  const query = String(title || '').trim()
  if (!query) return []
  const matches = await ebay.getMarketData(token, query, 5)
  const hit = matches.find((item) => isDirectImage(item.image))
  return hit ? [hit.image] : []
}

async function productImages({ hinted = [], pages = [], title = '' }) {
  const direct = []
  const seen = new Set()
  for (const value of hinted) {
    const url = typeof value === 'string' ? value.trim() : ''
    if (!isDirectImage(url) || seen.has(url)) continue
    seen.add(url)
    direct.push(url)
  }
  if (direct.length) return direct.slice(0, 4)

  const fromEbay = await ebayImages({ pages, title })
  if (fromEbay.length) return fromEbay

  for (const page of pages) {
    const found = await imagesFromListing(page)
    if (found.length) return found
  }
  return []
}

module.exports = {
  isDirectImage,
  productImages,
}
