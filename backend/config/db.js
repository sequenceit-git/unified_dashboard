const mongoose = require('mongoose')

async function connectDB(uri, retries = 5, delayMs = 2000) {
  if (!uri) {
    console.log('MONGODB_URL not set — skipping MongoDB connection')
    return
  }
  // Serverless-safe: reuse the existing connection on warm invocations.
  if (mongoose.connection.readyState !== 0) return

  let resolvedUri = uri
  if (uri.includes('mongo:27017')) {
    const dns = require('dns')
    try {
      await dns.promises.lookup('mongo')
    } catch {
      resolvedUri = uri.replace('mongo:27017', '127.0.0.1:27017')
      console.log(`'mongo' hostname not resolved on host, using local fallback: ${resolvedUri}`)
    }
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(resolvedUri)
      console.log('MongoDB connected successfully')
      return
    } catch (err) {
      // If uri uses docker service hostname 'mongo' and cannot be resolved locally, fallback to 127.0.0.1
      if (err.message && err.message.includes('ENOTFOUND') && uri.includes('mongo:27017')) {
        const fallbackUri = uri.replace('mongo:27017', '127.0.0.1:27017')
        console.log(`Could not resolve 'mongo', attempting local fallback '${fallbackUri}'...`)
        try {
          await mongoose.connect(fallbackUri)
          console.log('MongoDB connected successfully (via local fallback)')
          return
        } catch (fallbackErr) {
          console.warn('Local fallback also failed:', fallbackErr.message)
        }
      }

      console.warn(`MongoDB connection attempt ${attempt}/${retries} failed:`, err.message)
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delayMs))
      } else {
        console.error('All MongoDB connection attempts exhausted (server still running):', err.message)
      }
    }
  }
}

module.exports = connectDB
