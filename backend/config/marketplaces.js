/**
 * Unified Marketplace API Configuration
 * Configuration for eBay, TikTok Shop, and Temu Developer APIs.
 */

const MARKETPLACE_CONFIG = {
  ebay: {
    name: 'eBay',
    clientId: process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '',
    clientSecret: process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '',
    devId: process.env.EBAY_DEV_ID || '',
    ruName: process.env.EBAY_RUNAME || '',
    environment: (process.env.EBAY_ENV || 'PRODUCTION').toUpperCase(), // SANDBOX or PRODUCTION
    get apiBaseUrl() {
      return this.environment === 'SANDBOX'
        ? 'https://api.sandbox.ebay.com'
        : 'https://api.ebay.com'
    },
    get authBaseUrl() {
      return this.environment === 'SANDBOX'
        ? 'https://auth.sandbox.ebay.com'
        : 'https://auth.ebay.com'
    },
    tokenEndpoint: '/identity/v1/oauth2/token',
    accessToken: process.env.EBAY_ACCESS_TOKEN || '',
    scopes: [
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.finances',
    ],
  },
  tiktok_shop: {
    name: 'TikTok Shop',
    appKey: process.env.TIKTOK_SHOP_APP_KEY || '',
    appSecret: process.env.TIKTOK_SHOP_APP_SECRET || '',
    serviceId: process.env.TIKTOK_SHOP_SERVICE_ID || '',
    apiBaseUrl: 'https://open-api.tiktokglobalshop.com',
    authUrl: 'https://services.us.tiktokshop.com/open/authorize',
    tokenUrl: 'https://auth.tiktok-shops.com/api/v2/token/get',
    refreshUrl: 'https://auth.tiktok-shops.com/api/v2/token/refresh',
  },
  temu: {
    name: 'Temu',
    appKey: process.env.TEMU_APP_KEY || '',
    appSecret: process.env.TEMU_APP_SECRET || '',
    region: 'us',
    apiBaseUrl: 'https://openapi-b-us.temu.com/openapi/router',
    authUrl: 'https://seller.temu.com/open-platform/client-manage/authorization',
    get redirectUri() {
      const client = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim()
      return `${client}/oauth/temu/callback`
    },
  },
}

module.exports = MARKETPLACE_CONFIG

