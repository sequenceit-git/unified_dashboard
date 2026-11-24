/** Temu section id → loader `(token, shop) => { summary, tables }`. One file per sidebar section. */
module.exports = {
  promotions: require('./promotions'),
  ads: require('./ads'),
  'after-sales': require('./after-sales'),
  'price-reviews': require('./price-reviews'),
  shipping: require('./shipping'),
  analytics: require('./analytics'),
}
