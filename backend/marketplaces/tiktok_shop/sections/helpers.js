/** Helpers shared by this shop's section files. */
const tiktok = require('../service')

const ttMoney = (value, currency) => (value != null && value !== '' ? { value: Number(value), currency: currency || 'USD' } : null)

const ttPost = (token, shop, path, body = {}, query = { page_size: 50 }) => tiktok.call(token, 'POST', path, { shop, query, body })

const ttGet = (token, shop, path, query) => tiktok.call(token, 'GET', path, { shop, query })

const ttPut = (token, shop, path, body = {}, query = {}) => tiktok.call(token, 'PUT', path, { shop, query, body })

const ttDelete = (token, shop, path, body = {}, query = {}) => tiktok.call(token, 'DELETE', path, { shop, query, body })

/** Runs `primary` and falls back to `fallback` only when the API path/version is unsupported or unstubbed. */
async function withVersionFallback(primary, fallback) {
  try {
    return await primary()
  } catch (err) {
    if (!/version|not found|404|unexpected \//i.test(err?.message || '')) throw err
    return fallback()
  }
}

const ttRange = (days, now = new Date()) => {
  const to = now
  const from = new Date(to - days * 86400000)
  return { start_date_ge: from.toISOString().slice(0, 10), end_date_lt: to.toISOString().slice(0, 10) }
}

// TikTok's "no permission for this API" answers. Token problems (105002–105004, HTTP 401) are not
// scope problems: they mean the login needs refreshing, and pass through unchanged.
const NO_PERMISSION_CODES = new Set([105005, 105006])

/** Wraps a table loader: a missing TikTok scope reads as what to do, naming the scope. */
function scopeAware(load, scope) {
  return async (...args) => {
    try {
      return await load(...args)
    } catch (err) {
      const code = Number(err?.code)
      const msg = err?.message || ''
      const notScope = err?.status === 401 || /invalid|param|required|cannot be empty|not found/i.test(msg)
      const denied = !notScope && (
        NO_PERMISSION_CODES.has(code)
        || err?.status === 403
        || /no permission|not authori[sz]ed|access denied|insufficient.*scope|missing.*scope/i.test(msg)
      )
      if (denied) throw new Error(`Your TikTok app doesn't have the ${scope} scope: enable it in Partner Center, then reconnect the shop in Settings.`)
      throw err
    }
  }
}

module.exports = { ttMoney, ttPost, ttGet, ttPut, ttDelete, withVersionFallback, ttRange, scopeAware }
