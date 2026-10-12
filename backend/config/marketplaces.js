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
}

module.exports = MARKETPLACE_CONFIG

