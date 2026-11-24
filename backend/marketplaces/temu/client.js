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
  /** Publishing a new Temu goods record is still done in Seller Center. Stock can be pushed. */
  listingCapabilities = {
    canList: false,
    apiName: 'Temu Open API',
    editAfterListing: ['quantity'],
    note: 'Create the goods in Temu Seller Center. Stock changes made here are sent with bg.local.goods.stock.edit.',
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
      const err = new Error(body.errorMsg || body.error_msg || `Temu ${type} failed`)
      err.code = body.errorCode ?? body.error_code
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
