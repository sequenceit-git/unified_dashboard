/**
 * United States TikTok Shop Open API.
 * Paths are the newest operations in the bundled Partner Center OAS:
 * GET /authorization/202309/shops
 * POST /order/202309/orders/search
 * POST /product/202502/products/search
 * POST /product/202309/products
 * POST /product/202309/products/{product_id}/inventory/update
 * POST /product/202309/products/{product_id}/prices/update
 */

const crypto = require('crypto')
const config = require('../../config/marketplaces').tiktok_shop
const { safeFetch } = require('../../utils/safeUrl')

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

class TikTokShopService {
  /** What the List dialog shows for TikTok Shop (Product API 202309). */
  listingCapabilities = {
    canList: true,
    apiName: 'TikTok Shop Product API',
    titleMax: 255,
    maxImages: 9,
    categorySearch: false,
    categoryAutoPick: true,
    attributes: true,
    condition: false,
    packageDetails: true,
    editAfterListing: ['title', 'description', 'price', 'stock', 'images'],
    listingActions: ['unpublish', 'publish', 'delete', 'recover'],
    note: 'TikTok picks the category from the title. New products go to TikTok review before they appear in the shop.',
  }

  getAuthUrl(state = '') {
    if (!config.serviceId) {
      throw new Error('TikTok Shop service id (TIKTOK_SHOP_SERVICE_ID) is missing')
    }
    const params = new URLSearchParams({ service_id: config.serviceId, state })
    return `${config.authUrl}?${params.toString()}`
  }

