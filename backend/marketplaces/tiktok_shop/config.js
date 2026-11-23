/** TikTok Shop (US) Open API settings (env: TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET, TIKTOK_SHOP_SERVICE_ID). */
module.exports = {
  name: 'TikTok Shop',
  appKey: process.env.TIKTOK_SHOP_APP_KEY || '',
  appSecret: process.env.TIKTOK_SHOP_APP_SECRET || '',
  serviceId: process.env.TIKTOK_SHOP_SERVICE_ID || '',
  apiBaseUrl: 'https://open-api.tiktokglobalshop.com',
  authUrl: 'https://services.us.tiktokshop.com/open/authorize',
  tokenUrl: 'https://auth.tiktok-shops.com/api/v2/token/get',
  refreshUrl: 'https://auth.tiktok-shops.com/api/v2/token/refresh',
}
