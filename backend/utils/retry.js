/**
 * Retry utility for OpenAI API calls and other async operations.
 * Implements exponential backoff with jitter.
 * Handles OpenAI rate limit (429) and server error (5xx) responses.
 */

const DEFAULT_OPTIONS = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
  // Status codes / error types that are retryable
  retryOn: (err) => {
    if (!err) return false
    // OpenAI SDK error shapes: err.status, err.error?.code
    const status = err.status || err.statusCode
    if (status === 429) return true // rate limit
    if (status >= 500) return true  // server error
    // Network-level errors
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return true
    return false
  },
}

/**
 * Runs `fn` with exponential backoff retries.
 *
 * @param {() => Promise<any>} fn  - Async function to attempt
 * @param {object}             opts - Override default options
 * @returns {Promise<any>}
 */
async function withRetry(fn, opts = {}) {
  const options = { ...DEFAULT_OPTIONS, ...opts }
  let lastErr

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const isLast = attempt === options.maxAttempts
      if (isLast || !options.retryOn(err)) {
        throw err
      }

      // Exponential backoff: base * 2^(attempt-1)
      let delay = Math.min(options.baseDelayMs * Math.pow(2, attempt - 1), options.maxDelayMs)

      // Add jitter (±25%) to avoid thundering herd
      if (options.jitter) {
        delay = delay * (0.75 + Math.random() * 0.5)
      }

      // Respect Retry-After header if present
      const retryAfter = err.headers?.['retry-after']
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10)
        if (!isNaN(seconds)) {
          delay = Math.max(delay, seconds * 1000)
        }
      }

      console.warn(
        `[retry] Attempt ${attempt}/${options.maxAttempts} failed (${err.status || err.message}). ` +
          `Retrying in ${Math.round(delay / 1000)}s...`,
      )

      await sleep(delay)
    }
  }

  throw lastErr
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = { withRetry, sleep }