  async exchangeCode(code) {
    const token = await this.requestToken(config.tokenUrl, {
      app_key: config.appKey,
      app_secret: config.appSecret,
      auth_code: code,
      grant_type: 'authorized_code',
    })
    const shops = await this.getAuthorizedShops(token.access_token)
    const shop = shops.find((item) => item.region === 'US') || shops[0]
    if (!shop) throw new Error('TikTok Shop did not return an authorized shop')
    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.access_token_expire_in,
      externalShopId: String(shop.id),
      shopCipher: shop.cipher,
      shopName: shop.name || 'TikTok Shop',
    }
  }

  async refreshToken(refreshToken) {
    const token = await this.requestToken(config.refreshUrl, {
      app_key: config.appKey,
      app_secret: config.appSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })
    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.access_token_expire_in,
    }
  }

  async getOrders(accessToken, { shop, limit = 1000, since = null } = {}) {
    const now = Math.floor(Date.now() / 1000)
    const sinceSec = since ? Math.floor(new Date(since).getTime() / 1000) : null
    const filterBody = Number.isFinite(sinceSec) && sinceSec > 0
      ? { update_time_ge: sinceSec, update_time_lt: now }
      : { create_time_ge: now - 365 * 24 * 3600, create_time_lt: now }
    const orders = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/order/202309/orders/search', {
        shop,
        query: {
          page_size: 100,
          sort_field: 'update_time',
          sort_order: 'DESC',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: filterBody,
      })
      for (const order of data.orders || []) {
        orders.push(normalizeOrder(order))
      }
      pageToken = data.next_page_token || ''
    } while (pageToken && orders.length < limit)
    return { orders, complete: !pageToken }
  }

  async getOrderDetails(accessToken, orderIds = [], { shop } = {}) {
    const ids = (orderIds || []).map((id) => String(id || '').trim()).filter(Boolean)
    if (!ids.length) return []
    const out = []
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const data = await this.call(accessToken, 'GET', '/order/202507/orders', {
        shop,
        query: { ids: chunk.join(',') },
      })
      for (const order of data.orders || []) out.push(normalizeOrder(order))
    }
    return out
  }

  async getReturns(accessToken, { shop, limit = 200 } = {}) {
    const rows = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/return_refund/202309/returns/search', {
        shop,
        query: {
          page_size: 50,
          sort_field: 'update_time',
          sort_order: 'DESC',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: {},
      })
      rows.push(...(data.return_orders || []))
      pageToken = data.next_page_token || ''
    } while (pageToken && rows.length < limit)
    return rows
  }

  async getCancellations(accessToken, { shop, limit = 200 } = {}) {
    const rows = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/return_refund/202309/cancellations/search', {
        shop,
        query: {
          page_size: 50,
          sort_field: 'update_time',
          sort_order: 'DESC',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: {},
      })
      rows.push(...(data.cancellations || []))
      pageToken = data.next_page_token || ''
    } while (pageToken && rows.length < limit)
    return rows
  }

  async getInventory(accessToken, { shop, limit = 2000 } = {}) {
    const items = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/product/202502/products/search', {
        shop,
        query: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
        body: { status: 'ALL' },
      })
      const queue = [...(data.products || [])]
      const detailById = new Map()
      const worker = async () => {
        while (queue.length) {
          const prod = queue.shift()
          if (!prod?.id) continue
          try {
            detailById.set(prod.id, await this.call(accessToken, 'GET', `/product/202309/products/${encodeURIComponent(prod.id)}`, { shop }))
          } catch {
            detailById.set(prod.id, prod)
          }
        }
      }
      await Promise.all([worker(), worker(), worker()])

      for (const product of data.products || []) {
        const detail = detailById.get(product.id) || product
        const images = imageUrls(detail.main_images || product.main_images)
        const tiktokStatus = detail.status || detail.product_status || product.status
        const catalogStatus = tiktokStatus === 'ACTIVATE' ? 'active' : 'draft'
        const skus = detail.skus?.length ? detail.skus : product.skus || []
        const attributes = attributeMap(detail.product_attributes)
        const brand = attributes.Brand || ''
        const rows = skus.length ? skus : [null]
        const baseTitle = detail.title || product.title || ''
        const variantList = rows.map((sku) => {
          const stock = sku ? (sku.inventory || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0) : 0
          const rawSku = sku?.seller_sku && !/^none$/i.test(String(sku.seller_sku).trim()) ? String(sku.seller_sku).trim() : ''
          const cleanSku = rawSku
            ? (/^\d+$/.test(rawSku) ? `TTS-${rawSku}` : rawSku.startsWith('TT-') ? rawSku.replace(/^TT-/, 'TTS-') : rawSku)
            : `TTS-${sku?.id || product.id}`
          const options = Object.fromEntries(
            (sku?.sales_attributes || [])
              .map((a) => [String(a.name || 'Variant').trim(), String(a.value_name || '').trim()])
              .filter(([k, v]) => Boolean(k && v)),
          )
          const price = Number(sku?.price?.sale_price || sku?.price?.tax_exclusive_price || 0)
          return {
            sku: cleanSku,
            rawSku,
            externalSkuId: sku?.id ? String(sku.id) : '',
            options,
            price,
            stock,
          }
        })
        const isMulti = skus.length > 1
        const positivePrices = variantList.map((v) => v.price).filter((p) => p > 0)
        const minPrice = positivePrices.length ? Math.min(...positivePrices) : (variantList[0]?.price || 0)
        const totalStock = variantList.reduce((sum, v) => sum + v.stock, 0)
        const primary = variantList[0]
        items.push({
          sku: primary?.sku || `TTS-${product.id}`,
          rawSku: primary?.rawSku || '',
          matchSkus: [...new Set(variantList.flatMap((v) => [v.sku, v.rawSku]).filter(Boolean))],
          title: baseTitle || `TikTok Shop ${product.id}`,
          description: plainText(detail.description),
          price: minPrice,
          stock: totalStock,
          variants: isMulti ? variantList.map(({ rawSku, ...v }) => v) : [],
          images,
          category: categoryPath(detail.category_chains),
          brand,
          weight: toPounds(detail.package_weight),
          dimensions: toInches(detail.package_dimensions),
          attributes,
          status: catalogStatus,
          listingStatus: LISTING_STATUS[tiktokStatus] || 'pending',
          marketplaceStatus: tiktokStatus,
          listingError: auditReason(detail, tiktokStatus),
          externalListingId: !isMulti && skus[0]?.id ? `${product.id}:${skus[0].id}` : String(product.id),
        })
        if (items.length >= limit) break
      }
      pageToken = data.next_page_token || ''
    } while (pageToken && items.length < limit)
    return { inventoryItems: items, complete: !pageToken }
  }

  async shopPerformance(accessToken, { shop, from, to } = {}) {
    const data = await this.call(accessToken, 'GET', '/analytics/202509/shop/performance', {
      shop,
      query: {
        start_date_ge: dateOnly(from),
        end_date_lt: nextDate(to),
        granularity: '1D',
        currency: 'USD',
      },
    })
    return data.performance?.intervals || []
  }

  async productPerformance(accessToken, { shop, from, to, limit = 10 } = {}) {
    const query = {
      start_date_ge: dateOnly(from),
      end_date_lt: nextDate(to),
      page_size: Math.min(Number(limit) || 10, 100),
      currency: 'USD',
    }
    try {
      const data = await this.call(accessToken, 'GET', '/analytics/202509/shop_products/performance', { shop, query })
      return data.products || []
    } catch (error) {
      if (!/version|not found|404/i.test(error.message || '')) throw error
      const data = await this.call(accessToken, 'GET', '/analytics/202405/shop_products/performance', { shop, query })
      return data.products || []
    }
  }

  async getInbox(accessToken, shop) {
    const threads = []
    let pageToken = ''
    let pages = 0
    do {
      const data = await this.call(accessToken, 'GET', '/customer_service/202309/conversations', {
        shop,
        query: { page_size: 20, ...(pageToken ? { page_token: pageToken } : {}) },
      })
      for (const row of data.conversations || []) {
        const latest = row.latest_message || {}
        const message = latest.id ? chatMessage(latest) : null
        const buyer = (row.participants || []).find((person) => String(person.role).toUpperCase() === 'BUYER')
        threads.push({
          externalThreadId: String(row.id),
          customerName: buyer?.nickname || (message?.direction === 'inbound' ? latest.sender?.nickname : '') || '',
          replyable: row.can_send_message !== false,
          status: 'open',
          lastMessageAt: message?.sentAt || new Date(),
          lastMessagePreview: String(message?.text || '').slice(0, 100),
          unreadCount: Number(row.unread_count || 0),
          messages: message ? [message] : [],
        })
      }
      pageToken = data.next_page_token || ''
      pages += 1
    } while (pageToken && pages < 5)
    return threads
  }

  /** Recent visible messages of one conversation, oldest first. Never marks read unless `markRead: true`. */
  async getThreadMessages(accessToken, shop, conversationId, { markRead = false } = {}) {
    if (markRead) {
      this.markConversationAsRead(accessToken, shop, conversationId).catch(() => {})
    }
    const messages = []
    let pageToken = ''
    let pages = 0
    do {
      const data = await this.call(accessToken, 'GET', `/customer_service/202309/conversations/${encodeURIComponent(conversationId)}/messages`, {
        shop,
        query: {
          page_size: 10,
          sort_order: 'DESC',
          sort_field: 'create_time',
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      })
      messages.push(...(data.messages || []))
      pageToken = data.next_page_token || ''
      pages += 1
    } while (pageToken && pages < 2)
    return messages
      .filter((message) => message.is_visible !== false)
      .map(chatMessage)
      .sort((a, b) => a.sentAt - b.sentAt)
  }

  async markConversationAsRead(accessToken, shop, conversationId) {
    try {
      await this.call(accessToken, 'POST', `/customer_service/202309/conversations/${encodeURIComponent(conversationId)}/messages/read`, {
        shop,
        body: {},
      })
    } catch {
      // best-effort
    }
  }

  async sendMessage(accessToken, shop, conversationId, text) {
    const data = await this.call(accessToken, 'POST', `/customer_service/202309/conversations/${encodeURIComponent(conversationId)}/messages`, {
      shop,
      body: { type: 'TEXT', content: JSON.stringify({ content: String(text).slice(0, 2000) }) },
    })
    return { externalMessageId: data.message_id ? String(data.message_id) : null }
  }

  /** Leaf category TikTok suggests for a title. */
  async recommendCategory(accessToken, shop, title, description) {
    const data = await this.call(accessToken, 'POST', '/product/202309/categories/recommend', {
      shop,
      body: { product_title: String(title).slice(0, 255), description: description || undefined, category_version: 'v2' },
    })
    return data.leaf_category_id ? String(data.leaf_category_id) : null
  }

  /** The suggested category with its path, in the same shape as eBay's suggestions. */
  async getCategories(accessToken, query, { shop } = {}) {
    const data = await this.call(accessToken, 'POST', '/product/202309/categories/recommend', {
      shop,
      body: { product_title: String(query || '').slice(0, 255), category_version: 'v2' },
    })
    if (!data.leaf_category_id) return []
    const path = (data.categories || []).map((row) => row.name).filter(Boolean)
    return [{ categoryId: String(data.leaf_category_id), categoryName: path[path.length - 1] || '', path: path.join(' > ') }]
  }

  /** Certifications and other extra requirements for a leaf category. US shops use category tree v2. */
  async getCategoryRules(accessToken, categoryId, { shop } = {}) {
    const data = await this.call(accessToken, 'GET', `/product/202309/categories/${encodeURIComponent(categoryId)}/rules`, {
      shop,
      query: { category_version: 'v2', locale: 'en-US' },
    })
    return (data.product_certifications || []).map((row) => ({
      id: String(row.id),
      name: row.name || 'Certification',
      required: Boolean(row.is_required),
      documentDetails: row.document_details || '',
      sampleImageUrl: row.sample_image_url || '',
      expirationRequired: Boolean(row.expiration_date?.is_required),
      conditions: (row.requirement_conditions || [])
        .filter((item) => item.attribute_id && item.attribute_value_id)
        .map((item) => ({ attributeId: String(item.attribute_id), valueId: String(item.attribute_value_id) })),
    }))
  }

  /** Product attributes for a category. Sales properties are variants and are left out. */
  async getItemAspects(accessToken, categoryId, { shop } = {}) {
    const data = await this.call(accessToken, 'GET', `/product/202309/categories/${encodeURIComponent(categoryId)}/attributes`, {
      shop,
      query: { category_version: 'v2' },
    })
    return (data.attributes || [])
      .filter((row) => row.type !== 'SALES_PROPERTY')
      .map((row) => ({
        id: String(row.id),
        name: row.name,
        required: Boolean(row.is_requried ?? row.is_required),
        recommended: !(row.requirement_conditions || []).length,
        values: (row.values || []).map((value) => value.name),
        valueIds: Object.fromEntries((row.values || []).map((value) => [value.name, String(value.id)])),
        freeText: row.is_customizable !== false || !(row.values || []).length,
      }))
  }

  async defaultWarehouseId(accessToken, shop) {
    const key = String(shop?._id || shop?.shopCipher || 'default')
    this._warehouseCache = this._warehouseCache || new Map()
    const cached = this._warehouseCache.get(key)
    if (cached && Date.now() - cached.at < 15 * 60 * 1000) return cached.id
    const data = await this.call(accessToken, 'GET', '/logistics/202309/warehouses', { shop })
    const warehouses = (data.warehouses || []).filter((row) => row.type !== 'RETURN_WAREHOUSE')
    const chosen = warehouses.find((row) => row.is_default) || warehouses[0]
    if (!chosen) throw new Error('TikTok Shop has no sales warehouse. Add one in Seller Center first.')
    const id = String(chosen.id)
    this._warehouseCache.set(key, { id, at: Date.now() })
    return id
  }

  /** TikTok only accepts its own image URIs, so each public image is downloaded and uploaded. */
  async uploadImage(accessToken, imageUrl) {
    const { response: source } = await safeFetch(imageUrl)
    if (!source.ok) throw new Error(`Could not download image ${imageUrl} (${source.status})`)
    const type = source.headers.get('content-type') || 'image/jpeg'
    const form = new FormData()
    form.append('data', new Blob([await source.arrayBuffer()], { type }), `image.${type.split('/')[1] || 'jpg'}`)
    form.append('use_case', 'MAIN_IMAGE')
    const data = await this.call(accessToken, 'POST', '/product/202309/images/upload', { form })
    if (!data.uri) throw new Error('TikTok Shop did not accept the image.')
    return data.uri
  }

  /** Uploads a certification image or PDF and returns the TikTok id to put on the product. */
  async uploadCertification(accessToken, file, filename = 'certification') {
    const { buffer, type } = await certificationBytes(file)
    const pdf = type.includes('pdf') || String(filename).toLowerCase().endsWith('.pdf')
    if (pdf) {
      const name = safeFileName(filename, 'pdf')
      const form = new FormData()
      form.append('data', new Blob([buffer], { type: 'application/pdf' }), name)
      form.append('name', name)
      const data = await this.call(accessToken, 'POST', '/product/202309/files/upload', { form })
      if (!data.id) throw new Error('TikTok Shop did not accept the certification PDF.')
      return { files: [{ id: data.id, name, format: 'PDF' }] }
    }
    const form = new FormData()
    form.append('data', new Blob([buffer], { type: type || 'image/jpeg' }), safeFileName(filename, 'jpg'))
    form.append('use_case', 'CERTIFICATION_IMAGE')
    const data = await this.call(accessToken, 'POST', '/product/202309/images/upload', { form })
    if (!data.uri) throw new Error('TikTok Shop did not accept the certification image.')
    return { images: [{ uri: data.uri }] }
  }

  /**
   * Creates the product on TikTok Shop. New products go to TikTok's review first, so the
   * listing starts as pending. Returns `{ externalListingId: "productId:skuId", status }`.
   */
  async createListing(accessToken, product, options = {}) {
    const shop = options.shop
    const title = String(options.title || product.title || '').slice(0, 255)
    const images = (options.images?.length ? options.images : product.images || []).filter((url) => /^https?:\/\//i.test(url)).slice(0, 9)
    if (!images.length) throw new Error('TikTok Shop needs at least one product image with a public link.')
    const quantity = Math.floor(Number(options.stock ?? product.stock ?? 0))
    if (!(quantity > 0)) throw new Error('Set stock to at least 1 before listing on TikTok Shop.')
    const price = Number(options.price ?? product.basePrice)
    if (!(price > 0)) throw new Error('Set a price above 0 before listing on TikTok Shop.')

    const description = options.description || product.description || title
    const categoryId = options.categoryId || await this.recommendCategory(accessToken, shop, title, description)
    if (!categoryId) throw new Error('TikTok Shop could not suggest a category for this title.')
    const [warehouseId, mainImages, rules] = await Promise.all([
      this.defaultWarehouseId(accessToken, shop),
      Promise.all(images.map((url) => this.uploadImage(accessToken, url))),
      this.getCategoryRules(accessToken, categoryId, { shop }),
    ])
    const dims = options.dimensions || product.dimensions || {}
    const filled = Object.entries(options.aspects || {}).filter(([, value]) => String(value || '').trim())
    const schema = filled.length ? await this.getItemAspects(accessToken, categoryId, { shop }).catch(() => []) : []
    const attributes = []
    const seen = new Set()
    for (const [id, value] of filled) {
      const row = schema.find((attr) => attr.id === id || String(attr.name).toLowerCase() === String(id).toLowerCase())
      if (!row || seen.has(row.id)) continue
      seen.add(row.id)
      const name = String(value).trim()
      const matchedValueId = row.valueIds?.[name]
        || Object.entries(row.valueIds || {}).find(([k]) => String(k).toLowerCase() === name.toLowerCase())?.[1]
      attributes.push({ id: row.id, values: [matchedValueId ? { id: matchedValueId } : { name }] })
    }
    const needed = rules.filter((rule) => certificationRequired(rule, attributes))
    const provided = Array.isArray(options.certifications) ? options.certifications : []
    const missing = needed.filter((rule) => !provided.some((item) => String(item.id) === rule.id && item.file))
    if (missing.length) {
      throw new Error(`TikTok Shop requires ${missing.map((rule) => rule.name).join(', ')} for this category. Upload each document, then publish again.`)
    }
    const certifications = []
    for (const rule of needed) {
      const item = provided.find((row) => String(row.id) === rule.id)
      if (rule.expirationRequired && !item.expirationDate) {
        throw new Error(`Add an expiration date for ${rule.name}.`)
      }
      const uploaded = await this.uploadCertification(accessToken, item.file, item.name || rule.name)
      certifications.push({
        id: rule.id,
        ...uploaded,
        ...(item.expirationDate ? { expiration_date: Math.floor(new Date(item.expirationDate).getTime() / 1000) } : {}),
      })
    }

    const weightPound = Number(Number(options.weight || product.weight || 1).toFixed(2)) || 1
    const data = await this.call(accessToken, 'POST', '/product/202309/products', {
      shop,
      body: {
        title,
        description: /<\w+/.test(description) ? description : `<p>${description.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`,
        category_id: categoryId,
        category_version: 'v2',
        main_images: mainImages.map((uri) => ({ uri })),
        package_weight: { value: String(weightPound), unit: 'POUND' },
        package_dimensions: {
          length: String(Math.ceil(Number(dims.length || 10))),
          width: String(Math.ceil(Number(dims.width || 10))),
          height: String(Math.ceil(Number(dims.height || 5))),
          unit: 'INCH',
        },
        ...(attributes.length ? { product_attributes: attributes } : {}),
        ...(certifications.length ? { certifications } : {}),
        save_mode: 'LISTING',
        skus: [
          {
            seller_sku: normalizeSellerSku(product.sku),
            price: { amount: price.toFixed(2), currency: 'USD' },
            inventory: [{ warehouse_id: warehouseId, quantity }],
          },
        ],
        idempotency_key: `${product._id || product.sku}-${Date.now()}`,
      },
    })
    const skuId = data.skus?.[0]?.id
    const marketplaceStatus = data.status || 'PENDING'
    return {
      externalListingId: skuId ? `${data.product_id}:${skuId}` : String(data.product_id),
      status: LISTING_STATUS[marketplaceStatus] || 'pending',
      marketplaceStatus,
      categoryId,
    }
  }

  async applyListingAction(accessToken, action, listing, options = {}) {
    const [productId] = String(listing.externalListingId || '').split(':')
    if (!productId) throw new Error('This product is not on TikTok Shop yet.')
    const shop = options.shop
    const ids = { product_ids: [productId] }
    if (action === 'unpublish') {
      const res = await this.call(accessToken, 'POST', '/product/202309/products/deactivate', { shop, body: ids })
      assertNoBatchErrors(res, 'Could not deactivate TikTok Shop product')
      return { status: 'paused', marketplaceStatus: 'SELLER_DEACTIVATED' }
    }
    if (action === 'publish') {
      const raw = listing.marketplaceStatus
      if (raw === 'DRAFT' || raw === 'FAILED' || listing.status === 'error') {
        await this.call(accessToken, 'POST', `/product/202509/products/${encodeURIComponent(productId)}/partial_edit`, {
          shop,
          body: { save_mode: 'LISTING' },
        })
      } else {
        const res = await this.call(accessToken, 'POST', '/product/202309/products/activate', { shop, body: ids })
        assertNoBatchErrors(res, 'Could not activate TikTok Shop product')
      }
      return { status: 'pending', marketplaceStatus: 'PENDING' }
    }
    if (action === 'delete') {
      const res = await this.call(accessToken, 'DELETE', '/product/202309/products', { shop, body: ids })
      assertNoBatchErrors(res, 'Could not delete TikTok Shop product')
      return { status: 'ended', marketplaceStatus: 'DELETED' }
    }
    if (action === 'recover') {
      const res = await this.call(accessToken, 'POST', '/product/202309/products/recover', { shop, body: ids })
      assertNoBatchErrors(res, 'Could not recover TikTok Shop product')
      return { status: 'paused', marketplaceStatus: 'SELLER_DEACTIVATED' }
    }
    throw new Error(`TikTok Shop cannot ${action} a listing.`)
  }

  /** Changes title, description, price, stock, images, or package specs of a synced product. */
  async reviseListing(accessToken, externalListingId, changes, options = {}) {
    const variants = changes.variants || options.product?.variants
    const commonOpts = {
      ...options,
      externalListingId,
      ...(variants?.length ? { variants } : {}),
    }
    const skipped = []
    if (changes.price != null || changes.variantPrices) {
      const rawStatus = options.listing?.marketplaceStatus
      const isActivate = rawStatus
        ? rawStatus === 'ACTIVATE'
        : !['paused', 'pending', 'error', 'ended'].includes(options.listing?.status)
      if (!isActivate) {
        skipped.push('price')
      } else {
        await this.updatePrice(accessToken, null, changes.price, 'USD', {
          ...commonOpts,
          useVariantPrices: Boolean(changes.variantPrices),
        })
      }
    }
    if (changes.quantity != null || changes.variantStocks || changes.variantSku) {
      await this.updateStock(accessToken, null, changes.quantity, {
        ...commonOpts,
        ...(changes.variantSku ? { variantSku: changes.variantSku, variantStock: changes.variantStock } : {}),
        syncAllVariants: Boolean(changes.variantStocks),
      })
    }
    if (changes.title || changes.description != null || changes.images?.length || changes.weight != null || changes.dimensions) {
      const [productId] = String(externalListingId || '').split(':')
      const desc = changes.description != null && changes.description !== ''
        ? (/<\w+/.test(changes.description)
          ? changes.description
          : `<p>${String(changes.description).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
        : undefined
      let mainImages
      if (Array.isArray(changes.images) && changes.images.length) {
        const publicImages = changes.images.filter((url) => /^https?:\/\//i.test(url)).slice(0, 9)
        if (publicImages.length) {
          const uris = await Promise.all(publicImages.map((url) => this.uploadImage(accessToken, url)))
          mainImages = uris.map((uri) => ({ uri }))
        }
      }
      const weightVal = changes.weight != null && Number(changes.weight) > 0
        ? Number(Number(changes.weight).toFixed(2))
        : null
      const dims = changes.dimensions
      const hasDims = dims && (Number(dims.length) > 0 || Number(dims.width) > 0 || Number(dims.height) > 0)
      if (changes.title || desc || mainImages?.length || weightVal || hasDims) {
        await this.call(accessToken, 'POST', `/product/202509/products/${encodeURIComponent(productId)}/partial_edit`, {
          shop: options.shop,
          body: {
            ...(changes.title ? { title: String(changes.title).slice(0, 255) } : {}),
            ...(desc ? { description: desc } : {}),
            ...(mainImages?.length ? { main_images: mainImages } : {}),
            ...(weightVal ? { package_weight: { value: String(weightVal), unit: 'POUND' } } : {}),
            ...(hasDims ? {
              package_dimensions: {
                length: String(Math.ceil(Number(dims.length || 10))),
                width: String(Math.ceil(Number(dims.width || 10))),
                height: String(Math.ceil(Number(dims.height || 5))),
                unit: 'INCH',
              },
            } : {}),
          },
        })
      }
    }
    return { success: true, ...(skipped.length ? { skipped } : {}) }
  }

  async updateStock(accessToken, sku, quantity, options = {}) {
    const [productId, listingSkuId] = String(options.externalListingId || '').split(':')
    if (!productId) {
      throw new Error(`TikTok Shop stock update needs a synced product and SKU for ${sku}`)
    }
    const qty = Math.max(0, Math.floor(Number(quantity) || 0))
    const variants = Array.isArray(options.variants) ? options.variants : []
    let skuUpdates = []
    if (options.variantSku && variants.length) {
      const target = variants.find((v) => v.sku === options.variantSku)
      if (!target?.externalSkuId) {
        throw new Error(`Variant "${options.variantSku}" has no synced TikTok Shop SKU ID. Sync listings first.`)
      }
      skuUpdates = [{ id: String(target.externalSkuId), quantity: Math.max(0, Math.floor(Number(options.variantStock ?? qty))) }]
    } else if (listingSkuId) {
      skuUpdates = [{ id: String(listingSkuId), quantity: qty }]
    } else if (variants.length) {
      const withId = variants.filter((v) => v.externalSkuId)
      if (!withId.length) throw new Error(`TikTok Shop stock update needs synced variant SKU IDs for ${sku || productId}`)
      if (options.syncAllVariants || qty === 0) {
        skuUpdates = withId.map((v) => ({
          id: String(v.externalSkuId),
          quantity: qty === 0 ? 0 : Math.max(0, Math.floor(Number(v.stock) || 0)),
        }))
      } else if (withId.length === 1) {
        skuUpdates = [{ id: String(withId[0].externalSkuId), quantity: qty }]
      } else {
        throw new Error('Select a specific variant to adjust stock on this multi-variant TikTok Shop product.')
      }
    } else {
      throw new Error(`TikTok Shop stock update needs a synced product and SKU for ${sku}`)
    }

    const warehouseId = await this.defaultWarehouseId(accessToken, options.shop)
    const path = `/product/202309/products/${encodeURIComponent(productId)}/inventory/update`
    try {
      const res = await this.call(accessToken, 'POST', path, {
        shop: options.shop,
        body: { skus: skuUpdates.map((u) => ({ id: u.id, inventory: [{ warehouse_id: warehouseId, quantity: u.quantity }] })) },
      })
      return assertNoBatchErrors(res, 'TikTok Shop inventory update failed')
    } catch (err) {
      if (!/warehouse|inventory|12052097/i.test(`${err.message || ''} ${err.code || ''}`)) throw err
      const detail = await this.call(accessToken, 'GET', `/product/202309/products/${encodeURIComponent(productId)}`, { shop: options.shop })
      const skusPayload = []
      for (const upd of skuUpdates) {
        const targetSku = (detail.skus || []).find((row) => String(row.id) === String(upd.id))
        const warehouses = (targetSku?.inventory || []).map((row) => row.warehouse_id).filter(Boolean)
        if (!warehouses.length) throw err
        skusPayload.push({
          id: upd.id,
          inventory: warehouses.map((id, idx) => ({ warehouse_id: String(id), quantity: idx === 0 ? upd.quantity : 0 })),
        })
      }
      const retryRes = await this.call(accessToken, 'POST', path, {
        shop: options.shop,
        body: { skus: skusPayload },
      })
      return assertNoBatchErrors(retryRes, 'TikTok Shop inventory update failed')
    }
  }

  async updatePrice(accessToken, sku, price, currency = 'USD', options = {}) {
    const [productId, listingSkuId] = String(options.externalListingId || '').split(':')
    if (!productId) {
      throw new Error(`TikTok Shop price update needs a synced product and SKU for ${sku}`)
    }
    const variants = Array.isArray(options.variants) ? options.variants.filter((v) => v.externalSkuId) : []
    let skuPrices = []
    if (variants.length) {
      skuPrices = variants.map((v) => {
        const amountVal = options.useVariantPrices ? (v.price ?? price) : (price ?? v.price)
        return {
          id: String(v.externalSkuId),
          price: { amount: Number(amountVal).toFixed(2), currency },
        }
      })
    } else if (listingSkuId) {
      skuPrices = [{ id: String(listingSkuId), price: { amount: Number(price).toFixed(2), currency } }]
    } else {
      throw new Error(`TikTok Shop price update needs a synced product and SKU for ${sku}`)
    }
    return this.call(accessToken, 'POST', `/product/202309/products/${encodeURIComponent(productId)}/prices/update`, {
      shop: options.shop,
      body: { skus: skuPrices },
    })
  }

  /**
   * Pushes tracking number and fulfills package/order on TikTok Shop (Seller Shipping).
   */
  async createShippingFulfillment(accessToken, orderId, { carrier = '', trackingNumber = '', lineItems = [], shop } = {}) {
    const cleanTracking = String(trackingNumber || '').trim().replace(/[\s-]+/g, '')
    if (!cleanTracking) throw new Error('TikTok Shop needs a tracking number.')

    let lineItemIds = (lineItems || []).map((l) => l.lineItemId || l.id).filter(Boolean)
    let providerId = ''
    let order = null

    try {
      const orderData = await this.call(accessToken, 'GET', '/order/202507/orders', {
        shop,
        query: { ids: String(orderId) },
      })
      order = orderData.orders?.[0] || null
    } catch {}

    if (String(order?.shipping_type || '').toUpperCase() === 'TIKTOK') {
      throw new Error('This order uses TikTok Shipping (platform label). Ship it and download the label from TikTok Shop > Packages instead of pushing a seller tracking number.')
    }

    if (!lineItemIds.length && order?.line_items?.length) {
      lineItemIds = order.line_items.map((li) => li.id).filter(Boolean)
    }

    const matchCarrier = (name) => {
      const needle = String(carrier || '').trim().toLowerCase()
      if (!needle || needle === 'other') return false
      const lowerName = String(name || '').toLowerCase()
      if (lowerName.includes(needle)) return true
      const aliases = CARRIER_ALIASES[needle] || []
      return aliases.some((alias) => lowerName.includes(alias))
    }

    const hasExplicitCarrier = Boolean(carrier && String(carrier).trim() && String(carrier).trim().toLowerCase() !== 'other')
    let deliveryOptionId = order?.delivery_option_id || ''
    if (!deliveryOptionId) {
      const warehouseId = order?.warehouse_id || await this.defaultWarehouseId(accessToken, shop).catch(() => '')
      if (warehouseId) {
        try {
          const opts = await this.call(accessToken, 'GET', `/logistics/202309/warehouses/${encodeURIComponent(warehouseId)}/delivery_options`, { shop })
          deliveryOptionId = opts.delivery_options?.[0]?.id || ''
        } catch {}
      }
    }

    let providers = []
    if (deliveryOptionId) {
      try {
        const provData = await this.call(accessToken, 'GET', `/logistics/202309/delivery_options/${encodeURIComponent(deliveryOptionId)}/shipping_providers`, { shop })
        providers = provData.shipping_providers || []
        const match = providers.find((p) => matchCarrier(p.name))
        if (match) providerId = match.id
        else if (!hasExplicitCarrier && providers.length && !order?.shipping_provider_id) providerId = providers[0].id
      } catch {}
    }

    let servicesList = []
    if (!providerId || !lineItemIds.length) {
      try {
        const services = await this.call(accessToken, 'POST', `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/shipping_services/query`, {
          shop,
          body: {},
        })
        servicesList = services.shipping_services || []
        if (!providerId && servicesList.length) {
          const match = servicesList.find((s) => matchCarrier(s.shipping_provider_name) || matchCarrier(s.name))
          if (match) providerId = match.shipping_provider_id
          else if (!hasExplicitCarrier) providerId = servicesList[0].shipping_provider_id
        }
        if (!lineItemIds.length && services.order_line_id?.length) {
          lineItemIds = services.order_line_id
        }
      } catch {}
    }

    if (!providerId && hasExplicitCarrier) {
      const known = [...providers.map((p) => p.name), ...servicesList.map((s) => s.shipping_provider_name || s.name)].filter(Boolean)
      if (known.length) {
        throw new Error(`Carrier "${carrier}" did not match TikTok Shop providers (${[...new Set(known)].join(', ')}).`)
      }
    }

    if (!providerId && !hasExplicitCarrier && order?.shipping_provider_id) {
      providerId = order.shipping_provider_id
    }

    if (!providerId) {
      throw new Error(`Could not resolve a TikTok Shop shipping provider for${carrier ? ` "${carrier}" on` : ''} order ${orderId}.`)
    }

    const existingTracking = order?.tracking_number || (order?.line_items || []).find((li) => li.tracking_number)?.tracking_number
    const alreadyShipped = ['IN_TRANSIT', 'AWAITING_COLLECTION', 'PARTIALLY_SHIPPING'].includes(order?.status) || Boolean(existingTracking)
    if (alreadyShipped) {
      return this.call(accessToken, 'POST', `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/shipping_info/update`, {
        shop,
        body: {
          tracking_number: cleanTracking,
          shipping_provider_id: String(providerId),
        },
      })
    }

    const body = {
      tracking_number: cleanTracking,
      shipping_provider_id: String(providerId),
      ...(lineItemIds.length ? { order_line_item_ids: lineItemIds } : {}),
    }

    return this.call(accessToken, 'POST', `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/packages`, {
      shop,
      body,
    })
  }

  /**
   * Ships a package via TikTok Shipping handover (PICKUP / DROP_OFF).
   */
  async shipPackage(accessToken, packageId, { handoverMethod = 'DROP_OFF', shop } = {}) {
    return this.call(accessToken, 'POST', `/fulfillment/202309/packages/${encodeURIComponent(packageId)}/ship`, {
      shop,
      body: {
        handover_method: handoverMethod || 'DROP_OFF',
      },
    })
  }

  /**
   * Cancels unfulfilled order on TikTok Shop
   */
  async cancelOrder(accessToken, orderId, { reason = 'OUT_OF_STOCK', comment = '', shop } = {}) {
    const reasonMap = {
      OUT_OF_STOCK: 'seller_cancel_reason_out_of_stock',
      BUYER_CANCEL: 'seller_cancel_reason_buyer_request',
      BUYER_ASKED_CANCEL: 'seller_cancel_reason_buyer_request',
      ADDRESS_ISSUES: 'seller_cancel_reason_undeliverable_address',
    }
    const cancel_reason = reasonMap[reason] || 'seller_cancel_reason_out_of_stock'
    return this.call(accessToken, 'POST', '/return_refund/202309/cancellations', {
      shop,
      body: {
        order_id: String(orderId),
        cancel_reason,
      },
    })
  }

  /**
   * Issues refund on TikTok Shop
   */
  async issueRefund(accessToken, orderId, { reason = 'BUYER_CANCEL', comment = '', amount, orderTotal, shop } = {}) {
    const numAmount = amount != null ? Number(amount) : NaN
    const numTotal = orderTotal != null ? Number(orderTotal) : NaN
    const isPartial = Number.isFinite(numAmount) && numAmount > 0 && Number.isFinite(numTotal) && numTotal > 0 && numAmount < numTotal - 0.005

    try {
      const returns = await this.call(accessToken, 'POST', '/return_refund/202309/returns/search', {
        shop,
        body: { order_ids: [String(orderId)] },
      })
      const actionable = new Set([
        'RETURN_OR_REFUND_REQUEST_PENDING',
        'REPLACEMENT_REQUEST_PENDING',
        'BUYER_SHIPPED_ITEM',
      ])
      const active = (returns.return_orders || []).find((r) => actionable.has(String(r.return_status || '').toUpperCase()))
      if (active) {
        if (isPartial && String(active.return_status || '').toUpperCase() === 'RETURN_OR_REFUND_REQUEST_PENDING') {
          return this.call(accessToken, 'POST', `/return_refund/202309/returns/${encodeURIComponent(active.return_id)}/approve`, {
            shop,
            body: {
              decision: 'OFFER_PARTIAL_REFUND',
              partial_refund: {
                amount: numAmount.toFixed(2),
                currency: active.refund_amount?.currency || 'USD',
              },
            },
          })
        }
        return this.decideReturn(accessToken, active.return_id, {
          decision: 'APPROVE',
          returnType: active.return_type,
          rawStatus: active.return_status,
          buyerKeepItem: true,
          comment,
          shop,
        })
      }
    } catch {}

    let order = null
    try {
      const orderData = await this.call(accessToken, 'GET', '/order/202507/orders', {
        shop,
        query: { ids: String(orderId) },
      })
      order = orderData.orders?.[0] || null
    } catch {}

    const rawStatus = String(order?.status || '').toUpperCase()
    if (!order || ['UNPAID', 'ON_HOLD', 'AWAITING_SHIPMENT'].includes(rawStatus)) {
      if (isPartial) {
        throw new Error('TikTok Shop does not support partial refunds on unshipped orders. Cancel the order for a full refund or refund after delivery.')
      }
      return this.cancelOrder(accessToken, orderId, { reason, comment, shop })
    }

    if (rawStatus === 'CANCELLED') {
      throw new Error('This order is already cancelled on TikTok Shop.')
    }

    const refundTotal = Number.isFinite(numAmount) && numAmount > 0
      ? numAmount.toFixed(2)
      : String(order?.payment?.total_amount || '0')
    const lineItemIds = (order.line_items || []).map((li) => li.id).filter(Boolean)
    const skuCounts = new Map()
    for (const li of order.line_items || []) {
      if (!li.sku_id) continue
      skuCounts.set(String(li.sku_id), (skuCounts.get(String(li.sku_id)) || 0) + 1)
    }
    const reasonMap = {
      OUT_OF_STOCK: 'ecom_order_delivered_refund_reason_missing_product_seller',
      BUYER_CANCEL: 'ecom_order_delivered_refund_reason_missing_product_seller',
      CUSTOMER_SERVICE: 'ecom_order_delivered_refund_reason_missing_product_seller',
      OTHER: 'ecom_order_delivered_refund_reason_wrong_product_seller',
    }
    return this.call(accessToken, 'POST', '/return_refund/202309/returns', {
      shop,
      body: {
        order_id: String(orderId),
        return_type: 'REFUND',
        return_reason: reasonMap[reason] || 'ecom_order_delivered_refund_reason_missing_product_seller',
        currency: order.payment?.currency || 'USD',
        refund_total: String(refundTotal),
        ...(lineItemIds.length ? { order_line_item_ids: lineItemIds } : {}),
        ...(skuCounts.size ? { skus: [...skuCounts.entries()].map(([sku_id, qty]) => ({ sku_id, quantity: qty })) } : {}),
      },
    })
  }

  /**
   * Approves or rejects a cancellation request on TikTok Shop
   */
  async decideCancellation(accessToken, cancelId, { action = 'approve', comment = '', comments = '', rejectReason = 'seller_reject_apply_product_has_been_packed', shop } = {}) {
    const isApprove = String(action).toLowerCase() === 'approve'
    if (isApprove) {
      return this.call(accessToken, 'POST', `/return_refund/202309/cancellations/${encodeURIComponent(cancelId)}/approve`, {
        shop,
        body: {},
      })
    }
    const note = comment || comments || 'Order has already been packed and dispatched'
    return this.call(accessToken, 'POST', `/return_refund/202309/cancellations/${encodeURIComponent(cancelId)}/reject`, {
      shop,
      body: {
        reject_reason: rejectReason || 'seller_reject_apply_product_has_been_packed',
        comment: note,
      },
    })
  }

  /**
   * Approves or rejects a return request on TikTok Shop
   */
  async decideReturn(accessToken, returnId, { decision = 'APPROVE', comment = '', comments = '', rejectReason = 'seller_reject_apply_package_has_not_exceeded_estimated_delivery_time', buyerKeepItem = false, returnType = '', rawStatus = '', shop } = {}) {
    const note = comment || comments || ''
    const isApprove = /approve/i.test(decision)
    let resolvedType = returnType
    let resolvedStatus = rawStatus
    if (!resolvedType && !resolvedStatus) {
      try {
        const found = await this.call(accessToken, 'POST', '/return_refund/202309/returns/search', {
          shop,
          body: { return_ids: [String(returnId)] },
        })
        const row = found.return_orders?.[0]
        if (row) {
          resolvedType = row.return_type || ''
          resolvedStatus = row.return_status || ''
        }
      } catch {}
    }

    const upperStatus = String(resolvedStatus || '').toUpperCase()
    const upperType = String(resolvedType || '').toUpperCase()

    if (isApprove) {
      let apiDecision = 'APPROVE_REFUND'
      if (upperStatus === 'BUYER_SHIPPED_ITEM') apiDecision = 'APPROVE_RECEIVED_PACKAGE'
      else if (upperType === 'REPLACEMENT') apiDecision = 'APPROVE_REPLACEMENT'
      else if (upperType === 'RETURN_AND_REFUND') apiDecision = 'APPROVE_RETURN'

      return this.call(accessToken, 'POST', `/return_refund/202309/returns/${encodeURIComponent(returnId)}/approve`, {
        shop,
        body: {
          decision: apiDecision,
          ...(apiDecision === 'APPROVE_RETURN' && buyerKeepItem === true ? { buyer_keep_item: true } : {}),
        },
      })
    }

    let apiDecision = 'REJECT_REFUND'
    if (upperStatus === 'BUYER_SHIPPED_ITEM') apiDecision = 'REJECT_RECEIVED_PACKAGE'
    else if (upperType === 'REPLACEMENT') apiDecision = 'REJECT_REPLACEMENT'
    else if (upperType === 'RETURN_AND_REFUND') apiDecision = 'REJECT_RETURN'

    return this.call(accessToken, 'POST', `/return_refund/202309/returns/${encodeURIComponent(returnId)}/reject`, {
      shop,
      body: {
        decision: apiDecision,
        reject_reason: rejectReason || 'seller_reject_apply_package_has_not_exceeded_estimated_delivery_time',
        comment: note || 'Return request declined according to shop policy',
      },
    })
  }

  /**
   * Creates a discount activity on TikTok Shop
   */
  async createPromotion(accessToken, { name, title, activityType = 'DIRECT_DISCOUNT', percentageOff = 10, productLevel = 'PRODUCT', listingIds = [], startDate, endDate, beginTime, endTime, shop } = {}) {
    const percent = Math.round(Number(percentageOff || 10))
    if (!(percent >= 1 && percent <= 90)) {
      throw new Error('TikTok Shop discount percentage must be between 1% and 90%.')
    }
    const level = productLevel || 'PRODUCT'
    const productIds = [...new Set(
      (listingIds || []).map((id) => String(id || '').split(':')[0].trim()).filter(Boolean),
    )].slice(0, 300)
    if (level === 'PRODUCT' && !productIds.length) {
      throw new Error('TikTok Shop needs at least one live product to include in a promotion. Sync listings or enter TikTok product IDs first.')
    }
    const now = Math.floor(Date.now() / 1000)
    const rawStart = beginTime ? Math.floor(new Date(beginTime).getTime() / 1000) : startDate ? Math.floor(new Date(startDate).getTime() / 1000) : now + 120
    const start = Math.max(now + 60, rawStart)
    const rawEnd = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : endDate ? Math.floor(new Date(endDate).getTime() / 1000) : start + 14 * 86400
    const end = Math.max(start + 600, rawEnd)

    const stamp = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    const body = {
      activity_type: activityType || 'DIRECT_DISCOUNT',
      duration_type: 'NORMAL',
      title: String(title || name || `Sale ${stamp}`).slice(0, 50),
      begin_time: start,
      end_time: end,
      product_level: level,
    }
    const created = await this.call(accessToken, 'POST', '/promotion/202309/activities', { shop, body })
    const activityId = created.activity_id
    if (activityId && productIds.length) {
      try {
        await this.call(accessToken, 'PUT', `/promotion/202309/activities/${encodeURIComponent(activityId)}/products`, {
          shop,
          body: {
            activity_id: String(activityId),
            products: productIds.map((id) => ({
              id,
              discount: String(percent),
              quantity_limit: -1,
              quantity_per_user: -1,
              skus: [],
            })),
          },
        })
      } catch (err) {
        await this.deactivatePromotion(accessToken, activityId, { shop }).catch(() => {})
        throw err
      }
    }
    return created
  }

  /**
   * Deactivates an active promotion on TikTok Shop
   */
  async deactivatePromotion(accessToken, activityId, { shop } = {}) {
    return this.call(accessToken, 'POST', `/promotion/202309/activities/${encodeURIComponent(activityId)}/deactivate`, {
      shop,
      body: {},
    })
  }

  /**
   * Pauses / deactivates promotion (unified interface with eBay)
   */
  async pausePromotion(accessToken, promotionId, options = {}) {
    return this.deactivatePromotion(accessToken, promotionId, options)
  }

  /**
   * Retrieves recent settlement statements from TikTok Shop Finance API.
   */
  async getFinances(accessToken, { shop, limit = 50 } = {}) {
    const data = await this.call(accessToken, 'GET', '/finance/202309/statements', {
      shop,
      query: { page_size: Math.min(Number(limit) || 50, 100), sort_field: 'statement_time', sort_order: 'DESC' },
    })
    const transactions = (data.statements || []).map((row) => ({
      id: row.id,
      date: row.statement_time ? new Date(Number(row.statement_time) * 1000).toISOString() : null,
      revenue: Number(row.revenue_amount || 0),
      fee: Number(row.fee_amount || 0),
      settlement: Number(row.settlement_amount || 0),
      currency: row.currency || 'USD',
      status: row.payment_status || '',
    }))
    return { transactions, total: transactions.length }
  }

  async getWebhooks(accessToken, { shop } = {}) {
    const data = await this.call(accessToken, 'GET', '/event/202309/webhooks', { shop })
    return data.webhooks || []
  }

  async updateWebhook(accessToken, { address, eventType, shop } = {}) {
    return this.call(accessToken, 'PUT', '/event/202309/webhooks', {
      shop,
      body: { address: String(address).slice(0, 255), event_type: eventType },
    })
  }

  /**
   * Retrieves shipping documents / label URL for a package on TikTok Shop
   */
  async getShippingDocument(accessToken, packageId, { documentType = 'SHIPPING_LABEL', shop } = {}) {
    return this.call(accessToken, 'GET', `/fulfillment/202309/packages/${encodeURIComponent(packageId)}/shipping_documents`, {
      shop,
      query: { document_type: documentType },
    })
  }

  async getAuthorizedShops(accessToken) {
    const data = await this.call(accessToken, 'GET', '/authorization/202309/shops', {})
    return data.shops || []
  }

  async requestToken(url, params) {
    if (!config.appKey || !config.appSecret) {
      throw new Error('TikTok Shop credentials (TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET) are missing')
    }
    const response = await fetch(`${url}?${new URLSearchParams(params)}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.code) {
      const err = new Error(payload.message || 'TikTok Shop token request failed')
      err.code = payload.code
      err.deadLogin = [105002, 105003, 36004001, 36004004, 36004005, 36004006].includes(Number(payload.code))
        || /refresh.?token|invalid.?grant|revoked|expired/i.test(payload.message || '')
      throw err
    }
    return payload.data || payload
  }

  /** Signed request. `form` sends multipart data, which TikTok leaves out of the signature. */
  async call(accessToken, method, path, { shop, query = {}, body, form } = {}) {
    if (!config.appKey || !config.appSecret) {
      throw new Error('TikTok Shop credentials (TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET) are missing')
    }
    const params = {
      app_key: config.appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...query,
    }
    if (shop?.shopCipher) params.shop_cipher = shop.shopCipher
    Object.keys(params).forEach((key) => {
      if (params[key] === undefined || params[key] === null) delete params[key]
    })
    const bodyText = body === undefined || form ? '' : JSON.stringify(body)
    params.sign = signRequest(path, params, bodyText, config.appSecret)
    const url = `${config.apiBaseUrl}${path}?${new URLSearchParams(params)}`
    const response = await fetch(url, {
      method,
      headers: form
        ? { 'x-tts-access-token': accessToken }
        : { 'content-type': 'application/json', 'x-tts-access-token': accessToken },
      body: method === 'GET' ? undefined : form || bodyText,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || (payload.code && payload.code !== 0)) {
      const err = new Error(payload.message || `TikTok Shop ${path} failed`)
      err.code = payload.code
      err.status = (response.status === 401
        || [105002, 105003, 105004, 36004004, 36004005].includes(Number(payload.code))
        || /access.?token|token.*(expired|invalid)/i.test(payload.message || ''))
        ? 401
        : response.status
      throw err
    }
    return payload.data || {}
  }
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

module.exports = new TikTokShopService()
