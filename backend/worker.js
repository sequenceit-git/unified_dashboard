// Sync worker: loads new marketplace data (inbox, orders, listings) in the background.
// Run next to the API with the same env: `node worker.js`. Needs REDIS_URL.
const path = require('path')
const root = path.join(__dirname, '..')
require('dotenv').config({ path: path.join(root, '.env.local'), quiet: true })
require('dotenv').config({ path: path.join(root, '.env'), quiet: true })
const connectDB = require('./config/db')
const { startWorker } = require('./services/syncQueue')

connectDB(process.env.MONGODB_URL || process.env.MONGO_URI)
  .then(startWorker)
  .then((worker) => {
    const stop = async () => {
      await worker.close()
      process.exit(0)
    }
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
  })
  .catch((err) => {
    console.error(`[sync] worker could not start: ${err.message}`)
    process.exit(1)
  })
