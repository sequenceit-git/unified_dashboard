require('dotenv').config({ path: '.env.local' })
require('dotenv').config()
const cors = require('cors')
const express = require('express')
const connectDB = require('./config/db')
const apiRoutes = require('./routes/system/api')
const analyticsRoutes = require('./routes/analytics/analytics')
const authRoutes = require('./routes/auth/auth')
const customerRoutes = require('./routes/sales/customers')
const dashboardRoutes = require('./routes/system/dashboard')
const inboxRoutes = require('./routes/inbox/inbox')
const inventoryRoutes = require('./routes/catalog/inventory')
const orderRoutes = require('./routes/sales/orders')
const productRoutes = require('./routes/catalog/products')
const shopRoutes = require('./routes/system/shops')

const app = express()
const PORT = process.env.PORT || 5000
// Comma-separated frontend origins, so local + deployed frontends both work
// without code changes, e.g. CLIENT_URL=http://localhost:5173,https://unified-dashboard-lime.vercel.app
const CLIENT_URLS = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(cors({ origin: CLIENT_URLS.length === 1 ? CLIENT_URLS[0] : CLIENT_URLS }))
app.use(express.json())

// Root probe — so GET / doesn't 404 (load balancers, browser checks).
app.get('/', (req, res) => {
  res.json({ message: 'Unified Dashboard API — OK', health: '/api/health' })
})

app.use('/api', apiRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/products', productRoutes)
app.use('/api/shops', shopRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/inbox', inboxRoutes)

connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)

// Local dev: `node server.js` listens. On Vercel the exported app is run by
// the serverless function in api/index.js — do NOT listen there.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`))
}

module.exports = app
