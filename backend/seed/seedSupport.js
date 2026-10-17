/**
 * Support knowledge-base seeder for the Customer Support AI.
 * Loads the JSON files in seed/support/ and upserts them into MongoDB:
 *   - support_policies  <- seed/support/policies.json
 *   - support_faqs      <- seed/support/faqs.json
 *
 * Entries are matched by their stable `code`, so re-running is safe and
 * updates changed entries without duplicating anything.
 *
 * Usage: npm run seed:support
 */
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') })
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') })
require('dotenv').config()
const mongoose = require('mongoose')

const SupportPolicy = require('../models/SupportPolicy')
const SupportFaq = require('../models/SupportFaq')

function readJson(fileName) {
  const filePath = path.join(__dirname, 'support', fileName)
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`${fileName} must contain a JSON array`)
  for (const entry of parsed) {
    if (!entry.code || !entry.title && !entry.question) {
      throw new Error(`${fileName}: every entry needs a "code" and a title/question`)
    }
  }
  return parsed
}

async function upsertByCode(Model, docs, label) {
  let created = 0
  let updated = 0
  for (const doc of docs) {
    const normalized = {
      status: 'active',
      marketplaces: ['all'],
      version: 1,
      ...doc,
    }
    const existing = await Model.findOne({ code: normalized.code }).select('_id').lean()
    if (existing) {
      await Model.updateOne({ _id: existing._id }, { $set: normalized })
      updated += 1
    } else {
      await Model.create(normalized)
      created += 1
    }
  }
  console.log(`${label}: ${created} created, ${updated} updated (total ${docs.length})`)
  return { created, updated }
}

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

  const policies = readJson('policies.json')
  const faqs = readJson('faqs.json')

  const policyStats = await upsertByCode(SupportPolicy, policies, 'Support policies')
  const faqStats = await upsertByCode(SupportFaq, faqs, 'Support FAQs')

  console.log('Done.', {
    policies: await SupportPolicy.countDocuments({}),
    faqs: await SupportFaq.countDocuments({}),
    policyStats: `${policyStats.created} created / ${policyStats.updated} updated`,
    faqStats: `${faqStats.created} created / ${faqStats.updated} updated`,
  })

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('Support seed failed:', err.message)
  process.exit(1)
})
