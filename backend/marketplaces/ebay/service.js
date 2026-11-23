/** The eBay service singleton the shared core uses: client + all area methods on one object. */
const { EbayClient } = require('./client')

module.exports = Object.assign(
  new EbayClient(),
  require('./orders'),
  require('./listings'),
  require('./finance'),
  require('./inbox'),
)
