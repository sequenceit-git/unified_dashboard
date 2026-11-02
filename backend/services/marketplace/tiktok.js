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
    editAfterListing: ['title', 'description', 'price', 'stock'],
    listingActions: ['unpublish', 'publish', 'delete'],
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

  async getOrders(accessToken, { shop, limit = 100 } = {}) {
    const now = Math.floor(Date.now() / 1000)
    const orders = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/order/202309/orders/search', {
        shop,
        query: { page_size: 50, ...(pageToken ? { page_token: pageToken } : {}) },
        body: { create_time_ge: now - 365 * 24 * 3600, create_time_lt: now },
      })
      for (const order of data.orders || []) {
        orders.push({
          externalOrderId: order.id,
          placedAt: order.create_time ? new Date(order.create_time * 1000) : new Date(),
          status: ORDER_STATUS[order.status] || 'pending',
          buyer: { name: order.recipient_address?.name || order.user_id || 'TikTok Shop customer', email: '' },
          totals: {
            total: Number(order.payment?.total_amount || 0),
            currency: order.payment?.currency || 'USD',
          },
          items: (order.line_items || []).map((item) => ({
            sku: item.seller_sku || item.sku_id,
            title: item.product_name || item.sku_name,
            quantity: 1,
            unitPrice: Number(item.sale_price || 0),
            externalListingId: item.product_id ? `${item.product_id}:${item.sku_id || ''}` : undefined,
          })),
        })
      }
      pageToken = data.next_page_token || ''
    } while (pageToken && orders.length < limit)
    return { orders }
  }

  async getInventory(accessToken, { shop, limit = 200 } = {}) {
    const items = []
    let pageToken = ''
    do {
      const data = await this.call(accessToken, 'POST', '/product/202502/products/search', {
        shop,
        query: { page_size: 50, ...(pageToken ? { page_token: pageToken } : {}) },
        body: { status: 'ALL' },
      })
      for (const product of data.products || []) {
        let detail = product
        if (product.id) {
          try {
            detail = await this.call(accessToken, 'GET', `/product/202309/products/${product.id}`, { shop })
          } catch {
            detail = product
          }
        }
        const images = imageUrls(detail.main_images || product.main_images)
        const tiktokStatus = detail.status || detail.product_status || product.status
        const catalogStatus = tiktokStatus === 'ACTIVATE' ? 'active' : 'draft'
        const skus = detail.skus?.length ? detail.skus : product.skus || []
        const attributes = attributeMap(detail.product_attributes)
        const brand = attributes.Brand || ''
        const rows = skus.length ? skus : [null]
        for (const sku of rows) {
          const stock = sku ? (sku.inventory || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0) : 0
          items.push({
            sku: sku?.seller_sku || (sku?.id ? String(sku.id) : String(product.id)),
            title: detail.title || product.title || `TikTok Shop ${sku?.id || product.id}`,
            description: plainText(detail.description),
            price: Number(sku?.price?.sale_price || sku?.price?.tax_exclusive_price || 0),
            stock,
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
            externalListingId: sku?.id ? `${product.id}:${sku.id}` : String(product.id),
          })
        }
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
      if (!/version/i.test(error.message)) throw error
      const data = await this.call(accessToken, 'GET', '/analytics/202405/shop_products/performance', { shop, query })
      return data.products || []
    }
  }

  async getInbox(accessToken, shop) {
    const data = await this.call(accessToken, 'GET', '/customer_service/202309/conversations', {
      shop,
      query: { page_size: 20 },
    })
    return (data.conversations || []).map((row) => {
      const latest = row.latest_message || {}
      const message = latest.id ? chatMessage(latest) : null
      const buyer = (row.participants || []).find((person) => String(person.role).toUpperCase() === 'BUYER')
      return {
        externalThreadId: String(row.id),
        customerName: buyer?.nickname || (message?.direction === 'inbound' ? latest.sender?.nickname : '') || '',
        replyable: row.can_send_message !== false,
        status: 'open',
        lastMessageAt: message?.sentAt || new Date(),
        lastMessagePreview: String(message?.text || '').slice(0, 100),
        unreadCount: Number(row.unread_count || 0),
        messages: message ? [message] : [],
      }
    })
  }

  /** Recent visible messages of one conversation, oldest first. */
  async getThreadMessages(accessToken, shop, conversationId) {
    this.markConversationAsRead(accessToken, shop, conversationId).catch(() => {})
    const data = await this.call(accessToken, 'GET', `/customer_service/202309/conversations/${conversationId}/messages`, {
      shop,
      query: { page_size: 20, sort_order: 'DESC', sort_field: 'create_time' },
    })
    return (data.messages || [])
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
    const data = await this.call(accessToken, 'POST', `/customer_service/202309/conversations/${conversationId}/messages`, {
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
    const data = await this.call(accessToken, 'GET', '/logistics/202309/warehouses', { shop })
    const warehouses = (data.warehouses || []).filter((row) => row.type !== 'RETURN_WAREHOUSE')
    const chosen = warehouses.find((row) => row.is_default) || warehouses[0]
    if (!chosen) throw new Error('TikTok Shop has no sales warehouse. Add one in Seller Center first.')
    return String(chosen.id)
  }

  /** TikTok only accepts its own image URIs, so each public image is downloaded and uploaded. */
  async uploadImage(accessToken, imageUrl) {
    const source = await fetch(imageUrl)
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
      attributes.push({ id: row.id, values: [row.valueIds[name] ? { id: row.valueIds[name] } : { name }] })
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

    const data = await this.call(accessToken, 'POST', '/product/202309/products', {
      shop,
      body: {
        title,
        description: /<\w+/.test(description) ? description : `<p>${description.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`,
        category_id: categoryId,
        category_version: 'v2',
        main_images: mainImages.map((uri) => ({ uri })),
        package_weight: { value: String(Number(options.weight || product.weight || 1)), unit: 'POUND' },
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
            seller_sku: product.sku,
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
      await this.call(accessToken, 'POST', '/product/202309/products/deactivate', { shop, body: ids })
      return { status: 'paused', marketplaceStatus: 'SELLER_DEACTIVATED' }
    }
    if (action === 'publish') {
      const raw = listing.marketplaceStatus
      if (raw === 'DRAFT' || raw === 'FAILED' || listing.status === 'error') {
        await this.call(accessToken, 'POST', `/product/202509/products/${productId}/partial_edit`, {
          shop,
          body: { save_mode: 'LISTING' },
        })
      } else {
        await this.call(accessToken, 'POST', '/product/202309/products/activate', { shop, body: ids })
      }
      return { status: 'pending', marketplaceStatus: 'PENDING' }
    }
    if (action === 'delete') {
      await this.call(accessToken, 'DELETE', '/product/202309/products', { shop, body: ids })
      return { status: 'ended', marketplaceStatus: 'DELETED' }
    }
    if (action === 'recover') {
      await this.call(accessToken, 'POST', '/product/202309/products/recover', { shop, body: ids })
      return { status: 'paused', marketplaceStatus: 'SELLER_DEACTIVATED' }
    }
    throw new Error(`TikTok Shop cannot ${action} a listing.`)
  }

  /** Changes title, description, price or stock of a synced product. */
  async reviseListing(accessToken, externalListingId, changes, options = {}) {
    if (changes.price != null) await this.updatePrice(accessToken, null, changes.price, 'USD', { ...options, externalListingId })
    if (changes.quantity != null) await this.updateStock(accessToken, null, changes.quantity, { ...options, externalListingId })
    if (changes.title || changes.description) {
      const [productId] = String(externalListingId || '').split(':')
      await this.call(accessToken, 'POST', `/product/202509/products/${productId}/partial_edit`, {
        shop: options.shop,
        body: {
          ...(changes.title ? { title: String(changes.title).slice(0, 255) } : {}),
          ...(changes.description ? { description: changes.description } : {}),
        },
      })
    }
    return { success: true }
  }

  async updateStock(accessToken, sku, quantity, options = {}) {
    const [productId, skuId] = String(options.externalListingId || '').split(':')
    if (!productId || !skuId) {
      throw new Error(`TikTok Shop stock update needs a synced product and SKU for ${sku}`)
    }
    const warehouseId = await this.defaultWarehouseId(accessToken, options.shop)
    return this.call(accessToken, 'POST', `/product/202309/products/${productId}/inventory/update`, {
      shop: options.shop,
      body: { skus: [{ id: skuId, inventory: [{ warehouse_id: warehouseId, quantity: Math.max(0, Math.floor(Number(quantity))) }] }] },
    })
  }

  async updatePrice(accessToken, sku, price, currency = 'USD', options = {}) {
    const [productId, skuId] = String(options.externalListingId || '').split(':')
    if (!productId || !skuId) {
      throw new Error(`TikTok Shop price update needs a synced product and SKU for ${sku}`)
    }
    return this.call(accessToken, 'POST', `/product/202309/products/${productId}/prices/update`, {
      shop: options.shop,
      body: { skus: [{ id: skuId, price: { amount: String(price), currency } }] },
    })
  }

  /**
   * Pushes tracking number and fulfills package/order on TikTok Shop
   */
  async createShippingFulfillment(accessToken, orderId, { carrier = '', trackingNumber = '', lineItems = [], shop } = {}) {
    let lineItemIds = (lineItems || []).map((l) => l.lineItemId || l.id).filter(Boolean)
    let providerId = ''

    // Query eligible shipping services to find shipping_provider_id
    try {
      const services = await this.call(accessToken, 'POST', `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/shipping_services/query`, {
        shop,
        body: {},
      })
      const list = services.shipping_services || []
      const match = list.find((s) =>
        new RegExp(carrier, 'i').test(s.shipping_provider_name) || new RegExp(carrier, 'i').test(s.name)
      )
      if (match) {
        providerId = match.shipping_provider_id
      } else if (list.length > 0) {
        providerId = list[0].shipping_provider_id
      }
      if (!lineItemIds.length && services.order_line_id?.length) {
        lineItemIds = services.order_line_id
      }
    } catch {}

    if (!lineItemIds.length) {
      try {
        const orderData = await this.call(accessToken, 'GET', '/order/202309/orders', {
          shop,
          query: { order_id_list: String(orderId) },
        })
        const o = orderData.orders?.[0]
        if (o?.line_items) {
          lineItemIds = o.line_items.map((li) => li.id)
        }
      } catch {}
    }

    const body = {
      tracking_number: String(trackingNumber).trim(),
      ...(providerId ? { shipping_provider_id: String(providerId) } : {}),
      ...(lineItemIds.length ? { order_line_item_ids: lineItemIds } : {}),
    }

    return this.call(accessToken, 'POST', `/fulfillment/202309/orders/${encodeURIComponent(orderId)}/packages`, {
      shop,
      body,
    })
  }

  /**
   * Cancels unfulfilled order on TikTok Shop
   */
  async cancelOrder(accessToken, orderId, { reason = 'OUT_OF_STOCK', comment = '', shop } = {}) {
    const reasonMap = {
      OUT_OF_STOCK: 'seller_cancel_reason_out_of_stock',
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
  async issueRefund(accessToken, orderId, { reason = 'BUYER_CANCEL', comment = '', amount, shop } = {}) {
    try {
      const returns = await this.call(accessToken, 'POST', '/return_refund/202309/returns/search', {
        shop,
        body: { order_id: String(orderId) },
      })
      const active = (returns.return_orders || []).find((r) => !/closed|complete|finish|reject/i.test(r.return_status))
      if (active) {
        return this.decideReturn(accessToken, active.return_id, {
          decision: 'APPROVE_REFUND',
          buyerKeepItem: true,
          comment,
          shop,
        })
      }
    } catch {}

    // Fallback: if order is unfulfilled, cancel it with refund
    return this.cancelOrder(accessToken, orderId, { reason, comment, shop })
  }

  /**
   * Approves or rejects a cancellation request on TikTok Shop
   */
  async decideCancellation(accessToken, cancelId, { action = 'approve', comment = '', rejectReason = 'seller_reject_apply_product_has_been_packed', shop } = {}) {
    const isApprove = String(action).toLowerCase() === 'approve'
    if (isApprove) {
      return this.call(accessToken, 'POST', `/return_refund/202309/cancellations/${encodeURIComponent(cancelId)}/approve`, {
        shop,
        body: {},
      })
    }
    return this.call(accessToken, 'POST', `/return_refund/202309/cancellations/${encodeURIComponent(cancelId)}/reject`, {
      shop,
      body: {
        reject_reason: rejectReason || 'seller_reject_apply_product_has_been_packed',
        comment: comment || 'Order has already been packed and dispatched',
      },
    })
  }

  /**
   * Approves or rejects a return request on TikTok Shop
   */
  async decideReturn(accessToken, returnId, { decision = 'APPROVE_REFUND', comment = '', rejectReason = 'seller_reject_apply_package_has_not_exceeded_estimated_delivery_time', buyerKeepItem = true, shop } = {}) {
    const isApprove = /approve/i.test(decision)
    if (isApprove) {
      return this.call(accessToken, 'POST', `/return_refund/202309/returns/${encodeURIComponent(returnId)}/approve`, {
        shop,
        body: {
          decision: 'APPROVE_REFUND',
          buyer_keep_item: Boolean(buyerKeepItem),
        },
      })
    }
    return this.call(accessToken, 'POST', `/return_refund/202309/returns/${encodeURIComponent(returnId)}/reject`, {
      shop,
      body: {
        decision: 'REJECT_REFUND',
        reject_reason: rejectReason || 'seller_reject_apply_package_has_not_exceeded_estimated_delivery_time',
        comment: comment || 'Return request declined according to shop policy',
      },
    })
  }

  /**
   * Creates a discount activity on TikTok Shop
   */
  async createPromotion(accessToken, { name, title, activityType = 'DIRECT_DISCOUNT', percentageOff = 10, productLevel = 'SHOP', startDate, endDate, beginTime, endTime, shop } = {}) {
    const now = Math.floor(Date.now() / 1000)
    const start = beginTime ? Math.floor(new Date(beginTime).getTime() / 1000) : startDate ? Math.floor(new Date(startDate).getTime() / 1000) : now + 120
    const end = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : endDate ? Math.floor(new Date(endDate).getTime() / 1000) : now + 14 * 86400

    const body = {
      activity_type: activityType || 'DIRECT_DISCOUNT',
      title: String(title || name || `Sale ${new Date().toLocaleDateString()}`).slice(0, 50),
      begin_time: start,
      end_time: end,
      product_level: productLevel || 'SHOP',
    }
    return this.call(accessToken, 'POST', '/promotion/202309/activities', { shop, body })
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
      throw new Error(payload.message || 'TikTok Shop token request failed')
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
      throw new Error(payload.message || `TikTok Shop ${path} failed`)
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
    const response = await fetch(value)
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
