/** Which Temu methods the dashboard calls but the shop's token doesn't allow, grouped by feature. */
const FEATURES = [
  [/sections\/price-reviews|priceorder/, 'Price reviews'],
  [/sections\/promotions/, 'Promotions'],
  [/sections\/ads/, 'Ads'],
  [/sections\/after-sales/, 'Returns & refunds'],
  [/sections\/shipping|services\/labels/, 'Shipping & labels'],
  [/sections\/analytics/, 'Analytics'],
  [/services\/compliance/, 'Compliance'],
  [/services\/orders|\/orders\.js/, 'Orders'],
  [/services\/inventory/, 'Inventory'],
  [/goodsHelpers|listings\.js|services\/products|goodsPayload/, 'Goods & listing'],
  [/client\.js|webhooks\.js|services\/sections/, 'Connection & live updates'],
]
const featureOf = (files = []) => (FEATURES.find(([re]) => files.some((f) => re.test(f))) || [null, 'Other'])[1]

function accessReport(used, granted) {
  const allowed = new Set(granted || [])
  const byFeature = new Map()
  for (const u of used) {
    if (allowed.has(u.id)) continue
    const f = featureOf(u.files)
    byFeature.set(f, [...(byFeature.get(f) || []), u.id])
  }
  return {
    used: used.length,
    allowed: used.filter((u) => allowed.has(u.id)).length,
    missing: [...byFeature].map(([feature, methods]) => ({ feature, methods: methods.sort() })).sort((a, b) => a.feature.localeCompare(b.feature)),
  }
}

module.exports = { accessReport }
