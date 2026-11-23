/** Temu section id → loader `(token, shop) => { summary, tables }`. One file per sidebar section. */
module.exports = {
  promotions: require('./promotions'),
  ads: require('./ads'),
  returns: require('./returns'),
  prices: require('./prices'),
  fulfillment: require('./fulfillment'),
}
