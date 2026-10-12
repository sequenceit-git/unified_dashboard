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
const Shop = require('../models/Shop')

async function main() {
  await mongoose.connect(process.env.MONGODB_URL || process.env.MONGO_URI)
  console.log('Connected to DB:', mongoose.connection.name)

  const passwordHash = await bcrypt.hash('Temp1234!', 10)

  // Ensure Admin exists
  let admin = await User.findOne({ email: 'admin@dev.local' })
  if (!admin) {
    admin = await User.create({
      name: 'Super Admin',
      email: 'admin@dev.local',
      passwordHash,
      role: 'super_admin',
    })
    console.log('Created Super Admin user: admin@dev.local')
  }

  // Ensure marketplace shop entries exist in disconnected state ready for OAuth
  const marketplaces = [
    { marketplace: 'ebay', name: 'eBay Store' },
    { marketplace: 'temu', name: 'Temu Store' },
    { marketplace: 'tiktok_shop', name: 'TikTok Shop' },
  ]

  for (const m of marketplaces) {
    const existing = await Shop.findOne({ marketplace: m.marketplace })
    if (!existing) {
      await Shop.create({
        name: m.name,
        marketplace: m.marketplace,
        status: 'disconnected',
      })
      console.log(`Created placeholder shop for ${m.name} (ready for connection)`)
    }
  }

  console.log('Base setup complete. No mock products, orders, or customers injected.')
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('INIT_FAIL', e)
  process.exit(1)
})
