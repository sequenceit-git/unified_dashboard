/** Shared value helpers for this shop (moved from the service file). */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { safeFetch } = require('../../utils/safeUrl')

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads')

const ORDER_STATUS = {
  UNPAID: 'pending',
  ON_HOLD: 'processing',
  AWAITING_SHIPMENT: 'paid',
  AWAITING_COLLECTION: 'processing',
  PARTIALLY_SHIPPING: 'processing',
  IN_TRANSIT: 'shipped',
  DELIVERED: 'delivered',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
}

function plainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function categoryPath(chains) {
  return (chains || []).map((row) => row.local_name).filter(Boolean).join(' / ')
}

function toPounds(weight) {
  const value = Number(weight?.value)
  if (!Number.isFinite(value)) return null
  const unit = String(weight.unit || 'POUND').toUpperCase()
  if (unit.startsWith('KILO')) return Math.round(value * 2.20462 * 100) / 100
  if (unit === 'GRAM') return Math.round(value * 0.00220462 * 100) / 100
  return value
}

function toInches(dimensions) {
  if (!dimensions) return null
  const factor = String(dimensions.unit || 'INCH').toUpperCase().startsWith('CENT') ? 0.393701 : 1
  const num = (key) => {
    const value = Number(dimensions[key])
    return Number.isFinite(value) ? Math.round(value * factor * 100) / 100 : null
  }
  const length = num('length')
  const width = num('width')
  const height = num('height')
  if (length == null && width == null && height == null) return null
  return { length, width, height, unit: 'in' }
}

function attributeMap(rows) {
  const attributes = {}
  for (const row of rows || []) {
    const value = (row.values || []).map((item) => item.name).filter(Boolean).join(', ')
    if (row.name && value) attributes[row.name] = value
  }
  return attributes
}

