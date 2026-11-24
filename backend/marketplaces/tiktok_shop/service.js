/** The TikTok Shop service singleton the shared core uses: client + all area methods on one object. */
const { TikTokClient } = require('./client')

module.exports = Object.assign(
  new TikTokClient(),
  require('./orders'),
  require('./listings'),
  require('./promotions'),
  require('./finance'),
  require('./analytics'),
)
