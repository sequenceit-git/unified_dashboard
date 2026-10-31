/**
 * Turns a product page link into an editable listing draft. eBay item links use the Browse API;
 * other pages are read from their structured data (JSON-LD, Open Graph). The AI then cleans the
 * details up, or looks the product up by web search when the site blocks the download.
 */

const dns = require('dns').promises
const net = require('net')
const OpenAI = require('openai')
const ebay = require('./marketplace/ebay')
const { getAiConfig } = require('./aiSettings')

const MAX_HTML_BYTES = 3 * 1024 * 1024
const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const lower = ip.toLowerCase()
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('::ffff:')
}

/** Only public http(s) pages; the server must not be pointed at its own network. */
async function checkUrl(raw) {
  let url
  try {
    url = new URL(String(raw || '').trim())
  } catch {
    throw new Error('Enter a full product link, starting with https://')
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https links are supported.')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) throw new Error('That link points to a private address.')
  const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => [])
  if (!addresses.length) throw new Error(`Could not find the website ${url.hostname}.`)
  if (addresses.some(({ address }) => privateAddress(address))) throw new Error('That link points to a private address.')
  return url
}

const decode = (value) => String(value ?? '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  .trim()

const pageText = (html) => decode(String(html || '')
  .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim()

function metaTags(html) {
  const meta = {}
  for (const tag of String(html).match(/<meta\b[^>]*>/gi) || []) {
    const key = tag.match(/(?:property|name|itemprop)=["']([^"']+)["']/i)?.[1]?.toLowerCase()
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
    if (key && content && !meta[key]) meta[key] = decode(content)
  }
  return meta
}

function jsonLdProduct(html) {
  const blocks = String(html).match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []
  const stack = []
  for (const block of blocks) {
    try {
      stack.push(JSON.parse(block.replace(/^<script[^>]*>|<\/script>$/gi, '').trim()))
    } catch {}
  }
  while (stack.length) {
    const node = stack.pop()
    if (Array.isArray(node)) stack.push(...node)
    else if (node && typeof node === 'object') {
      const type = [].concat(node['@type'] || [])
      if (type.some((t) => /^ProductGroup$/i.test(t))) {
        const variant = [].concat(node.hasVariant || [])[0] || {}
        return { ...variant, ...node, image: node.image || variant.image, offers: node.offers || variant.offers }
      }
      if (type.some((t) => /^Product$/i.test(t))) return node
      if (node['@graph']) stack.push(node['@graph'])
    }
  }
  return null
}

function imageList(value) {
  return [].concat(value || []).map((item) => (typeof item === 'string' ? item : item?.url || item?.contentUrl)).filter(Boolean)
}

/** Turns a spec from JSON-LD, a table or the AI into a plain string. Objects otherwise show up blank in the form. */
function flattenValue(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return decode(value)
  if (Array.isArray(value)) return value.map(flattenValue).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    return flattenValue(value.value ?? value.minValue ?? value.valueReference ?? value.text ?? value.name)
  }
  return ''
}

/** Accepts `{ Brand: "Mainstays" }`, `{ Brand: { value: "Mainstays" } }` or `[{ name, value }]`. Drops empty values. */
function normalizeAttributes(raw) {
  const out = {}
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const name = decode(row?.name || row?.key || row?.attribute || '')
      const value = flattenValue(row?.value ?? row?.values)
      if (name && value) out[name] = value
    }
    return out
  }
  if (!raw || typeof raw !== 'object') return out
  for (const [name, value] of Object.entries(raw)) {
    const flat = flattenValue(value)
    if (name && flat) out[decode(name)] = flat
  }
  return out
}

