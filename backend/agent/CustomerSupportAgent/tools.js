/**
 * Read-only tools for the Customer Support AI Agent.
 *
 * Every tool is scoped to the sandbox conversation context:
 *  - `shopId` narrows products/orders to the shop being simulated
 *  - `marketplace` narrows policies/FAQs to the channel being simulated
 *
 * No tool can mutate data.
 */

const SupportPolicy = require('../../models/SupportPolicy')
const SupportFaq = require('../../models/SupportFaq')
const Product = require('../../models/Product')
const Order = require('../../models/Order')
const Listing = require('../../models/Listing')

/**
 * Strips HTML tags and excessive whitespace.
 */
function stripHtml(text = '') {
  return String(text)
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function queryTerms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2)
}

function patternsFor(terms) {
  return terms.map((t) => new RegExp(escapeRegex(t), 'i'))
}

function includesTerm(haystack, term) {
  return String(haystack || '').toLowerCase().includes(term)
}

/**
 * Demo/sync test records are active in the catalog but should never be
 * presented to a simulated buyer as real merchandise.
 */
function isTestProduct(product) {
  const title = String(product?.title || '')
  const sku = String(product?.sku || '')
  return /test listing|do not bid|do not buy/i.test(title) || sku === '{sku}'
}

function scorePolicy(policy, terms) {
  let score = 0
  const phrase = terms.join(' ')
  for (const term of terms) {
    if (String(policy.code || '').toLowerCase() === term) score += 40
    if (includesTerm(policy.title, term)) score += 14
    if (includesTerm((policy.keywords || []).join(' '), term)) score += 9
    if (includesTerm(policy.summary, term)) score += 4
    if (includesTerm(policy.category, term)) score += 2
    if (includesTerm((policy.rules || []).map((r) => `${r.title} ${r.detail}`).join(' '), term)) score += 3
  }
  if (phrase && includesTerm(policy.title, phrase)) score += 25
  return score
}

function scoreFaq(faq, terms) {
  let score = 0
  const phrase = terms.join(' ')
  for (const term of terms) {
    if (String(faq.code || '').toLowerCase() === term) score += 40
    if (includesTerm(faq.question, term)) score += 14
    if (includesTerm((faq.keywords || []).join(' '), term)) score += 9
    if (includesTerm(faq.answer, term)) score += 4
    if (includesTerm(faq.category, term)) score += 2
  }
  if (phrase && includesTerm(faq.question, phrase)) score += 25
  return score
}

function policyContent(policy) {
  const parts = [policy.summary]
  for (const rule of policy.rules || []) {
    if (rule?.title && rule?.detail) parts.push(`${rule.title}: ${rule.detail}`)
  }
  if (policy.exceptions?.length) parts.push(`Exceptions: ${policy.exceptions.join('; ')}`)
  return stripHtml(parts.filter(Boolean).join(' ')).slice(0, 700)
}

function marketplaceClause(marketplace) {
  const values = [marketplace, 'all'].filter(Boolean)
  return {
    $or: [
      { marketplaces: { $in: values } },
      { marketplaces: { $exists: false } },
      { marketplaces: { $size: 0 } },
    ],
  }
}

/**
 * 1. Search approved store policies and FAQs.
 * Returns the highest-scoring chunks instead of the first N documents.
 */
