/**
 * Dev seed for the `unified_dashboard` database.
 * Fake data only — for building/testing features before real marketplace integration.
 *
 * Usage: npm run seed
 * Wipes and re-seeds all 14 collections.
 */
require('dotenv').config({ path: '.env.local' })
require('dotenv').config()
const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')

const User = require('../models/User')
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
const SyncLog = require('../models/SyncLog')
const Notification = require('../models/Notification')
const AuditLog = require('../models/AuditLog')

const ALL = [User, Shop, Product, Listing, InventoryLog, Order, Customer, Conversation, Message, MessageTemplate, ResearchReport, SyncLog, Notification, AuditLog]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

async function main() {
  await mongoose.connect(process.env.MONGODB_URL || process.env.MONGO_URI)
  console.log('connected to db:', mongoose.connection.name)

  for (const m of ALL) await m.deleteMany({})
  console.log('cleared 14 collections')

  const passwordHash = await bcrypt.hash('Temp1234!', 10)

  // --- users ---
  const admin = await User.create({
    name: 'Dev Admin', email: 'admin@dev.local', passwordHash, role: 'super_admin',
  })

  // --- shops (one per marketplace) ---
  const shops = await Shop.insertMany([
    { name: 'MasudRana eBay Store', marketplace: 'ebay', externalShopId: 'dev-ebay-1', status: 'connected', lastSyncAt: daysAgo(0), aiReplyEnabled: true },
    { name: 'MasudRana Temu Store', marketplace: 'temu', externalShopId: 'dev-temu-1', status: 'connected', lastSyncAt: daysAgo(0) },
    { name: 'MasudRana TikTok Shop', marketplace: 'tiktok_shop', externalShopId: 'dev-tiktok-1', status: 'connected', lastSyncAt: daysAgo(1) },
  ])
  const [ebay, temu, tiktok] = shops

  await User.insertMany(
    shops.map((s, i) => ({
      name: `Shop Agent ${i + 1}`, email: `agent${i + 1}@dev.local`, passwordHash,
      role: 'sub_admin', shopId: s._id, createdBy: admin._id,
    })),
  )

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
    for (const s of [ebay, temu, tiktok].slice(0, 1 + Math.floor(Math.random() * 3))) {
      listings.push({
        productId: p._id, shopId: s._id, marketplace: s.marketplace,
        externalListingId: `${s.marketplace}-lst-${p.sku}`, status: 'live', lastSyncedAt: daysAgo(0),
      })
    }
  }
  await Listing.insertMany(listings)

  // --- customers ---
  const customers = await Customer.insertMany([
    { name: 'Alice Johnson', email: 'alice@example.com', phone: '555-0101', identities: [{ shopId: ebay._id, marketplace: 'ebay', externalBuyerId: 'ebay-buyer-1', username: 'alice_j' }], orderCount: 3, totalSpent: 120.5, lastOrderAt: daysAgo(2) },
    { name: 'Bob Smith', email: 'bob@example.com', identities: [{ shopId: temu._id, marketplace: 'temu', externalBuyerId: 'temu-buyer-2', username: 'bob s' }], orderCount: 2, totalSpent: 64.0, lastOrderAt: daysAgo(5) },
    { name: 'Carol Lee', email: 'carol@example.com', identities: [{ shopId: tiktok._id, marketplace: 'tiktok_shop', externalBuyerId: 'tt-buyer-3', username: 'carollee' }], orderCount: 4, totalSpent: 210.75, lastOrderAt: daysAgo(1) },
    { name: 'David Kim', email: 'david@example.com', identities: [{ shopId: ebay._id, marketplace: 'ebay', externalBuyerId: 'ebay-buyer-4', username: 'davidk' }], orderCount: 1, totalSpent: 49.99, lastOrderAt: daysAgo(9) },
    { name: 'Emma Davis', identities: [{ shopId: temu._id, marketplace: 'temu', externalBuyerId: 'temu-buyer-5', username: 'emma_d' }], orderCount: 2, totalSpent: 44.98, lastOrderAt: daysAgo(4) },
    { name: 'Frank Moore', email: 'frank@example.com', identities: [{ shopId: tiktok._id, marketplace: 'tiktok_shop', externalBuyerId: 'tt-buyer-6', username: 'frankm' }], orderCount: 1, totalSpent: 29.99, lastOrderAt: daysAgo(12) },
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
      externalOrderId: `${shop.marketplace}-ord-${1000 + i}`,
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
    { shopId: temu._id, marketplace: 'temu', customerId: customers[1]._id, externalThreadId: 'temu-th-2', orderId: orders[1]._id, status: 'open', aiEnabled: false, lastMessageAt: daysAgo(1), lastMessagePreview: 'Thanks, got it!', unreadCount: 0 },
    { shopId: tiktok._id, marketplace: 'tiktok_shop', customerId: customers[2]._id, externalThreadId: 'tt-th-3', status: 'closed', aiEnabled: true, lastMessageAt: daysAgo(4), lastMessagePreview: 'Refund processed.', unreadCount: 0 },
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

main().catch((e) => { console.error('SEED_FAIL', e); process.exit(1) })
