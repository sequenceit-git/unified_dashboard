/**
 * Temu US local-seller Open API client: request signing, the one POST router, auth.
 * Order and listing methods live in orders.js and listings.js; service.js puts them together.
 * One POST router; every call is `call(type, params)`. Orders: bg.order.list.v2.get,
 * bg.order.shippinginfo.v2.get, bg.order.amount.query. Shipping: bg.logistics.shipment.v2.confirm.
 * Cancel: temu.order.cancel.outofstock.apply. After-sales: bg.aftersales.*, temu.aftersales.refund.issue.
 * Goods: bg.local.goods.*. Webhooks: see webhooks.js.
 */

const crypto = require('crypto')
const config = require('./config')

class TemuClient {
  /** New goods are listed with the Temu form (bg.local.goods.add); Temu reviews them first. */
  listingCapabilities = {
    canList: true,
    apiName: 'Temu Open API',
    editAfterListing: ['quantity', 'title', 'description', 'images', 'attributes'],
    note: 'New goods go to Temu for review before they are on sale. Stock changes are sent with bg.local.goods.stock.edit.',
  }

  /** bg.local.goods.list.query is filtered to goods on sale, so an off-sale (paused) goods missing from it is not ended. */
  endableStatuses = ['live', 'out_of_stock']

  getAuthUrl(state = '') {
    if (!config.appKey) throw new Error('Temu app key (TEMU_APP_KEY) is missing')
    const params = new URLSearchParams({
      appKey: config.appKey,
      redirect_uri: config.redirectUri,
      state,
    })
    return `${config.authUrl}?${params.toString()}`
  }

  async exchangeCode(code) {
    const result = await this.call('bg.open.accesstoken.create', {
      access_token: code,
      code,
    })
    const token = result.accessToken || result.access_token
    const mallId = result.mallId || result.mall_id
    if (!token) throw new Error('Temu did not return an access token')
    // The API methods this app may call for the shop; ask Temu when the reply doesn't list them.
    let granted = Array.isArray(result.apiScopeList) ? result.apiScopeList : null
    if (!granted) granted = (await this.call('bg.open.accesstoken.info.get', { access_token: token }).catch(() => ({}))).apiScopeList || null
    return {
      access_token: token,
      expires_in: result.expiredTime || result.expires_in,
      externalShopId: mallId ? String(mallId) : `temu-${Date.now()}`,
      shopName: result.mallName || 'Temu Shop',
      ...(granted ? { grantedScopes: granted } : {}),
    }
  }

  async refreshToken() {
    throw new Error('Temu US local tokens are reissued from Seller Center authorization')
  }

  async call(type, business) {
    if (!config.appKey || !config.appSecret) {
      throw new Error('Temu credentials (TEMU_APP_KEY, TEMU_APP_SECRET) are missing')
    }
    const payload = {
      type,
      app_key: config.appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      data_type: 'JSON',
      ...business,
    }
    payload.sign = sign(payload, config.appSecret)
    const response = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.success === false) {
      const raw = body.errorMsg || body.error_msg || `Temu ${type} failed`
      // Temu only answers calls from server IPs listed for the app: say where to add it.
      const ipBlocked = /NOT_IN_IP_WHITE_LIST/i.test(raw)
      const code = body.errorCode ?? body.error_code
      // 230016701 on the ads calls: the shop hasn't switched Temu Ads on (agreement, ad reserve).
      const adsInactive = Number(code) === 230016701
      const err = new Error(ipBlocked
        ? "Temu blocked this server's IP (NOT_IN_IP_WHITE_LIST). Add the server's public IP to your app's IP whitelist in the Temu Partner Platform."
        : adsInactive
          ? "Temu Ads isn't active for this shop. In Seller Center open Product ADS (ads.temu.com), sign the advertising agreement and set the ad reserve, then refresh."
          : raw)
      err.code = code
      if (ipBlocked) err.ipBlocked = true
      if (adsInactive) { err.adsInactive = true; err.unavailable = true }
      throw err
    }
    return body.result || body
  }
}

function sign(payload, secret) {
  const text = Object.keys(payload)
    .filter((key) => key !== 'sign' && payload[key] !== undefined && payload[key] !== null)
    .sort()
    .map((key) => `${key}${stringify(payload[key])}`)
    .join('')
  return crypto.createHash('md5').update(`${secret}${text}${secret}`).digest('hex').toUpperCase()
}

function stringify(value) {
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

module.exports = { TemuClient }
