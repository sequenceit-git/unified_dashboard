const mongoose = require('mongoose')

async function connectDB(uri) {
  if (!uri) {
    console.log('MONGODB_URL not set — skipping MongoDB connection')
    return
  }
  try {
    await mongoose.connect(uri)
    console.log('MongoDB connected')
  } catch (err) {
    console.error('MongoDB connection error (server still running):', err.message)
  }
}

module.exports = connectDB