function tableSpecs(html) {
  const attrs = {}
  for (const table of String(html).match(/<table\b[\s\S]*?<\/table>/gi) || []) {
    if (!/spec|detail|product|attribute|feature|info/i.test(table)) continue
    for (const row of table.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
      const cells = [...row.matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
        .map((match) => decode(match[2].replace(/<[^>]+>/g, ' ')))
        .filter(Boolean)
      if (cells.length >= 2 && cells[0].length < 48 && cells[1].length < 120) attrs[cells[0]] = cells[1]
    }
  }
  return attrs
}

/** Specs buried in the page's own JSON (Walmart, Target, many brand stores). */
function embeddedSpecs(html) {
  const attrs = {}
  const blobs = [
    String(html).match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1],
    ...[...String(html).matchAll(/"specifications"\s*:\s*(\[[\s\S]*?\])/g)].map((match) => match[1]),
    ...[...String(html).matchAll(/"productAttributes"\s*:\s*(\[[\s\S]*?\])/g)].map((match) => match[1]),
  ].filter(Boolean)
  const visit = (node, depth = 0) => {
    if (!node || depth > 8) return
    if (Array.isArray(node)) {
      const looksLikeSpecs = node.length && node.every((row) => row && typeof row === 'object' && (row.name || row.key) && (row.value != null || row.values))
      if (looksLikeSpecs) Object.assign(attrs, normalizeAttributes(node))
      else node.slice(0, 40).forEach((item) => visit(item, depth + 1))
      return
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (/^(specifications|productAttributes|keyFeatures|additionalProperty)$/i.test(key)) Object.assign(attrs, normalizeAttributes(value))
        else if (value && typeof value === 'object') visit(value, depth + 1)
      }
    }
  }
  for (const blob of blobs) {
    try {
      visit(JSON.parse(blob))
    } catch {
      // Ignore half-cut JSON from the page.
    }
  }
  return attrs
}

function fromHtml(html, url) {
  const meta = metaTags(html)
  const product = jsonLdProduct(html) || {}
  const offer = [].concat(product.offers || [])[0] || {}
  const nestedOffer = [].concat(offer.offers || [])[0] || {}
  const attributes = {
    ...tableSpecs(html),
    ...embeddedSpecs(html),
    ...normalizeAttributes(product.additionalProperty),
  }
  if (product.color) attributes.Color = flattenValue(product.color)
  if (product.material) attributes.Material = flattenValue(product.material)
  if (product.model) attributes.Model = flattenValue(product.model)
  const amazon = /(^|\.)amazon\./i.test(url.hostname)
  const amazonTitle = amazon ? decode(String(html).match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/i)?.[1]) : ''
  const amazonPrice = amazon ? String(html).match(/"priceAmount":\s*([\d.]+)/)?.[1] : null
  const amazonImages = amazon ? [...String(html).matchAll(/"hiRes":"(https:[^"]+)"/g)].map((match) => match[1]) : []
  const title = decode(amazonTitle || product.name || meta['og:title'] || meta['twitter:title'] || String(html).match(/<title[^>]*>([^<]*)/i)?.[1])
  const price = Number(offer.price || offer.lowPrice || nestedOffer.price || amazonPrice || meta['product:price:amount'] || meta['og:price:amount'] || 0)
  return {
    title,
    description: decode(product.description || meta['og:description'] || meta.description),
    brand: decode(product.brand?.name || product.brand || meta['product:brand'] || ''),
    price: price > 0 ? price : null,
    currency: offer.priceCurrency || meta['product:price:currency'] || 'USD',
    images: [...imageList(product.image), ...amazonImages, ...imageList(meta['og:image:secure_url']), ...imageList(meta['og:image'])]
      .map((src) => { try { return new URL(src, url).href.replace(/^http:\/\//i, 'https://') } catch { return null } })
      .filter((src) => src && /^https:/i.test(src)),
    sku: product.sku ? String(product.sku) : '',
    gtin: String(product.gtin13 || product.gtin12 || product.gtin || ''),
    condition: /used/i.test(offer.itemCondition || '') ? 'USED_GOOD' : 'NEW',
    category: decode(product.category || ''),
    attributes,
  }
}

async function fromEbayItem(url) {
  const itemId = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,})/)?.[1]
  if (!itemId) return null
  const token = await ebay.getApplicationToken().catch(() => null)
  if (!token) return null
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${itemId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
  })
  if (!res.ok) return null
  const item = await res.json()
  const attributes = normalizeAttributes(
    (item.localizedAspects || []).map((aspect) => ({ name: aspect.name, value: aspect.value ?? aspect.values })),
  )
  return {
    title: item.title || '',
    description: pageText(item.description || item.shortDescription || ''),
    brand: item.brand || attributes.Brand || '',
    price: Number(item.price?.value) || null,
    currency: item.price?.currency || 'USD',
    images: [item.image?.imageUrl, ...(item.additionalImages || []).map((img) => img.imageUrl)].filter(Boolean),
    sku: '',
    gtin: item.gtin || '',
    condition: /used/i.test(item.condition || '') ? 'USED_GOOD' : 'NEW',
    category: item.categoryPath || '',
    attributes,
  }
}

