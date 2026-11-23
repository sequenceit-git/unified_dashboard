/** eBay's app: its dashboard API, sync jobs and listing pushes, all in this folder. */
const manager = () => require('./manager')

module.exports = {
  get api() {
    return require('./api')
  },
  sync: {
    orders: (shop) => manager().syncOrdersForShop(shop),
    listings: (shop) => manager().syncListingsForShop(shop),
    access: (shop) => manager().checkShopAccess(shop),
    full: (shop) => manager().syncAllForShop(shop),
    inbox: (shop) => require('./services/inbox').syncAndReply(shop),
  },
  catalog: {
    publish: (shop, product, options) => manager().publishListing(shop, product, options),
    listingAction: (shop, listing, action, options) => manager().applyListingAction(shop, listing, action, options),
    capabilities: () => manager().listingCapabilities(),
    remember: (shopId, tokens) => manager().rememberListing(shopId, tokens),
  },
}
