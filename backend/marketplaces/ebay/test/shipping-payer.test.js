const test = require('node:test')
const assert = require('node:assert/strict')
const { freshRequire } = require('../../../test/helpers/stub')

const XML = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?><${name}Response xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack>${inner}</${name}Response>`
const TEMPLATE = (type = 'Flat') => ({
  shippingType: type,
  shippingOptions: [
    { service: 'USPSGroundAdvantage', priority: '1', free: false, cost: '4.99', additionalCost: '1.00' },
    { service: 'USPSPriority', priority: '2', free: false, cost: '9.99', additionalCost: '' },
  ],
})
const option = (xml, priority) => xml.match(new RegExp(`<ShippingServiceOptions><ShippingServicePriority>${priority}</ShippingServicePriority>.*?</ShippingServiceOptions>`))?.[0] || ''

test('a new listing with free shipping marks only the first service free', () => {
  const { shippingXml } = freshRequire('marketplaces/ebay/trading.js')
  const xml = shippingXml(TEMPLATE(), {}, { ebayShipping: { paidBy: 'seller' } })
  assert.match(option(xml, 1), /<FreeShipping>true<\/FreeShipping><ShippingServiceCost currencyID="USD">0.00<\/ShippingServiceCost><ShippingServiceAdditionalCost currencyID="USD">0.00<\/ShippingServiceAdditionalCost>/)
  assert.doesNotMatch(option(xml, 2), /FreeShipping/)
  assert.match(option(xml, 2), /<ShippingServiceCost currencyID="USD">9.99<\/ShippingServiceCost>/)
})

test('a new listing where the buyer pays uses the given cost', () => {
  const { shippingXml } = freshRequire('marketplaces/ebay/trading.js')
  const free = { ...TEMPLATE(), shippingOptions: TEMPLATE().shippingOptions.map((o, i) => (i ? o : { ...o, free: true, cost: '0.00' })) }
  const xml = shippingXml(free, {}, { ebayShipping: { paidBy: 'buyer', cost: 6.5 } })
  assert.doesNotMatch(option(xml, 1), /FreeShipping/)
  assert.match(option(xml, 1), /<ShippingServiceCost currencyID="USD">6.50<\/ShippingServiceCost>/)
  // No choice given: the template is sent as it is (today's behaviour).
  assert.match(option(shippingXml(TEMPLATE(), {}, {}), 1), /<ShippingServiceCost currencyID="USD">4.99<\/ShippingServiceCost>/)
  // The product's saved choice is used when the request has none.
  assert.match(option(shippingXml(TEMPLATE(), { ebayShipping: { paidBy: 'seller' } }, {}), 1), /FreeShipping/)
})

test('buyer pays on a Flat listing without a cost is refused before eBay', () => {
  const { shippingXml } = freshRequire('marketplaces/ebay/trading.js')
  for (const cost of [undefined, '', 0, -2, 'abc']) {
    assert.throws(() => shippingXml(TEMPLATE(), {}, { ebayShipping: { paidBy: 'buyer', cost } }), (e) => e.status === 400 && e.message === 'Enter the shipping cost the buyer pays.', String(cost))
  }
})

test('buyer pays on a Calculated listing sends no cost', () => {
  const { shippingXml } = freshRequire('marketplaces/ebay/trading.js')
  const xml = shippingXml({ ...TEMPLATE('Calculated'), shippingOptions: TEMPLATE().shippingOptions.map((o, i) => (i ? o : { ...o, free: true })) }, { weight: 2 }, { ebayShipping: { paidBy: 'buyer' } })
  assert.doesNotMatch(xml, /ShippingServiceCost|FreeShipping/)
})

const LISTING = (extra = '') => XML('GetItem', `<Item><ItemID>123</ItemID><Title>Mug</Title><ShippingDetails><ShippingType>Flat</ShippingType>`
  + '<ShippingServiceOptions><ShippingServicePriority>1</ShippingServicePriority><ShippingService>USPSGroundAdvantage</ShippingService><ShippingServiceCost currencyID="USD">4.99</ShippingServiceCost></ShippingServiceOptions>'
  + '<ShippingServiceOptions><ShippingServicePriority>2</ShippingServicePriority><ShippingService>USPSPriority</ShippingService><ShippingServiceCost currencyID="USD">9.99</ShippingServiceCost></ShippingServiceOptions>'
  + '<InternationalShippingServiceOption><ShippingService>USPSPriorityMailInternational</ShippingService><ShippingServicePriority>1</ShippingServicePriority><ShippingServiceCost currencyID="USD">29.00</ShippingServiceCost><ShipToLocation>Worldwide</ShipToLocation></InternationalShippingServiceOption>'
  + `<ExcludeShipToLocation>Alaska/Hawaii</ExcludeShipToLocation></ShippingDetails>${extra}</Item>`)

function withFetch(reply, fn) {
  const real = global.fetch
  const sent = []
  global.fetch = async (url, opts) => { const name = opts.headers['X-EBAY-API-CALL-NAME']; sent.push({ name, body: opts.body }); return { status: 200, text: async () => reply(name) } }
  return Promise.resolve(fn(sent)).finally(() => { global.fetch = real })
}

test('editing a listed product changes only who pays shipping', () => withFetch((name) => (name === 'GetItem' ? LISTING() : XML(name, '<ItemID>123</ItemID>')), async (sent) => {
  const trading = freshRequire('marketplaces/ebay/trading.js')
  await trading.reviseListing('tok', '123', { ebayShipping: { paidBy: 'seller' } })
  assert.deepEqual(sent.map((s) => s.name), ['GetItem', 'ReviseFixedPriceItem'])
  const body = sent[1].body
  assert.match(body, /<ItemID>123<\/ItemID><ShippingDetails><ShippingType>Flat<\/ShippingType>/)
  assert.match(option(body, 1), /<FreeShipping>true<\/FreeShipping>/)
  assert.match(option(body, 2), /9.99/)
  assert.match(body, /<InternationalShippingServiceOption><ShippingServicePriority>1<\/ShippingServicePriority><ShippingService>USPSPriorityMailInternational<\/ShippingService><ShippingServiceCost currencyID="USD">29.00<\/ShippingServiceCost><ShipToLocation>Worldwide<\/ShipToLocation><\/InternationalShippingServiceOption>/)
  assert.match(body, /<ExcludeShipToLocation>Alaska\/Hawaii<\/ExcludeShipToLocation>/)
  assert.doesNotMatch(body, /<Title>|<StartPrice|<Quantity>/)
}))

test("a listing on a shipping policy is refused with the policy's name", () => withFetch((name) => (name === 'GetItem'
  ? LISTING('<SellerProfiles><SellerShippingProfile><ShippingProfileID>9</ShippingProfileID><ShippingProfileName>Std</ShippingProfileName></SellerShippingProfile></SellerProfiles>')
  : XML(name, '')), async (sent) => {
  const trading = freshRequire('marketplaces/ebay/trading.js')
  await assert.rejects(trading.reviseListing('tok', '123', { ebayShipping: { paidBy: 'seller' }, title: 'New title' }), (e) => e.status === 400 && e.message === 'This listing uses your eBay shipping policy "Std". Change who pays shipping in that policy in Seller Hub.')
  assert.deepEqual(sent.map((s) => s.name), ['GetItem'])
}))

test("the listing's current payer is read from eBay", () => {
  const trading = freshRequire('marketplaces/ebay/trading.js')
  return withFetch(() => LISTING('<SellerProfiles><SellerShippingProfile><ShippingProfileName>Std</ShippingProfileName></SellerShippingProfile></SellerProfiles>'), async () => {
    const item = await trading.getItem('tok', '123')
    assert.deepEqual(item.shipping, { paidBy: 'buyer', cost: 4.99, type: 'Flat', policy: 'Std' })
  })
})
