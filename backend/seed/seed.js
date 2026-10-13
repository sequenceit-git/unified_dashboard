/**
 * Clean System Initializer for the `unified_dashboard` database.
 * Removes any legacy mock / demo data and ensures a root super admin user exists.
 * Does NOT inject any mock products, fake orders, fake customers, or fake chats.
 *
 * Usage: npm run seed
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
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
const ResearchReport = require('../models/ResearchReport')
const SyncLog = require('../models/SyncLog')
const Notification = require('../models/Notification')
const AuditLog = require('../models/AuditLog')

async function main() {
  const uri = process.env.MONGODB_URL || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/unified_dashboard'
  const dns = require('dns')
  let resolvedUri = uri
  if (uri.includes('mongo:27017')) {
    try {
      await dns.promises.lookup('mongo')
    } catch {
      resolvedUri = uri.replace('mongo:27017', '127.0.0.1:27017')
      console.log(`'mongo' hostname not resolved on host, using local fallback: ${resolvedUri}`)
    }
  }

  await mongoose.connect(resolvedUri)
  console.log('Connected to MongoDB:', mongoose.connection.name)

  // 1. Purge any legacy mock / demo data
  console.log('Purging any mock/demo entries...')
  const purgedProducts = await Product.deleteMany({
    $or: [{ sku: /^DEV-/i }, { brand: 'DevBrand' }],
  })
  const purgedListings = await Listing.deleteMany({
    externalListingId: /^ebay-lst-DEV-/i,
  })
  const purgedOrders = await Order.deleteMany({
    externalOrderId: /^ebay-ord-/i,
  })
  const purgedCustomers = await Customer.deleteMany({
    $or: [
      { 'identities.externalBuyerId': /^ebay-buyer-/i },
      { email: /@example\.com$/i },
    ],
  })
  const purgedConvos = await Conversation.deleteMany({
    externalThreadId: /^ebay-th-/i,
  })
  const purgedMessages = await Message.deleteMany({
    externalMessageId: /^ebay-th-/i,
  })
  const purgedReports = await ResearchReport.deleteMany({
    summary: /^Dev summary:/i,
  })

  console.log(`Purged mock data:
  - Products: ${purgedProducts.deletedCount}
  - Listings: ${purgedListings.deletedCount}
  - Orders: ${purgedOrders.deletedCount}
  - Customers: ${purgedCustomers.deletedCount}
  - Conversations: ${purgedConvos.deletedCount}
  - Messages: ${purgedMessages.deletedCount}
  - Reports: ${purgedReports.deletedCount}`)

  // 2. Ensure super admin user exists
  const existingAdmin = await User.findOne({ role: 'super_admin' })
  if (!existingAdmin) {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@dev.local').toLowerCase()
    const adminPassword = process.env.ADMIN_PASSWORD || 'Temp1234!'
    const passwordHash = await bcrypt.hash(adminPassword, 10)

    const admin = await User.create({
      name: process.env.ADMIN_NAME || 'Super Admin',
      email: adminEmail,
      passwordHash,
      role: 'super_admin',
      status: 'active',
    })
    console.log(`Created Super Admin user: ${admin.email} (password: ${adminPassword})`)
  } else {
    console.log(`Super Admin already exists: ${existingAdmin.email}`)
  }

  console.log('Database initialized cleanly without mock or demo data.')
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('Initialization failed:', e)
  process.exit(1)
})
