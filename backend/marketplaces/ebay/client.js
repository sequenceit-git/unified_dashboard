/**
 * eBay Marketplace Integration Service
 * Uses eBay REST APIs: Sell Fulfillment, Inventory, and OAuth 2.0
 */
const config = require('./config')
const trading = require('./trading')

class EbayClient {
  /** What the List dialog shows for eBay (Trading API AddFixedPriceItem, Taxonomy API). */
  listingCapabilities = {
    canList: true,
    apiName: 'eBay Trading API',
    titleMax: 80,
    subtitleMax: 55,
    maxImages: 12,
    categorySearch: true,
    categoryAutoPick: false,
    attributes: true,
    variants: true,
    condition: true,
    conditionDescription: true,
    identifierCode: true,
    mpn: true,
    bestOffer: true,
    dispatchTime: true,
    packageDetails: true,
    editAfterListing: ['title', 'description', 'price', 'stock', 'images'],
    listingActions: ['end', 'relist'],
    note: 'Shipping, returns and item location are copied from your existing eBay listings. Supports variations, category conditions, item specifics, identifiers, Best Offer, and handling time.',
  }

  /**
   * Generates the OAuth authorization URL for the seller consent page
   */
  getAuthUrl(state = '') {
    const scopeParam = encodeURIComponent(config.scopes.join(' '))
    const ruNameParam = encodeURIComponent(config.ruName)
    const stateParam = encodeURIComponent(state)
    const base = config.authBaseUrl

    return `${base}/oauth2/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${ruNameParam}&scope=${scopeParam}&state=${stateParam}`
  }

  /**
   * Exchanges an authorization code for access and refresh tokens
   */
  async exchangeCode(code) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('eBay credentials (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET) are missing')
    }

    const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.ruName,
    })

    const response = await fetch(`${config.apiBaseUrl}${config.tokenEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`eBay Token Error: ${err.error_description || response.statusText}`)
    }

    // eBay's reply doesn't list scopes; the seller just consented to exactly these.
    return { ...(await response.json()), grantedScopes: [...config.scopes] }
  }

  /**
   * Refreshes an expired access token using the refresh token
   */
  async refreshToken(refreshToken) {
    const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      // No `scope`: eBay then keeps the scopes the seller originally granted. Sending the full
      // config list fails with invalid_scope for shops connected before a scope was added.
    })

    const response = await fetch(`${config.apiBaseUrl}${config.tokenEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const error = new Error(`eBay Refresh Error: ${err.error_description || response.statusText}`)
      // invalid_grant: the refresh token was revoked or has run out. Only a new login fixes it.
      error.deadLogin = err.error === 'invalid_grant'
      throw error
    }

    return response.json()
  }

  /**
   * Post-Order API call. This API takes the seller token as `IAF <token>`, not `Bearer`.
   * Returns the parsed body ({} for 204).
   */
  async postOrder(accessToken, path, { method = 'GET', body, label = 'eBay Post-Order Error' } = {}) {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `IAF ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload.errors?.[0]?.message || payload.errors?.[0]?.longMessage || payload.message || response.statusText
      const error = new Error(`${label}: ${detail}`)
      error.status = response.status
      throw error
    }
    return payload
  }

  /** The seller account a login belongs to, e.g. { username: 'my-store' }. */
  async getAccount(accessToken) {
    const { userId } = await trading.getUser(accessToken)
    return { username: userId }
  }

  /**
   * Retrieves App (client credentials) access token for public eBay Browse API
   */
  async getApplicationToken() {
    if (!config.clientId || !config.clientSecret) return null
    const authHeader = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    })

    try {
      const response = await fetch(`${config.apiBaseUrl}${config.tokenEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authHeader}`,
        },
        body: body.toString(),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.access_token
    } catch {
      return null
    }
  }

  async ebayJson(accessToken, path, { method = 'GET', body } = {}) {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload.errors?.[0]?.message || payload.message || response.statusText
      const error = new Error(`eBay messages: ${detail}`)
      error.status = response.status
      throw error
    }
    return payload
  }
}

/**
 * One place for read-only eBay REST calls made outside the service object
 * (access probes in profiles.js, section loaders in sections.js).
 *
 * `iaf: true` sends the token as `IAF <token>`, which the Post-Order API requires;
 * every other REST API takes `Bearer <token>`.
 */
async function ebayFetch(token, url, { iaf = false, headers = {} } = {}) {
  const res = await fetch(url.startsWith('http') ? url : `${config.apiBaseUrl}${url}`, {
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

/** A REST call with any method and a JSON body (Bearer token); returns the parsed body, {} for 204. */
async function ebaySend(token, method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `${config.apiBaseUrl}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(payload.errors?.[0]?.message || `eBay returned ${res.status}`)
    error.status = res.status
    throw error
  }
  return payload
}

module.exports = { EbayClient, ebayFetch, ebaySend }
