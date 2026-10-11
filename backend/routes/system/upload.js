const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { requireAuth } = require('../../middleware/auth')

const router = express.Router()

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// POST /api/upload — accepts base64 data URL or raw image payloads
router.post('/', requireAuth, async (req, res) => {
  try {
    const { image, images, filename } = req.body

    const processItem = (dataUri, origName = 'upload.png') => {
      if (!dataUri) return null

      // If it's already a regular HTTP/HTTPS URL, return as-is
      if (typeof dataUri === 'string' && (dataUri.startsWith('http://') || dataUri.startsWith('https://'))) {
        return dataUri
      }

      // Check if it's a data URI
      const matches = dataUri.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
      let buffer
      let extension = 'png'

      if (matches) {
        const mime = matches[1]
        extension = mime.split('/')[1] || 'png'
        if (extension === 'jpeg') extension = 'jpg'
        buffer = Buffer.from(matches[2], 'base64')
      } else {
        // Plain base64 fallback
        buffer = Buffer.from(dataUri, 'base64')
      }

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
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
