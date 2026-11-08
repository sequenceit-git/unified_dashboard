/**
 * One place for read-only eBay REST calls made outside the EbayService class
 * (access probes in profiles.js, section loaders in sections.js).
 *
 * `iaf: true` sends the token as `IAF <token>`, which the Post-Order API requires;
 * every other REST API takes `Bearer <token>`.
 */
const ebayConfig = require('../../config/marketplaces').ebay

async function ebayFetch(token, url, { iaf = false, headers = {} } = {}) {
  const res = await fetch(url.startsWith('http') ? url : `${ebayConfig.apiBaseUrl}${url}`, {
    headers: {
      Authorization: iaf ? `IAF ${token}` : `Bearer ${token}`,
      Accept: 'application/json',
      'Accept-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      ...headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(body.errors?.[0]?.message || body.error?.[0]?.message || `eBay returned ${res.status}`)
    error.status = res.status
    throw error
  }
  return body
}

module.exports = { ebayFetch }
