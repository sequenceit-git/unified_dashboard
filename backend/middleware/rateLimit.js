/**
 * Small in-memory rate limiter for the sandbox support chat.
 *
 * The dashboard runs one Node process per deployment, so a Map-backed limiter
 * is enough for the sandbox. Replace with Redis when the production adapter is
 * added.
 */
function createRateLimiter({ windowMs, max, keyGenerator, message }) {
  const buckets = new Map()
  let requestCount = 0

  return function rateLimiter(req, res, next) {
    if (!max || max <= 0) return next()

    const key = String(keyGenerator(req) || req.ip || 'unknown')
    const now = Date.now()
    let bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({
        error: message || 'Too many requests. Please wait a moment and try again.',
      })
    }

    // Cheap periodic cleanup so the map does not grow forever.
    requestCount += 1
    if (requestCount % 500 === 0) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey)
      }
    }

    return next()
  }
}

module.exports = { createRateLimiter }