async function searchFaqPolicies(query, { marketplace = 'ebay' } = {}) {
  const terms = queryTerms(query)
  if (!terms.length) return []

  // Retrieval synonym for the off-platform-payment scam FAQ. A buyer may say
  // "off platform" while the approved FAQ says "pay outside the marketplace".
  const lowerQuery = String(query || '').toLowerCase()
  if (/(off[- ]platform|pay outside|outside the marketplace|pay you directly|direct payment|asked me to pay)/.test(lowerQuery)) {
    for (const extra of ['scam', 'phishing', 'marketplace']) {
      if (!terms.includes(extra)) terms.push(extra)
    }
  }

  const regexes = patternsFor(terms)
  const channelClause = marketplaceClause(marketplace)

  const [policies, faqs] = await Promise.all([
    SupportPolicy.find({
      status: 'active',
      $and: [
        {
          $or: [
            { code: { $in: regexes } },
            { title: { $in: regexes } },
            { summary: { $in: regexes } },
            { keywords: { $in: regexes } },
            { category: { $in: regexes } },
            { 'rules.title': { $in: regexes } },
            { 'rules.detail': { $in: regexes } },
            { responseTemplate: { $in: regexes } },
          ],
        },
        channelClause,
      ],
    })
      .limit(40)
      .lean(),
    SupportFaq.find({
      status: 'active',
      $and: [
        {
          $or: [
            { code: { $in: regexes } },
            { question: { $in: regexes } },
            { answer: { $in: regexes } },
            { keywords: { $in: regexes } },
            { category: { $in: regexes } },
          ],
        },
        channelClause,
      ],
    })
      .limit(40)
      .lean(),
  ])

  const rankedPolicies = policies
    .map((policy) => ({ policy, score: scorePolicy(policy, terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const rankedFaqs = faqs
    .map((faq) => ({ faq, score: scoreFaq(faq, terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const combined = [
    ...rankedPolicies.map(({ policy, score }) => ({
      score,
      result: {
        sourceId: `policy:${policy.code || policy._id}`,
        type: 'policy',
        title: policy.title,
        category: policy.category,
        content: policyContent(policy),
      },
    })),
    ...rankedFaqs.map(({ faq, score }) => ({
      score,
      result: {
        sourceId: `faq:${faq.code || faq._id}`,
        type: 'faq',
        title: faq.question,
        category: faq.category,
        handling: faq.handling || 'auto',
        content: stripHtml(faq.answer).slice(0, 500),
      },
    })),
  ]

  return combined
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((row) => row.result)
}

/**
 * 2. Search the product catalog (active products only).
 */
async function searchProducts(query, { shopId = null } = {}) {
  const terms = queryTerms(query)
  if (!terms.length) return []

  const regexes = patternsFor(terms)
  const filter = {
    status: 'active',
    $or: [
      { title: { $in: regexes } },
      { category: { $in: regexes } },
      { brand: { $in: regexes } },
      { sku: { $in: regexes } },
      { description: { $in: regexes } },
    ],
  }

  if (shopId) {
    const ids = await Listing.find({ shopId }).distinct('productId')
    filter._id = { $in: ids }
  }

  const products = await Product.find(filter)
    .select('_id title basePrice currency stock category sku brand')
    .limit(30)
    .lean()

  const ranked = products
    .filter((product) => !isTestProduct(product))
    .map((product) => {
      let score = 0
      for (const term of terms) {
        if (includesTerm(product.title, term)) score += 10
        if (includesTerm(product.sku, term)) score += 8
        if (includesTerm(product.brand, term)) score += 5
        if (includesTerm(product.category, term)) score += 3
      }
      return { product, score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return ranked.map(({ product }) => ({
    sourceId: `item:${product._id}`,
    sku: product.sku,
    title: product.title,
    price: `${product.currency || 'USD'} ${product.basePrice ?? 0}`,
    stock: product.stock ?? 0,
    category: product.category || 'General',
  }))
}

/**
 * 3. Get detailed product specs.
 */
async function getProductDetails(itemId, { shopId = null } = {}) {
  if (!itemId) return { error: 'itemId is required' }

  const cleanedId = String(itemId).replace(/^item:/, '').trim()
  let product = null

  if (/^[0-9a-fA-F]{24}$/.test(cleanedId)) {
    product = await Product.findById(cleanedId).lean()
  }
  if (!product) {
    product = await Product.findOne({ sku: cleanedId }).lean()
  }
  if (!product) {
    return { error: `Product not found for ID or SKU: ${cleanedId}` }
  }

  if (isTestProduct(product)) {
    return { error: 'This product is a test record and is not available to buyers.' }
  }

  if (shopId) {
    const listed = await Listing.exists({ productId: product._id, shopId })
    if (!listed) return { error: 'This product is not listed in the selected shop.' }
  }

  return {
    sourceId: `item:${product._id}`,
    sku: product.sku,
    title: product.title,
    brand: product.brand,
    price: `${product.currency || 'USD'} ${product.basePrice ?? 0}`,
    stock: product.stock ?? 0,
    category: product.category,
    description: stripHtml(product.description || '').slice(0, 400),
    attributes: product.attributes || {},
  }
}

/**
 * 4. Look up an order and its tracking status.
 *
 * Field names match backend/models/Order.js exactly:
 *   externalOrderId, status, shipping.carrier, shipping.trackingNumber, totals.total
 */
async function getOrderDetails(orderRef, { shopId = null } = {}) {
  if (!orderRef) return { error: 'orderRef is required' }

  const queryRef = String(orderRef).trim().replace(/^#/, '')
  const filter = { externalOrderId: queryRef }
  if (shopId) filter.shopId = shopId

  let order = await Order.findOne(filter).lean()

  if (!order) {
    // eBay order IDs are sometimes shown with a leading '#' or mixed case.
    order = await Order.findOne({
      ...(shopId ? { shopId } : {}),
      externalOrderId: { $regex: `^${escapeRegex(queryRef)}$`, $options: 'i' },
    }).lean()
  }

  if (!order) {
    return { error: `Order #${queryRef} was not found in the selected shop.` }
  }

  return {
    sourceId: `order:${order.externalOrderId}`,
    orderRef: order.externalOrderId,
    status: order.status,
    carrier: order.shipping?.carrier || 'Not assigned',
    trackingNumber: order.shipping?.trackingNumber || 'Pending assignment',
    totalAmount: `${order.totals?.currency || 'USD'} ${order.totals?.total ?? 0}`,
    items: (order.items || []).map((item) => ({
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
    })),
    placedAt: order.placedAt || order.createdAt,
  }
}

module.exports = {
  searchFaqPolicies,
  searchProducts,
  getProductDetails,
  getOrderDetails,
  stripHtml,
}
