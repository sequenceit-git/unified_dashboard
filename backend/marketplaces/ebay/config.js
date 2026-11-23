/** eBay API settings (env: EBAY_ENV, EBAY_CLIENT_ID/EBAY_APP_ID, EBAY_CLIENT_SECRET/EBAY_CERT_ID, EBAY_DEV_ID, EBAY_RUNAME, ...). */
module.exports = {
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
    // Promotions. Best offers (Negotiation API) use sell.inventory, which is already above;
    // eBay has no sell.negotiation scope, and asking for one makes the consent page fail.
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/commerce.message',
  ],
}
