const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { requireAuth, loadAccess } = require('../../middleware/auth')

const router = express.Router()

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

/** File extension from the image's first bytes, or '' when it isn't a PNG, JPEG, WebP or GIF. */
function imageExtension(buffer) {
  if (buffer.length < 12) return ''
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return 'png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return 'gif'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return ''
}

// POST /api/upload — accepts base64 data URL or raw image payloads
router.post('/', requireAuth, loadAccess, async (req, res) => {
  try {
    const { image, images, filename } = req.body

    const processItem = (dataUri, origName = 'upload.png') => {
      if (!dataUri) return null

      // If it's already a regular HTTP/HTTPS URL, return as-is
      if (typeof dataUri === 'string' && (dataUri.startsWith('http://') || dataUri.startsWith('https://'))) {
        return dataUri
      }

      // Data URI or plain base64. The declared type is ignored: the bytes decide, and only images
      // are kept. Anything else (HTML, SVG, scripts) would be served from our own domain.
      const matches = dataUri.match(/^data:[^;,]*;base64,(.+)$/)
      const buffer = Buffer.from(matches ? matches[1] : dataUri, 'base64')
      const extension = imageExtension(buffer)
      if (!extension) throw Object.assign(new Error('Only PNG, JPEG, WebP or GIF images can be uploaded.'), { status: 400 })

      const hash = crypto.randomBytes(8).toString('hex')
      const sanitizedName = (origName || 'file').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20)
      const saveName = `${Date.now()}_${hash}_${sanitizedName}.${extension}`
      const fullPath = path.join(UPLOADS_DIR, saveName)

      fs.writeFileSync(fullPath, buffer)
      return `/uploads/${saveName}`
    }

    if (Array.isArray(images)) {
      const urls = images.map((img, i) => processItem(img, `image_${i}`))
      return res.status(201).json({ urls: urls.filter(Boolean) })
    }

    if (image) {
      const url = processItem(image, filename)
      return res.status(201).json({ url })
    }

    return res.status(400).json({ error: 'No image data provided' })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

module.exports = router
