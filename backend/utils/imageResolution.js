/**
 * Utilities for upgrading e-commerce CDN image URLs to high-resolution master images
 * and validating dimensions against marketplace requirements (e.g. eBay 500px policy).
 */

/**
 * Upgrades known marketplace and CDN thumbnail URLs into full master resolution images.
 * E.g.:
 * - Walmart: removes `?odnHeight=117&odnWidth=117` query params (delivers 2200x2200 original)
 * - eBay: replaces `/thumbs/images/` with `/images/` and `/s-l\d+\.` with `/s-l1600.`
 * - Amazon: replaces `\._[A-Z0-9_,]+_\.` with `._SL1500_.`
 * - Temu (kwcdn): replaces `thumbnail/\d+x` or `resize/w/\d+/` with `thumbnail/1200x` or `resize/w/1200/`
 * - TikTok (tiktokcdn / ibyteimg): strips dynamic resize transforms
 */
function upgradeImageUrlToHighRes(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  let url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) return url

  try {
    // 1. Walmart images
    if (/walmartimages\.com/i.test(url)) {
      // Remove thumbnail query parameters to fetch the uncompressed original
      url = url.replace(/\?(?:odnBg=[^&]*&?)?(?:odnHeight=\d+&?)?(?:odnWidth=\d+&?)?.*/i, '')
    }

    // 2. eBay images
    if (/ebayimg\.com/i.test(url)) {
      url = url
        .replace(/\/thumbs\/images\//gi, '/images/')
        .replace(/\/s-l\d+\./gi, '/s-l1600.')
    }

    // 3. Amazon images
    if (/media-amazon\.com|images-amazon\.com|ssl-images-amazon\.com/i.test(url)) {
      url = url.replace(/\._[A-Z0-9_,]+_\./gi, '._SL1500_.')
    }

    // 4. Temu / Kwcdn images
    if (/kwcdn\.com/i.test(url)) {
      url = url
        .replace(/imageMogr2\/thumbnail\/\d+x/gi, 'imageMogr2/thumbnail/1200x')
        .replace(/\/resize\/w\/\d+\//gi, '/resize/w/1200/')
    }

    // 5. TikTok / Byteimg images
    if (/ibyteimg\.com|tiktokcdn\.com/i.test(url)) {
      url = url.replace(/~tplv-[a-z0-9]+-(?:resize|crop):\d+:\d+/gi, '')
    }
  } catch {
    // fallback to original if parsing fails
  }

  return url
}

/**
 * Probes the width and height of an image by fetching only the first 32 KB binary header.
 * Supports JPEG (SOF0/SOF2 markers), PNG (IHDR chunk), WebP (VP8/VP8L/VP8X), and GIF.
 * Completes in ~20-50ms without loading the entire image into memory.
 */
async function probeImageDimensions(url, timeoutMs = 4000) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Range: 'bytes=0-32768',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    })
    if (!res.ok && res.status !== 206) return null

    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (!buffer || buffer.length < 24) return null

    // PNG: bytes 16-24
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      return { width, height, longestSide: Math.max(width, height) }
    }

    // JPEG: scan for SOF0 (0xFF, 0xC0) or SOF2 (0xFF, 0xC2)
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xFF) {
          offset++
          continue
        }
        const marker = buffer[offset + 1]
        if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
          const height = buffer.readUInt16BE(offset + 5)
          const width = buffer.readUInt16BE(offset + 7)
          return { width, height, longestSide: Math.max(width, height) }
        }
        const len = buffer.readUInt16BE(offset + 2)
        offset += 2 + len
      }
    }

    // WebP: RIFF ... WEBP ...
    if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') {
      const format = buffer.subarray(12, 16).toString()
      if (format === 'VP8 ') {
        const width = buffer.readUInt16LE(26) & 0x3fff
        const height = buffer.readUInt16LE(28) & 0x3fff
        return { width, height, longestSide: Math.max(width, height) }
      }
      if (format === 'VP8L') {
        const b1 = buffer[21]
        const b2 = buffer[22]
        const b3 = buffer[23]
        const b4 = buffer[24]
        const width = 1 + (((b2 & 0x3f) << 8) | b1)
        const height = 1 + (((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
        return { width, height, longestSide: Math.max(width, height) }
      }
      if (format === 'VP8X') {
        const width = 1 + buffer.readUIntLE(24, 3)
        const height = 1 + buffer.readUIntLE(27, 3)
        return { width, height, longestSide: Math.max(width, height) }
      }
    }

    // GIF: bytes 6-10
    if (buffer.subarray(0, 3).toString() === 'GIF') {
      const width = buffer.readUInt16LE(6)
      const height = buffer.readUInt16LE(8)
      return { width, height, longestSide: Math.max(width, height) }
    }
  } catch {
    // Range request or network failed
  } finally {
    clearTimeout(timeout)
  }

  return null
}

/**
 * Filters and validates a list of image URLs against eBay's 500px resolution policy.
 * 1. Upgrades all URLs to full master resolution.
 * 2. Checks dimensions; excludes images strictly < 500px if other compliant images exist.
 * 3. Returns the clean, compliant image URL array.
 */
async function filterEbayCompliantImages(rawUrls = []) {
  const upgraded = (rawUrls || [])
    .map(upgradeImageUrlToHighRes)
    .filter((url) => /^https:\/\//i.test(url))

  if (!upgraded.length) return []

  const compliant = []
  const sub500 = []

  // Probe in parallel with concurrency
  await Promise.all(
    upgraded.map(async (url) => {
      const dims = await probeImageDimensions(url).catch(() => null)
      if (dims && dims.longestSide < 500) {
        sub500.push({ url, dims })
      } else {
        compliant.push(url)
      }
    }),
  )

  // If we found compliant (or untestable) images, return them
  if (compliant.length > 0) {
    return compliant.slice(0, 12)
  }

  // If every single image was verified < 500px, return empty so caller can inform user
  return []
}

module.exports = {
  upgradeImageUrlToHighRes,
  probeImageDimensions,
  filterEbayCompliantImages,
}