async function download(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    let current = url
    let res
    for (let hop = 0; hop < 5; hop += 1) {
      res = await fetch(current.href, { headers: BROWSER_HEADERS, redirect: 'manual', signal: controller.signal })
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
      if (!location) break
      current = await checkUrl(new URL(location, current).href)
    }
    if (!res.ok) return { blocked: true, status: res.status }
    const finalUrl = current
    const reader = res.body.getReader()
    const chunks = []
    let size = 0
    while (size < MAX_HTML_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
    reader.cancel().catch(() => {})
    return { html: Buffer.concat(chunks).toString('utf8'), url: finalUrl }
  } catch (err) {
    return { blocked: true, error: err.message }
  } finally {
    clearTimeout(timer)
  }
}

function aiFields(marketplace) {
  const titleMax = marketplace === 'ebay' ? 80 : marketplace === 'temu' ? 250 : 255
  const condition = marketplace === 'ebay'
    ? '\n  "condition": "NEW, LIKE_NEW, USED_GOOD or FOR_PARTS_OR_NOT_WORKING",'
    : ''
  return `{
  "title": "buyer-friendly listing title, at most ${titleMax} characters, no store names or promo words",
  "description": "plain-text description for a marketplace listing: a short intro, then key features one per line starting with '- '. No links, no mention of the source store",
  "brand": "brand name or Unbranded",${condition}
  "price": number or null,
  "attributes": { "Attribute name": "string value only, omit if unknown" },
  "category": "short category path, e.g. Health & Beauty > Fragrances",
  "images": ["direct image URLs, only if you found them"],
  "notes": "one sentence on anything the seller should double-check"
}`
}

