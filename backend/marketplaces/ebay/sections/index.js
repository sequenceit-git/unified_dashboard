/** ebay section id → loader `(token, shop) => { summary, tables }`. One file per sidebar section. */
module.exports = {
  returns: require('./returns'),
  finances: require('./finances'),
  promotions: require('./promotions'),
  offers: require('./offers'),
}
