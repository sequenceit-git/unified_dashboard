/** tiktok_shop section id → loader `(token, shop) => { summary, tables }`. One file per sidebar section. */
module.exports = {
  fulfillment: require('./fulfillment'),
  returns: require('./returns'),
  promotions: require('./promotions'),
  finances: require('./finances'),
  content: require('./content'),
  creators: require('./creators'),
}