function parseJson(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

/** Cleans up extracted details; with `searchWeb` it reads the product page through web search. */
const SHOP_HINT = {
  ebay: 'This listing is for eBay. Fill item specifics buyers filter by (Brand, Type, Color, Size, Material, Model, Capacity). Every value must be a string.',
  tiktok_shop: 'This listing is for TikTok Shop. Fill product attributes (Brand, Color, Model, Capacity, Material, Number of cups or pieces). Every value must be a string.',
  temu: 'This listing is for Temu. Keep attributes to the few facts printed on the page. Every value must be a string.',
}

async function aiDraft({ url, extracted, text, searchWeb, marketplace }) {
  const { apiKey, model } = await getAiConfig({ purpose: 'listing' })
  if (!apiKey) return null
  const client = new OpenAI({ apiKey })
  const facts = searchWeb
    ? `The page could not be downloaded. Look up this exact product page with web search and use only what it shows: ${url}`
    : `Details read from the page:\n${JSON.stringify(extracted).slice(0, 6000)}\n\nPage text (trimmed):\n${String(text || '').slice(0, 10000)}`
  const response = await client.responses.create({
    model,
    ...(searchWeb ? { tools: [{ type: 'web_search' }] } : {}),
    instructions: `You prepare marketplace listings from a product page. Use only facts from the page; never invent specifications. Copy item specifics that already have values, and omit any you cannot read. ${SHOP_HINT[marketplace] || ''} Reply with JSON only.`,
    input: `Product page: ${url}\n\n${facts}\n\nReturn this JSON:\n${aiFields(marketplace)}`,
  })
  return parseJson(response.output_text)
}

/** Returns an editable draft: `{ title, description, brand, price, images, attributes, ... , warnings }`. */
async function importProductFromUrl(rawUrl, { useAi = true, marketplace } = {}) {
  const url = await checkUrl(rawUrl)
  const warnings = []
  let extracted = null
  let text = ''
  let source = 'page'

  if (/(^|\.)ebay\.[a-z.]+$/i.test(url.hostname)) {
    extracted = await fromEbayItem(url).catch(() => null)
    if (extracted) source = 'ebay_api'
  }
  if (!extracted) {
    const page = await download(url)
    if (page.html) {
      extracted = fromHtml(page.html, page.url)
      text = pageText(page.html)
      if (!extracted.title) extracted = null
    } else {
      warnings.push(`${url.hostname} blocked the download${page.status ? ` (${page.status})` : ''}.`)
    }
  }

  let ai = null
  if (useAi) {
    try {
      ai = await aiDraft({ url: url.href, extracted, text, searchWeb: !extracted, marketplace })
      if (ai && !extracted) source = 'ai_web_search'
    } catch (err) {
      warnings.push(`AI clean-up failed: ${err.message}`)
    }
  }
  if (!extracted && !ai) {
    throw new Error(`Could not read product details from ${url.hostname}. ${warnings.join(' ')} Try the product's eBay or brand page, or add it by hand.`)
  }

  const base = extracted || {}
  const images = [...new Set([...(base.images || []), ...(Array.isArray(ai?.images) ? ai.images : [])])]
    .filter((src) => /^https:\/\//i.test(src))
    .slice(0, 12)
  if (!images.length) warnings.push('No product images were found. Add at least one before listing.')
  if (ai?.notes) warnings.push(String(ai.notes))

  const brand = String(ai?.brand || base.brand || 'Unbranded')
  const attributes = { ...normalizeAttributes(base.attributes), ...normalizeAttributes(ai?.attributes) }
  if (brand && !attributes.Brand) attributes.Brand = brand

  return {
    sourceUrl: url.href,
    source,
    aiUsed: Boolean(ai),
    title: String(ai?.title || base.title || '').slice(0, marketplace === 'ebay' ? 80 : marketplace === 'temu' ? 250 : 255),
    description: String(ai?.description || base.description || '').trim(),
    brand,
    condition: ['NEW', 'LIKE_NEW', 'USED_GOOD', 'FOR_PARTS_OR_NOT_WORKING'].includes(ai?.condition) ? ai.condition : base.condition || 'NEW',
    price: Number(ai?.price) > 0 ? Number(ai.price) : base.price || null,
    sourcePrice: base.price || null,
    currency: base.currency || 'USD',
    category: String(ai?.category || base.category || ''),
    gtin: base.gtin || '',
    images,
    attributes,
    warnings,
  }
}

/**
 * Maps known product facts onto a shop category's attribute schema.
 * Dropdown fields must use one of the listed values.
 */
async function fillShopAttributes({ title, description, brand, attributes, schema }) {
  const fields = (schema || []).filter((attr) => attr?.id && attr?.name)
  if (!fields.length) return {}
  const { apiKey, model } = await getAiConfig({ purpose: 'listing' })
  if (!apiKey) return {}
  const client = new OpenAI({ apiKey })
  const response = await client.responses.create({
    model,
    instructions: 'You fill marketplace category attributes from known product facts. Use only those facts. For a field with values, copy one listed value exactly. Omit anything you cannot support. Reply with JSON only: { "attributeId": "value" }.',
    input: JSON.stringify({
      title: title || '',
      brand: brand || '',
      description: String(description || '').slice(0, 4000),
      known: attributes || {},
      fields: fields.map((attr) => ({
        id: attr.id,
        name: attr.name,
        required: Boolean(attr.required),
        values: (attr.values || []).slice(0, 40),
      })),
    }),
  })
  const parsed = parseJson(response.output_text) || {}
  const allowed = new Map(fields.map((attr) => [String(attr.id), attr]))
  const next = {}
  for (const [id, value] of Object.entries(parsed)) {
    const attr = allowed.get(String(id))
    const text = String(value || '').trim()
    if (!attr || !text) continue
    if (attr.values?.length && !attr.freeText && !attr.values.includes(text)) {
      const compact = (item) => String(item).toLowerCase().replace(/[^a-z0-9]+/g, '')
      const match = attr.values.find((item) => compact(item) === compact(text))
      if (!match) continue
      next[attr.id] = match
      continue
    }
    next[attr.id] = text
  }
  return next
}

module.exports = { importProductFromUrl, fillShopAttributes }
