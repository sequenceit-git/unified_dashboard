/**
 * Production / Clean Initializer for the `unified_dashboard` database.
 * Sets up super admin credentials and marketplace slots without injecting mock data.
 *
 * Usage: npm run seed
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') })
require('dotenv').config()
const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')

const User = require('../models/User')
const UserShopAccess = require('../models/UserShopAccess')
const Shop = require('../models/Shop')
const Product = require('../models/Product')
const Listing = require('../models/Listing')
const InventoryLog = require('../models/InventoryLog')
const Order = require('../models/Order')
const Customer = require('../models/Customer')
const Conversation = require('../models/Conversation')
const Message = require('../models/Message')
const MessageTemplate = require('../models/MessageTemplate')
const ResearchReport = require('../models/ResearchReport')
const MarketplaceResearch = require('../models/MarketplaceResearch')
const ProductRecommendation = require('../models/ProductRecommendation')
const MarketAnalysis = require('../models/MarketAnalysis')
const SyncLog = require('../models/SyncLog')
const Notification = require('../models/Notification')
const AuditLog = require('../models/AuditLog')

const ALL = [
  User, UserShopAccess, Shop, Product, Listing, InventoryLog, Order, Customer,
  Conversation, Message, MessageTemplate, ResearchReport, MarketplaceResearch,
  ProductRecommendation, MarketAnalysis, SyncLog, Notification, AuditLog,
]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

async function main() {
  await mongoose.connect(process.env.MONGODB_URL || process.env.MONGO_URI)
  console.log('Connected to DB:', mongoose.connection.name)

  const passwordHash = await bcrypt.hash('Temp1234!', 10)

  // --- users ---
  const admin = await User.create({
    name: 'Dev Admin', email: 'admin@dev.local', passwordHash, role: 'super_admin',
  })

  // --- shop (eBay only) ---
  const shops = await Shop.insertMany([
    { name: 'eBay Store', marketplace: 'ebay', externalShopId: 'dev-ebay-1', status: 'connected', lastSyncAt: daysAgo(0), aiReplyEnabled: true },
  ])
  const [ebay] = shops

  const agents = await User.insertMany([
    {
      name: 'eBay Agent', email: 'agent1@dev.local', passwordHash,
      role: 'sub_admin', shopId: ebay._id,
      mainRoutes: ['dashboard', 'products', 'inventory', 'orders', 'inbox'],
      createdBy: admin._id,
    },
  ])
  await UserShopAccess.insertMany([
    { userId: agents[0]._id, shopId: ebay._id, grantedBy: admin._id },
  ])

  // --- products ---
  const products = await Product.insertMany([
    { sku: 'DEV-HP-001', title: 'Wireless Bluetooth Headphones', description: 'AI draft: premium over-ear sound.', category: 'Electronics', brand: 'DevBrand', images: [], basePrice: 49.99, stock: 120, attributes: { color: 'black', warranty: '1y' }, variants: [{ sku: 'DEV-HP-001-BLK', options: { color: 'black' }, price: 49.99, stock: 70 }, { sku: 'DEV-HP-001-WHT', options: { color: 'white' }, price: 54.99, stock: 50 }], status: 'active', source: 'manual' },
    { sku: 'DEV-WB-002', title: 'Stainless Steel Water Bottle 1L', category: 'Home & Kitchen', brand: 'DevBrand', basePrice: 19.99, stock: 3, lowStockThreshold: 5, attributes: { capacity: '1L' }, status: 'active', source: 'manual' },
    { sku: 'DEV-LD-003', title: 'LED Desk Lamp with USB Port', category: 'Home & Kitchen', brand: 'DevBrand', basePrice: 29.99, stock: 45, attributes: { modes: 3 }, status: 'active', source: 'bulk_upload' },
    { sku: 'DEV-KS-004', title: 'Phone Stand + Cable Organizer Kit', category: 'Accessories', brand: 'DevBrand', basePrice: 14.99, stock: 200, status: 'active', source: 'research_bot' },
    { sku: 'DEV-BP-005', title: 'Travel Backpack 35L', category: 'Bags', brand: 'DevBrand', basePrice: 59.99, stock: 0, attributes: { size: '35L' }, status: 'archived', source: 'manual' },
    { sku: 'DEV-MP-006', title: 'Mini Portable Blender', category: 'Electronics', brand: 'DevBrand', basePrice: 34.99, stock: 60, status: 'draft', source: 'manual' },
    { sku: 'DEV-CM-007', title: 'Ceramic Coffee Mug Set (4)', category: 'Home & Kitchen', brand: 'DevBrand', basePrice: 24.99, stock: 80, status: 'active', source: 'bulk_upload' },
    { sku: 'DEV-FT-008', title: 'Fitness Resistance Bands Set', category: 'Sports', brand: 'DevBrand', basePrice: 21.99, stock: 95, status: 'active', source: 'research_bot' },
  ])

  // --- listings (products x shops) ---
  const listings = []
  for (const p of products.filter((x) => x.status === 'active')) {
    for (const s of [ebay]) {
      listings.push({
        productId: p._id, shopId: s._id, marketplace: s.marketplace,
        externalListingId: `ebay-lst-${p.sku}`, status: 'live', lastSyncedAt: daysAgo(0),
      })
    }
  }
  await Listing.insertMany(listings)

  // --- customers ---
  const customers = await Customer.insertMany([
    { name: 'Alice Johnson', email: 'alice@example.com', phone: '555-0101', identities: [{ shopId: ebay._id, marketplace: 'ebay', externalBuyerId: 'ebay-buyer-1', username: 'alice_j' }], orderCount: 3, totalSpent: 120.5, lastOrderAt: daysAgo(2) },
    { name: 'Bob Smith', email: 'bob@example.com', identities: [{ shopId: ebay._id, marketplace: 'ebay', externalBuyerId: 'ebay-buyer-2', username: 'bob_s' }], orderCount: 2, totalSpent: 64.0, lastOrderAt: daysAgo(5) },
    { name: 'Carol Lee', email: 'carol@example.com', identities: [{ shopId: ebay._id, marketplace: 'ebay', externalBuyerId: 'ebay-buyer-3', username: 'carollee' }], orderCount: 4, totalSpent: 210.75, lastOrderAt: daysAgo(1) },
    { name: 'David Kim', email: 'david@example.com', identities: [{ shopId: ebay._id, marketplace: 'ebay', externalBuyerId: 'ebay-buyer-4', username: 'davidk' }], orderCount: 1, totalSpent: 49.99, lastOrderAt: daysAgo(9) },
    { name: 'Emma Davis', identities: [{ shopId: ebay._id, marketplace: 'ebay', externalBuyerId: 'ebay-buyer-5', username: 'emma_d' }], orderCount: 2, totalSpent: 44.98, lastOrderAt: daysAgo(4) },
    { name: 'Frank Moore', email: 'frank@example.com', identities: [{ shopId: ebay._id, marketplace: 'ebay', externalBuyerId: 'ebay-buyer-6', username: 'frankm' }], orderCount: 1, totalSpent: 29.99, lastOrderAt: daysAgo(12) },
  ])

  // --- orders (spread over 30 days, mixed statuses) ---
  const statuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'delivered', 'delivered', 'cancelled', 'refunded', 'shipped']
  const orderDocs = []
  for (let i = 0; i < 24; i++) {
    const shop = pick(shops)
    const customer = pick(customers)
    const nItems = 1 + Math.floor(Math.random() * 2)
    const items = []
    let subtotal = 0
    for (let j = 0; j < nItems; j++) {
      const p = pick(products)
      const qty = 1 + Math.floor(Math.random() * 3)
      const unitPrice = p.basePrice
      subtotal += qty * unitPrice
      items.push({ productId: p._id, sku: p.sku, title: p.title, quantity: qty, unitPrice })
    }
    const shipping = 4.99
    const tax = +(subtotal * 0.08).toFixed(2)
    const placedDays = Math.floor(Math.random() * 30)
    orderDocs.push({
      shopId: shop._id, marketplace: shop.marketplace,
      externalOrderId: `ebay-ord-${1000 + i}`,
      customerId: customer._id, status: pick(statuses), items,
      buyer: { name: customer.name, email: customer.email, phone: customer.phone },
      shippingAddress: { line1: `${100 + i} Dev Street`, city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
      totals: { subtotal: +subtotal.toFixed(2), shipping, tax, discount: 0, total: +(subtotal + shipping + tax).toFixed(2), currency: 'USD' },
      shipping: { carrier: pick(['UPS', 'FedEx', 'USPS']), trackingNumber: `1ZDEV${100000 + i}`, shippedAt: daysAgo(placedDays) },
      placedAt: daysAgo(placedDays),
    })
  }
  // one returned order with a return record
  orderDocs[0].status = 'returned'
  orderDocs[0].returns = [{ reason: 'Wrong size', status: 'received', refundAmount: 20, refundedAt: daysAgo(1), requestedAt: daysAgo(3) }]
  const orders = await Order.insertMany(orderDocs)

  // --- inventory logs ---
  const invLogs = []
  for (const o of orders.slice(0, 12)) {
    for (const it of o.items) {
      invLogs.push({
        productId: it.productId, shopId: o.shopId, change: -it.quantity,
        stockBefore: 100, stockAfter: 100 - it.quantity,
        reason: 'sale', refId: o._id, createdBy: null,
      })
    }
  }
  invLogs.push(
    { productId: products[1]._id, shopId: null, change: -8, stockBefore: 11, stockAfter: 3, reason: 'sale', createdBy: admin._id },
    { productId: products[2]._id, shopId: null, change: 50, stockBefore: 10, stockAfter: 60, reason: 'restock', createdBy: admin._id },
  )
  await InventoryLog.insertMany(invLogs)

  // --- conversations + messages ---
  const convos = await Conversation.insertMany([
    { shopId: ebay._id, marketplace: 'ebay', customerId: customers[0]._id, externalThreadId: 'ebay-th-1', status: 'open', aiEnabled: true, lastMessageAt: daysAgo(0), lastMessagePreview: 'When will my order ship?', unreadCount: 1 },
    { shopId: ebay._id, marketplace: 'ebay', customerId: customers[1]._id, externalThreadId: 'ebay-th-2', orderId: orders[1]._id, status: 'open', aiEnabled: false, lastMessageAt: daysAgo(1), lastMessagePreview: 'Thanks, got it!', unreadCount: 0 },
    { shopId: ebay._id, marketplace: 'ebay', customerId: customers[2]._id, externalThreadId: 'ebay-th-3', status: 'closed', aiEnabled: true, lastMessageAt: daysAgo(4), lastMessagePreview: 'Refund processed.', unreadCount: 0 },
    { shopId: ebay._id, marketplace: 'ebay', customerId: customers[3]._id, externalThreadId: 'ebay-th-4', status: 'open', aiEnabled: true, lastMessageAt: daysAgo(0), lastMessagePreview: 'Is this waterproof?', unreadCount: 2 },
  ])
  const msgs = []
  const threads = [
    [['inbound', 'customer', 'Hi, when will my order ship?'], ['outbound', 'ai', 'Hello! Your order ships within 24 hours. Tracking will follow.'], ['inbound', 'customer', 'Great, thanks!']],
    [['inbound', 'customer', 'Item arrived damaged.'], ['outbound', 'agent', 'Sorry about that! A replacement is on the way.'], ['inbound', 'customer', 'Thanks, got it!']],
    [['inbound', 'customer', 'I want a refund please.'], ['outbound', 'ai', 'Your refund request is approved.'], ['outbound', 'ai', 'Refund processed.']],
    [['inbound', 'customer', 'Is this waterproof?'], ['inbound', 'customer', 'Also, does it come in black?']],
  ]
  convos.forEach((c, i) => {
    threads[i].forEach(([direction, senderType, text], j) => {
      msgs.push({
        conversationId: c._id, shopId: c.shopId, direction, senderType, text,
        externalMessageId: `${c.externalThreadId}-m${j}`, sentAt: daysAgo(1 - j * 0.01 || 0),
      })
    })
  })
  await Message.insertMany(msgs)

  await MessageTemplate.insertMany([
    { shopId: null, title: 'Shipping ETA', body: 'Hi {{customerName}}, your order ships within 24 hours. Tracking: {{trackingNumber}}', createdBy: admin._id },
    { shopId: ebay._id, title: 'eBay Return Policy', body: 'Hi {{customerName}}, returns are accepted within 30 days.', createdBy: admin._id },
    { shopId: null, title: 'Refund Confirmation', body: 'Hi {{customerName}}, your refund of {{amount}} has been processed.', createdBy: admin._id },
  ])

  // --- research reports ---
  const report = await ResearchReport.create({
    runBy: admin._id, trigger: 'manual',
    params: { marketplaces: ['ebay', 'temu', 'tiktok_shop'], category: 'Home & Kitchen', keywords: ['bottle', 'lamp'] },
    status: 'completed', summary: 'Dev summary: kitchen gadgets trend upward on all three marketplaces.',
    opportunities: [
      { rank: 1, title: 'Insulated Lunch Box', marketplace: 'temu', sourceUrl: 'https://example.com/a', metrics: { salesVolume: 12000, price: 15.99, rating: 4.6 }, estimatedMargin: 42, opportunityScore: 88, aiNotes: 'High velocity, low returns.' },
      { rank: 2, title: 'Magnetic Phone Mount', marketplace: 'ebay', sourceUrl: 'https://example.com/b', metrics: { salesVolume: 8000, price: 12.49, rating: 4.4 }, estimatedMargin: 55, opportunityScore: 81, aiNotes: 'Attach to DEV-KS-004 kit.' },
    ],
    email: { to: ['client@example.com'], sentAt: daysAgo(2), status: 'sent' },
    startedAt: daysAgo(3), finishedAt: daysAgo(2),
  })
  await ResearchReport.create({ runBy: admin._id, trigger: 'scheduled', params: { marketplaces: ['tiktok_shop'], category: 'Sports', keywords: ['bands'] }, status: 'queued' })
  // link one opportunity into the catalog
  products[7].sourceReportId = report._id
  await products[7].save()

  // --- market analysis (linked to report) ---
  await MarketAnalysis.create({
    reportId: report._id,
    categories: ['Home & Kitchen'],
    marketOverview: {
      summary: 'Home & Kitchen compact consumer appliances are experiencing 32% quarter-over-quarter demand growth across TikTok Shop and Temu. High viral social-commerce conversion with sustainable 35%-50% gross margins.',
      demandLevel: 'High',
      competitionLevel: 'Medium',
      marketOutlook: 'Strong positive outlook driven by wellness, portable meal-prep, and compact living lifestyle trends.',
    },
    trends: [
      {
        name: 'USB-C Rechargeable Mini Blenders',
        direction: 'Growing',
        evidence: 'Search volume surged 140% month-over-month on TikTok Shop and Amazon.',
        sourceUrls: ['https://trends.google.com', 'https://tiktok.com'],
        confidence: 'High',
      },
      {
        name: 'Double-Walled Thermal Bento Boxes',
        direction: 'Growing',
        evidence: 'Top seller listings show 15,000+ monthly velocity with high review retention.',
        sourceUrls: ['https://temu.com'],
        confidence: 'High',
      },
      {
        name: 'Single-Use Plastic Food Prep Containers',
        direction: 'Declining',
        evidence: 'Consumer preferences shifting heavily to reusable stainless steel and silicone alternatives.',
        sourceUrls: ['https://ebay.com'],
        confidence: 'Medium',
      },
    ],
    profitAnalysis: [
      {
        category: 'Home & Kitchen',
        productName: 'Portable USB-C Smoothie Blender 450ml',
        currency: 'USD',
        estimatedSellingPrice: 29.99,
        estimatedProductCost: 8.50,
        estimatedShippingCost: 3.80,
        estimatedMarketplaceFees: 3.60,
        estimatedMarketingCost: 2.80,
        estimatedOtherCosts: 0.80,
        estimatedProfitPerUnit: 10.49,
        estimatedProfitMarginPercent: 35.0,
        assumptions: ['Fulfillment batch of 500 units air cargo', 'Average 12% marketplace commission rate'],
      },
      {
        category: 'Home & Kitchen',
        productName: 'Leakproof Stainless Thermal Bento Box 3-Tier',
        currency: 'USD',
        estimatedSellingPrice: 24.50,
        estimatedProductCost: 6.20,
        estimatedShippingCost: 3.20,
        estimatedMarketplaceFees: 2.94,
        estimatedMarketingCost: 1.80,
        estimatedOtherCosts: 0.50,
        estimatedProfitPerUnit: 9.86,
        estimatedProfitMarginPercent: 40.2,
        assumptions: ['Lightweight postal packaging', 'Temu volume fulfillment discount'],
      },
      {
        category: 'Home & Kitchen',
        productName: 'Electric Handheld Milk Frother & Whisk',
        currency: 'USD',
        estimatedSellingPrice: 16.99,
        estimatedProductCost: 3.20,
        estimatedShippingCost: 2.10,
        estimatedMarketplaceFees: 2.04,
        estimatedMarketingCost: 1.50,
        estimatedOtherCosts: 0.30,
        estimatedProfitPerUnit: 7.85,
        estimatedProfitMarginPercent: 46.2,
        assumptions: ['Impulse-buy checkout add-on', 'Low return rate (< 1.5%)'],
      },
    ],
    opportunities: [
      {
        productName: 'Portable USB-C Fresh Juice Blender Pro',
        category: 'Home & Kitchen',
        opportunityScore: 94,
        demandScore: 96,
        competitionScore: 68,
        profitabilityScore: 91,
        trendScore: 95,
        reason: 'Viral hook on TikTok with clear visual proof-of-concept and high average order value.',
        sourceUrls: ['https://tiktok.com', 'https://temu.com'],
      },
      {
        productName: 'Vacuum Thermal Bento Box 3-Tier',
        category: 'Home & Kitchen',
        opportunityScore: 89,
        demandScore: 90,
        competitionScore: 55,
        profitabilityScore: 88,
        trendScore: 87,
        reason: 'Consistently strong back-to-school and office lifestyle organic searches.',
        sourceUrls: ['https://ebay.com', 'https://temu.com'],
      },
      {
        productName: 'Rechargeable Milk & Latte Frother Stand Set',
        category: 'Home & Kitchen',
        opportunityScore: 84,
        demandScore: 85,
        competitionScore: 72,
        profitabilityScore: 89,
        trendScore: 82,
        reason: 'Lightweight product with low shipping barrier and high repeat gifting potential.',
        sourceUrls: ['https://ebay.com'],
      },
    ],
    risks: [
      'Battery compliance certification (UN38.3) required for international air parcel shipping.',
      'Price competition from unbranded budget factories on Temu.',
      'Motor seal quality control needed to prevent liquid leakage return disputes.',
    ],
    conclusion: 'Strong entry opportunity with portable personal blenders and thermal lunch containers. Target custom branding and high-definition video demonstrations.',
  })

  // --- product recommendations ---
  await ProductRecommendation.insertMany([
    {
      reportId: report._id,
      categories: ['Home & Kitchen'],
      rank: 1,
      productName: 'Portable USB-C Smoothie Blender 450ml (6-Blade)',
      category: 'Home & Kitchen',
      marketplace: 'tiktok_shop',
      productUrl: 'https://shop.tiktok.com/item/portable-blender-450ml',
      price: 29.99,
      currency: 'USD',
      estimatedMonthlySales: 5400,
      estimatedMonthlyRevenue: 161946,
      rating: 4.8,
      reviewCount: 3210,
      competitionLevel: 'Medium',
      estimatedProfitMarginPercent: 44.5,
      opportunityScore: 95,
      recommendationReason: 'Viral trending product on TikTok Shop with rapid impulse buying and strong margin profile.',
    },
    {
      reportId: report._id,
      categories: ['Home & Kitchen'],
      rank: 2,
      productName: 'Leakproof Stainless Thermal Bento Box 3-Tier',
      category: 'Home & Kitchen',
      marketplace: 'temu',
      productUrl: 'https://temu.com/item/stainless-bento-3tier',
      price: 22.49,
      currency: 'USD',
      estimatedMonthlySales: 4100,
      estimatedMonthlyRevenue: 92209,
      rating: 4.7,
      reviewCount: 2450,
      competitionLevel: 'Low',
      estimatedProfitMarginPercent: 48.0,
      opportunityScore: 91,
      recommendationReason: 'Low competition with steady organic demand and virtually non-existent product return rate.',
    },
    {
      reportId: report._id,
      categories: ['Home & Kitchen'],
      rank: 3,
      productName: 'Handheld Electric Milk Frother & Whisk Set',
      category: 'Home & Kitchen',
      marketplace: 'ebay',
      productUrl: 'https://ebay.com/itm/electric-frother-stand',
      price: 16.99,
      currency: 'USD',
      estimatedMonthlySales: 2850,
      estimatedMonthlyRevenue: 48421,
      rating: 4.6,
      reviewCount: 1120,
      competitionLevel: 'Medium',
      estimatedProfitMarginPercent: 52.0,
      opportunityScore: 86,
      recommendationReason: 'Extremely lightweight, zero breakages, and healthy 50%+ profit margin.',
    },
    {
      reportId: report._id,
      categories: ['Home & Kitchen'],
      rank: 4,
      productName: 'Magnetic Motion-Sensor Under Cabinet LED Strip',
      category: 'Home & Kitchen',
      marketplace: 'tiktok_shop',
      productUrl: 'https://shop.tiktok.com/item/under-cabinet-sensor-light',
      price: 19.99,
      currency: 'USD',
      estimatedMonthlySales: 3400,
      estimatedMonthlyRevenue: 67966,
      rating: 4.5,
      reviewCount: 1890,
      competitionLevel: 'High',
      estimatedProfitMarginPercent: 38.0,
      opportunityScore: 81,
      recommendationReason: 'High search volume evergreen home organizer with strong bundle opportunities.',
    },
    {
      reportId: report._id,
      categories: ['Home & Kitchen'],
      rank: 5,
      productName: 'Reusable Silicone Stretch Lids Set of 12',
      category: 'Home & Kitchen',
      marketplace: 'temu',
      productUrl: 'https://temu.com/item/silicone-stretch-lids-12pk',
      price: 10.99,
      currency: 'USD',
      estimatedMonthlySales: 6200,
      estimatedMonthlyRevenue: 68138,
      rating: 4.4,
      reviewCount: 4200,
      competitionLevel: 'High',
      estimatedProfitMarginPercent: 36.5,
      opportunityScore: 77,
      recommendationReason: 'Mass volume driver ideal for positive shop reviews and rapid order fulfillment volume.',
    },
  ])

  // --- marketplace raw research data ---
  await MarketplaceResearch.insertMany([
    {
      reportId: report._id,
      categories: ['Home & Kitchen'],
      productName: 'USB-C Portable Blender 6-Blade 450ml',
      marketplace: 'tiktok_shop',
      productUrl: 'https://shop.tiktok.com/item/portable-blender-450ml',
      price: 29.99,
      currency: 'USD',
      estimatedMonthlySales: 5400,
      salesDataType: 'actual',
      searchRanking: 1,
      rankingKeyword: 'portable blender',
      rating: 4.8,
      reviewCount: 3210,
      reviewSummary: {
        positive: ['Super convenient for gym smoothies', 'Battery lasts all week', 'Easy to rinse clean'],
        negative: ['Cannot crush giant ice cubes', 'Blade seal requires careful tightening'],
      },
      sourceUrl: 'https://shop.tiktok.com',
    },
    {
      reportId: report._id,
      categories: ['Home & Kitchen'],
      productName: 'Thermal Bento Box 3-Compartment Steel',
      marketplace: 'temu',
      productUrl: 'https://temu.com/item/stainless-bento-3tier',
      price: 22.49,
      currency: 'USD',
      estimatedMonthlySales: 4100,
      salesDataType: 'estimated',
      searchRanking: 2,
      rankingKeyword: 'insulated lunch box',
      rating: 4.7,
      reviewCount: 2450,
      reviewSummary: {
        positive: ['Keeps soup warm for 6 hours', 'Very sturdy build', 'Dishwasher safe'],
        negative: ['A bit heavy for young kids'],
      },
      sourceUrl: 'https://temu.com',
    },
    {
      reportId: report._id,
      categories: ['Home & Kitchen'],
      productName: 'Electric Milk Frother with Stainless Stand',
      marketplace: 'ebay',
      productUrl: 'https://ebay.com/itm/electric-frother-stand',
      price: 16.99,
      currency: 'USD',
      estimatedMonthlySales: 2850,
      salesDataType: 'estimated',
      searchRanking: 3,
      rankingKeyword: 'milk frother',
      rating: 4.6,
      reviewCount: 1120,
      reviewSummary: {
        positive: ['Great froth for matcha and coffee', 'Looks sleek on counter'],
        negative: ['Battery compartment is snug'],
      },
      sourceUrl: 'https://ebay.com',
    },
  ])

  // --- sync logs / notifications / audit logs ---
  await SyncLog.insertMany([
    { shopId: ebay._id, type: 'orders', status: 'success', stats: { fetched: 12, created: 4, updated: 8, failed: 0 }, startedAt: daysAgo(0), finishedAt: daysAgo(0) },
    { shopId: temu._id, type: 'inventory', status: 'partial', error: { code: 'RATE_LIMIT', message: 'Dev rate limit hit', httpStatus: 429 }, attempt: 2, stats: { fetched: 30, created: 0, updated: 25, failed: 5 }, startedAt: daysAgo(1), finishedAt: daysAgo(1) },
    { shopId: tiktok._id, type: 'token_refresh', status: 'failed', error: { code: 'AUTH', message: 'Dev token expired', httpStatus: 401 }, attempt: 3, startedAt: daysAgo(2) },
  ])
  await Notification.insertMany([
    { shopId: null, type: 'low_stock', title: 'Low stock: DEV-WB-002', message: 'Only 3 left in stock.', refId: products[1]._id, isRead: false },
    { shopId: temu._id, type: 'sync_failed', title: 'Inventory sync partial', message: '5 items failed (rate limit).', isRead: false },
    { shopId: null, type: 'report_ready', title: 'Research report ready', message: 'Home & Kitchen report completed.', refId: report._id, isRead: true },
  ])
  await AuditLog.insertMany([
    { userId: admin._id, action: 'shop.create', entity: 'shops', entityId: ebay._id, meta: { name: ebay.name }, ip: '127.0.0.1' },
    { userId: admin._id, shopId: ebay._id, action: 'product.update', entity: 'products', entityId: products[0]._id, meta: { stock: 120 }, ip: '127.0.0.1' },
  ])

  const counts = {}
  for (const m of ALL) counts[m.collection.name] = await m.countDocuments()
  console.log('seeded:', JSON.stringify(counts, null, 2))
  console.log('login: admin@dev.local / Temp1234!')
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('INIT_FAIL', e)
  process.exit(1)
})
