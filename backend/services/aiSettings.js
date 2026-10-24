/**
 * OpenAI key and model for the AI agent. Values saved in Settings win; backend env
 * (OPENAI_API / OPENAI_API_KEY, OPENAI_MODEL) is the fallback. The key is stored encrypted
 * and never returned to the browser.
 */

const crypto = require('crypto')
const AppSetting = require('../models/AppSetting')

const DEFAULT_MODEL = 'gpt-5-mini'
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/
const CACHE_MS = 30000

let cache = { at: 0, value: null }

function secretKey() {
  const secret = process.env.SETTINGS_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('SETTINGS_SECRET or JWT_SECRET must be set to store the API key.')
  return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(text) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.')
}

/** Null when the value cannot be decrypted, e.g. after the server secret changed. */
function decrypt(payload) {
  try {
    const [iv, tag, data] = String(payload).split('.').map((part) => Buffer.from(part, 'base64'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

async function loadStored() {
  const doc = await AppSetting.findOne({ key: 'ai' }).lean()
  return doc?.value || {}
}

/** Key and model the agent should use right now. */
async function getAiConfig() {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value
  const stored = await loadStored()
  const savedKey = stored.apiKeyEnc ? decrypt(stored.apiKeyEnc) : null
  const envKey = (process.env.OPENAI_API || process.env.OPENAI_API_KEY || '').trim()
  const value = {
    apiKey: savedKey || envKey || '',
    model: stored.model || (process.env.OPENAI_MODEL || '').trim() || DEFAULT_MODEL,
  }
  cache = { at: Date.now(), value }
  return value
}

/** What Settings may show: never the key itself. */
async function getPublicAiSettings() {
  const stored = await loadStored()
  const savedKeyReadable = stored.apiKeyEnc ? decrypt(stored.apiKeyEnc) !== null : false
  const envKey = Boolean((process.env.OPENAI_API || process.env.OPENAI_API_KEY || '').trim())
  return {
    model: stored.model || (process.env.OPENAI_MODEL || '').trim() || DEFAULT_MODEL,
    defaultModel: DEFAULT_MODEL,
    hasKey: savedKeyReadable || envKey,
    keySource: savedKeyReadable ? 'settings' : envKey ? 'server' : 'none',
    keyLast4: savedKeyReadable ? stored.apiKeyLast4 || '' : '',
    keyUnreadable: Boolean(stored.apiKeyEnc) && !savedKeyReadable,
  }
}

/** Saves the model and, when given, a new key. `clearApiKey` removes the saved key. */
async function saveAiSettings({ model, apiKey, clearApiKey }, userId) {
  const stored = await loadStored()
  const next = { ...stored }

  if (model !== undefined) {
    const name = String(model || '').trim()
    if (!MODEL_PATTERN.test(name)) {
      throw Object.assign(new Error('Model name can use letters, numbers, dots, dashes, colons, and slashes (up to 80 characters).'), { status: 400 })
    }
    next.model = name
  }

  if (clearApiKey) {
    delete next.apiKeyEnc
    delete next.apiKeyLast4
  } else if (apiKey !== undefined && String(apiKey).trim()) {
    const key = String(apiKey).trim()
    if (key.length < 20 || /\s/.test(key)) {
      throw Object.assign(new Error('That does not look like an OpenAI API key.'), { status: 400 })
    }
    next.apiKeyEnc = encrypt(key)
    next.apiKeyLast4 = key.slice(-4)
  }

  await AppSetting.findOneAndUpdate(
    { key: 'ai' },
    { $set: { value: next, updatedBy: userId || null } },
    { upsert: true },
  )
  cache = { at: 0, value: null }
  return getPublicAiSettings()
}

module.exports = {
  DEFAULT_MODEL,
  getAiConfig,
  getPublicAiSettings,
  saveAiSettings,
}
