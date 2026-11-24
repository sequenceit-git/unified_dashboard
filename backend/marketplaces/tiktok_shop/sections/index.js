/** tiktok_shop section id → loader `(token, shop) => { summary, tables }`. One file per sidebar section. */
module.exports = {
  packages: require('./packages'),
  'returns-cancellations': require('./returns-cancellations'),
  promotions: require('./promotions'),
  finance: require('./finance'),
  'videos-live': require('./videos-live'),
}
