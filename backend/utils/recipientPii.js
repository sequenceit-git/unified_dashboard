const crypto = require('crypto')

const PREFIX = 'enc:v1:'

function secretKey() {
  const secret = process.env.PII_ENCRYPTION_KEY || process.env.SETTINGS_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('PII_ENCRYPTION_KEY, SETTINGS_SECRET, or JWT_SECRET must be set.')
  return crypto.createHash('sha256').update(secret).digest()
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

function encrypt(value) {
  if (value === undefined || value === null) return value
  const text = String(value)
  if (!text || isEncrypted(text)) return text

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const payload = [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.')
  return `${PREFIX}${payload}`
}

function decrypt(value) {
  if (!isEncrypted(value)) return value

  try {
    const payload = String(value).slice(PREFIX.length)
    const [iv, tag, data] = payload.split('.')
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      secretKey(),
      Buffer.from(iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return '[DECRYPTION_FAILED]'
  }
}

module.exports = { encrypt, decrypt, isEncrypted }
