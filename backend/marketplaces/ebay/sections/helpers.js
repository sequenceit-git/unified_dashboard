/** Helpers shared by this shop's section files. */
const ebayConfig = require('../config')
const { ebayFetch } = require('../client')

const ebayGet = ebayFetch

const ebayApiz = () => (ebayConfig.environment === 'SANDBOX' ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com')

/**
 * Wraps a table loader so a missing OAuth scope reads as what to do, not as eBay's error text:
 * 401/403 or an "insufficient scope/permission" error → "Reconnect eBay in Settings to allow <feature>."
 */
function scopeAware(load, feature) {
  return async (...args) => {
    try {
      return await load(...args)
    } catch (err) {
      const denied = err?.status === 401 || err?.status === 403 || /insufficient|scope|permission/i.test(err?.message || '')
      if (denied) throw new Error(`Reconnect eBay in Settings to allow ${feature}.`)
      throw err
    }
  }
}

module.exports = { ebayGet, ebayApiz, scopeAware }
