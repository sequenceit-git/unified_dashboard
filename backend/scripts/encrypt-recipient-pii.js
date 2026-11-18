const path = require('path')
const root = path.join(__dirname, '..', '..')
require('dotenv').config({ path: path.join(root, '.env.local') })
require('dotenv').config({ path: path.join(root, '.env') })

const mongoose = require('mongoose')
const { encrypt, isEncrypted } = require('../utils/recipientPii')

function encryptPlain(value) {
  return isEncrypted(value) ? value : encrypt(value)
}

function encryptAddress(address) {
  if (!address || typeof address !== 'object') return address
  const result = { ...address }
  for (const field of ['street', 'city', 'state', 'zip', 'country']) {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = encryptPlain(result[field])
    }
  }
  return result
}

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URL || process.env.MONGO_URI)
  const db = mongoose.connection.db
  let customers = 0
  let orders = 0

  const customerRows = await db.collection('customers').find({}).toArray()
  for (const row of customerRows) {
    const update = { $set: {} }
    for (const field of ['name', 'email', 'phone']) {
      if (row[field] !== undefined && row[field] !== null) {
        update.$set[field] = encryptPlain(row[field])
      }
    }
    if (row.address) update.$set.address = encryptAddress(row.address)
    if (Array.isArray(row.addresses)) {
      update.$set.addresses = row.addresses.map(encryptAddress)
    }
    if (Object.keys(update.$set).length) {
      await db.collection('customers').updateOne({ _id: row._id }, update)
      customers += 1
    }
  }

  const orderRows = await db.collection('orders').find({}).toArray()
  for (const row of orderRows) {
    const update = { $set: {} }
    if (row.buyer) {
      const buyer = { ...row.buyer }
      for (const field of ['name', 'username', 'email', 'phone']) {
        if (buyer[field] !== undefined && buyer[field] !== null) {
          buyer[field] = encryptPlain(buyer[field])
        }
      }
      update.$set.buyer = buyer
    }
    if (row.shippingAddress) {
      update.$set.shippingAddress = encryptAddress(row.shippingAddress)
    }
    if (Object.keys(update.$set).length) {
      await db.collection('orders').updateOne({ _id: row._id }, update)
      orders += 1
    }
  }

  console.log(`Encrypted PII in ${customers} customer record(s) and ${orders} order record(s).`)
  await mongoose.disconnect()
}

migrate().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