function imageUrls(images) {
  const urls = []
  for (const image of images || []) {
    const url = image?.url || image?.urls?.[0] || image?.thumb_urls?.[0]
    if (url && !urls.includes(url)) urls.push(url)
  }
  return urls.slice(0, 8)
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function nextDate(value) {
  const date = new Date(value)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function amountOf(value) {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  if (value.overall) return amountOf(value.overall)
  return Number(value.amount || 0)
}

const LISTING_STATUS = {
  ACTIVATE: 'live',
  PENDING: 'pending',
  DRAFT: 'paused',
  FAILED: 'error',
  SELLER_DEACTIVATED: 'paused',
  PLATFORM_DEACTIVATED: 'paused',
  FREEZE: 'paused',
  DELETED: 'ended',
}

const NOT_SUBMITTED = {
  PAYMENT_ACCOUNT_NOT_LINKED: 'No payment account is linked to the shop.',
  SHOP_INACTIVE: 'The shop is inactive.',
  W8_NOT_CONFIGURED: 'W-8 tax information has not been provided.',
}

const PRE_APPROVED = {
  KYC_PENDING: 'Seller KYC onboarding is incomplete.',
  RESTRICTED_CATEGORY_PENDING: 'This category needs qualification approval in Seller Center.',
}

function auditReason(detail, tiktokStatus) {
  const audit = detail?.audit || {}
  const fails = detail?.audit_failed_reasons || audit.audit_failed_reasons || []
  const failText = fails
    .flatMap((row) => [...(row.reasons || []), ...(row.suggestions || [])])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
  const blocked = (audit.not_submitted_reasons || []).map((code) => NOT_SUBMITTED[code] || code)
  const pending = (audit.pre_approved_reasons || []).map((code) => PRE_APPROVED[code] || code)
  if (tiktokStatus === 'FAILED' || audit.status === 'FAILED') {
    return failText || 'TikTok Shop rejected this product in review, or cancelled the audit.'
  }
  if (tiktokStatus === 'DRAFT') {
    return [...blocked, failText].filter(Boolean).join(' ')
      || 'TikTok Shop saved this as a draft. It is not in review. Publish it after you fix the missing details.'
  }
  if (audit.status === 'PRE_APPROVED') {
    return pending.join(' ') || 'TikTok approved the listing but it is waiting on a shop prerequisite before it can go live.'
  }
  return ''
}

/** Customer-service message `content` is a JSON string; only text-like types carry readable words. */
function chatMessage(row) {
  let text = ''
  try {
    const content = JSON.parse(row.content || '{}')
    text = content.content || (content.product_id ? `[Product ${content.product_id}]` : content.order_id ? `[Order ${content.order_id}]` : '')
  } catch {
    text = String(row.content || '')
  }
  if (!text && row.type) text = `[${String(row.type).toLowerCase().replace(/_/g, ' ')}]`
  const role = String(row.sender?.role || '').toUpperCase()
  const fromBuyer = role === 'BUYER'
  return {
    externalMessageId: String(row.id),
    text,
    direction: fromBuyer ? 'inbound' : 'outbound',
    senderType: fromBuyer ? 'customer' : role === 'ROBOT' ? 'ai' : 'agent',
    sentAt: row.create_time ? new Date(Number(row.create_time) * 1000) : new Date(),
    textMessage: !row.type || row.type === 'TEXT',
  }
}

function extractDistrict(districtInfo, levels = [], names = []) {
  const rows = Array.isArray(districtInfo) ? districtInfo : []
  for (const level of levels) {
    const hit = rows.find((row) => String(row.address_level || '').toUpperCase() === level)
    if (hit?.address_name) return hit.address_name
  }
  for (const name of names) {
    const hit = rows.find((row) => new RegExp(name, 'i').test(String(row.address_level_name || '')))
    if (hit?.address_name) return hit.address_name
  }
  return ''
}

function assertNoBatchErrors(data, fallbackMsg = 'TikTok Shop request failed') {
  const errors = Array.isArray(data?.errors) ? data.errors : []
  if (!errors.length) return data
  const first = errors[0] || {}
  const extra = (first.detail?.extra_errors || [])
    .map((e) => e.message || (e.code ? `code ${e.code}` : ''))
    .filter(Boolean)
  const msg = [first.message || fallbackMsg, ...extra].filter(Boolean).join(': ')
  const err = new Error(msg)
  err.code = first.code
  err.batchErrors = errors
  throw err
}

function normalizeSellerSku(sku, fallbackPrefix = 'TTS') {
  const cleaned = String(sku || '').trim().replace(/\s+/g, '-').slice(0, 50)
  return cleaned || `${fallbackPrefix}-${Date.now()}`
}

function normalizeOrder(order) {
  const addr = order.recipient_address
  const districts = addr?.district_info
  const trackedLine = (order.line_items || []).find((li) => li.tracking_number)
  const carrierLine = trackedLine?.shipping_provider_name
    ? trackedLine
    : (order.line_items || []).find((li) => li.shipping_provider_name)
  return {
    externalOrderId: order.id,
    placedAt: order.create_time ? new Date(order.create_time * 1000) : new Date(),
    status: ORDER_STATUS[order.status] || 'pending',
    marketplaceStatus: order.status || undefined,
    shippingType: order.shipping_type || undefined,
    packageIds: (order.packages || []).map((p) => p.id).filter(Boolean),
    buyer: {
      name: addr?.name || order.user_id || 'TikTok Shop customer',
      username: order.buyer_nickname || order.user_id || '',
      email: order.buyer_email || '',
      phone: addr?.phone_number || '',
    },
    shippingAddress: addr ? {
      street: addr.address_line1 || addr.full_address || '',
      city: addr.city || addr.post_town || extractDistrict(districts, ['L3', 'L2'], ['city', 'town', 'county']),
      state: addr.state || extractDistrict(districts, ['L1'], ['state', 'province']),
      zip: addr.postal_code || '',
      country: addr.region_code || 'US',
    } : undefined,
    shipping: {
      carrier: order.shipping_provider || order.shipping_provider_name || order.packages?.[0]?.shipping_provider_name || carrierLine?.shipping_provider_name || undefined,
      trackingNumber: order.tracking_number || order.packages?.[0]?.tracking_number || trackedLine?.tracking_number || undefined,
      shippedAt: order.rts_time ? new Date(order.rts_time * 1000) : undefined,
      deliveredAt: order.delivery_time ? new Date(order.delivery_time * 1000) : undefined,
    },
    totals: {
      total: Number(order.payment?.total_amount || 0),
      currency: order.payment?.currency || 'USD',
    },
    items: (order.line_items || []).map((item) => {
      const rawSku = item.seller_sku && !/^none$/i.test(String(item.seller_sku).trim()) ? String(item.seller_sku).trim() : ''
      const extId = item.product_id ? (item.sku_id ? `${item.product_id}:${item.sku_id}` : String(item.product_id)) : undefined
      const cleanSku = rawSku
        ? (/^\d+$/.test(rawSku) ? `TTS-${rawSku}` : rawSku.startsWith('TT-') ? rawSku.replace(/^TT-/, 'TTS-') : rawSku)
        : (item.sku_id ? `TTS-${item.sku_id}` : (extId ? `TTS-${extId}` : ''))
      return {
        sku: cleanSku,
        rawSku,
        lineItemId: item.id ? String(item.id) : undefined,
        skuId: item.sku_id ? String(item.sku_id) : undefined,
        title: item.product_name || item.sku_name,
        quantity: 1,
        unitPrice: Number(item.sale_price || 0),
        image: item.sku_image || undefined,
        externalListingId: extId,
      }
    }),
  }
}

const CARRIER_ALIASES = {
  usps: ['usps', 'united states postal', 'postal service'],
  ups: ['ups', 'united parcel'],
  fedex: ['fedex', 'federal express'],
  dhl: ['dhl'],
  ontrac: ['ontrac', 'lasership'],
}

const IDENTIFIER_PATTERNS = {
  GTIN: /^\d{14}$/,
  EAN: /^(\d{8}|\d{13}|\d{14})$/,
  UPC: /^\d{12}$/,
  ISBN: /^(\d{13}|\d{8}X)$/,
  JAN: /^(\d{8}|\d{13})$/,
}

function validateIdentifierCode(idObj) {
  const code = String(idObj?.code || '').trim()
  if (!code) return null
  const type = String(idObj?.type || '').trim().toUpperCase()
  const pattern = IDENTIFIER_PATTERNS[type]
  if (!pattern) {
    throw new Error(`Identifier code type must be one of: ${Object.keys(IDENTIFIER_PATTERNS).join(', ')}.`)
  }
  if (!pattern.test(code)) {
    throw new Error(`Invalid ${type} code "${code}". Check the digit count/format.`)
  }
  return { type, code }
}

function isSchemaAttrRequired(attr, selectedValueIdsByAttr) {
  if (attr.required) return true
  if (!attr.conditions?.length) return false
  return attr.conditions.some((cond) => selectedValueIdsByAttr.get(String(cond.attributeId))?.has(String(cond.valueId)))
}

async function readImageBytes(imageSource) {
  const value = String(imageSource || '').trim()
  const data = value.match(/^data:([^;,]+);base64,(.+)$/)
  if (data) {
    return { buffer: Buffer.from(data[2], 'base64'), type: data[1].toLowerCase() || 'image/jpeg' }
  }
  if (value.startsWith('/uploads/')) {
    const fileName = path.basename(value)
    const fullPath = path.resolve(UPLOADS_DIR, fileName)
    if (!fullPath.startsWith(UPLOADS_DIR + path.sep)) {
      throw new Error('Invalid local image path.')
    }
    const buffer = await fs.promises.readFile(fullPath).catch(() => null)
    if (!buffer) throw new Error(`Uploaded image file ${fileName} was not found.`)
    const ext = path.extname(fileName).toLowerCase()
    const mimeMap = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.heic': 'image/heic' }
    return { buffer, type: mimeMap[ext] || 'image/jpeg' }
  }
  if (/^https?:\/\//i.test(value)) {
    const { response: source } = await safeFetch(value)
    if (!source.ok) throw new Error(`Could not download image ${value} (${source.status})`)
    const type = (source.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase()
    return { buffer: Buffer.from(await source.arrayBuffer()), type }
  }
  throw new Error('Image must be a public link, uploaded file, or base64 data URL.')
}

function certificationRequired(rule, attributes) {
  if (rule.required) return true
  if (!rule.conditions?.length) return false
  return rule.conditions.some((condition) => attributes.some((attr) => (
    attr.id === condition.attributeId && (attr.values || []).some((value) => String(value.id) === condition.valueId)
  )))
}

async function certificationBytes(file) {
  const value = String(file || '')
  const data = value.match(/^data:([^;]+);base64,(.+)$/)
  if (data) return { buffer: Buffer.from(data[2], 'base64'), type: data[1].toLowerCase() }
  if (/^https?:\/\//i.test(value)) {
    const { response } = await safeFetch(value)
    if (!response.ok) throw new Error('Could not download the certification file.')
    return { buffer: Buffer.from(await response.arrayBuffer()), type: (response.headers.get('content-type') || '').toLowerCase() }
  }
  throw new Error('Upload the certification again.')
}

function safeFileName(name, extension) {
  const base = String(name || 'certification').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'certification'
  return `${base}.${extension}`
}

function signRequest(path, params, bodyText, secret) {
  const pairs = Object.keys(params)
    .filter((key) => key !== 'sign' && key !== 'access_token')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('')
  return crypto.createHmac('sha256', secret).update(`${secret}${path}${pairs}${bodyText}${secret}`).digest('hex')
}

module.exports = { UPLOADS_DIR, ORDER_STATUS, plainText, categoryPath, toPounds, toInches, attributeMap, imageUrls, dateOnly, nextDate, amountOf, LISTING_STATUS, NOT_SUBMITTED, PRE_APPROVED, auditReason, chatMessage, extractDistrict, assertNoBatchErrors, normalizeSellerSku, normalizeOrder, CARRIER_ALIASES, IDENTIFIER_PATTERNS, validateIdentifierCode, isSchemaAttrRequired, readImageBytes, certificationRequired, certificationBytes, safeFileName, signRequest }
