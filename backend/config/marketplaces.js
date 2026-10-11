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
    redirectUri: process.env.TIKTOK_SHOP_REDIRECT_URI || '',
    accessToken: process.env.TIKTOK_SHOP_ACCESS_TOKEN || '',
    region: (process.env.TIKTOK_SHOP_REGION || 'US').toUpperCase(), // US, UK, SEA, GLOBAL
    get authUrl() {
      return this.region === 'US'
        ? 'https://services.us.tiktokshop.com/open/authorize'
        : 'https://services.tiktokshop.com/open/authorize'
    },
    tokenEndpoint: 'https://auth.tiktok-shops.com/api/v2/token/get',
    refreshTokenEndpoint: 'https://auth.tiktok-shops.com/api/v2/token/refresh',
    get apiBaseUrl() {
      return 'https://open-api.tiktokglobalshop.com'
    },
  },

  temu: {
    name: 'Temu',
    appKey: process.env.TEMU_APP_KEY || '',
    appSecret: process.env.TEMU_APP_SECRET || '',
    redirectUri: process.env.TEMU_REDIRECT_URI || '',
    accessToken: process.env.TEMU_ACCESS_TOKEN || '',
    region: (process.env.TEMU_REGION || 'US').toUpperCase(), // US, EU, GLOBAL
    get routerUrl() {
      if (this.region === 'EU') {
        return 'https://openapi-b-eu.temu.com/openapi/router'
      }
      return 'https://openapi-b-us.temu.com/openapi/router'
    },
  },
}

module.exports = MARKETPLACE_CONFIG
