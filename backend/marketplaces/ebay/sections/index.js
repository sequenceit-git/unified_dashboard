/** ebay section id → loader `(token, shop) => { summary, tables }`. One file per sidebar section. */
module.exports = {
  buyers: require('./buyers'),
  analytics: require('./analytics'),
  'returns-cases': require('./returns-cases'),
  payouts: require('./payouts'),
  promotions: require('./promotions'),
  offers: require('./offers'),
}
