/** Temu US local-seller Open API settings (env: TEMU_APP_KEY, TEMU_APP_SECRET). */
module.exports = {
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
}
