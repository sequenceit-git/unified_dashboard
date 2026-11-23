/** Helpers shared by this shop's section files. */
const ebayConfig = require('../config')
const { ebayFetch } = require('../client')

const ebayGet = ebayFetch

const ebayApiz = () => (ebayConfig.environment === 'SANDBOX' ? 'https://apiz.sandbox.ebay.com' : 'https://apiz.ebay.com')

module.exports = { ebayGet, ebayApiz }
