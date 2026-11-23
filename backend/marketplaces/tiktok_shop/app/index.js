/**
 * TikTok Shop's app: its dashboard API, sync jobs and listing pushes.
 * Bridge to the shared code until this shop owns its own copies (per-shop backend plan).
 */
const manager = () => require('../../../services/marketplace')

module.exports = {
  get api() {
    return require('../api')
  },
  sync: {
    orders: (shop) => manager().syncOrdersForShop(shop),
    listings: (shop) => manager().syncListingsForShop(shop),
    access: (shop) => manager().checkShopAccess(shop),
    full: (shop) => manager().syncAllForShop(shop),
    inbox: (shop) => require('../../../services/inbox/inboxBot').syncAndReply(shop),
  },
  catalog: {
    pushStock: (shop, listing, product, quantity) => manager().pushStockOne(shop, listing, product, quantity),
    pushChanges: (shop, listing, product, changes) => manager().reviseOne(shop, listing, product, changes),
    publish: (shop, product, options) => manager().publishListing(shop, product, options),
  },
}
