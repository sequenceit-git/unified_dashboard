/**
 * Domain services throw HttpError for answers that aren't a plain success: the route sends
 * `status` with `body` exactly as the handler used to (`{ error }` or a richer object).
 */
class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string | Record<string, any>} body  message, or the full JSON body to send
   */
  constructor(status, body) {
    const json = typeof body === 'string' ? { error: body } : (body || {})
    super(json.error || json.message || `HTTP ${status}`)
    this.status = status
    this.body = json
  }
}

/** The parts of a request a domain service may read. */
function ctxOf(req) {
  return {
    ip: req.ip,
    user: req.user,
    authUser: req.authUser,
    allowedShopIds: req.allowedShopIds,
    shopMarkets: req.shopMarkets,
    query: req.query,
    body: req.body,
    params: req.params,
  }
}

module.exports = { HttpError, ctxOf }
