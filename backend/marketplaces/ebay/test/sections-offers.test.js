const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const XML = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?><${name}Response xmlns="urn:ebay:apis:eBLBaseComponents"><Ack>Success</Ack>${inner}</${name}Response>`
const OFFERS = XML('GetBestOffers', `<ItemBestOffersArray><ItemBestOffers><Item><ItemID>111</ItemID><Title>Blue jeans</Title></Item><BestOfferArray>`
  + `<BestOffer><BestOfferID>B1</BestOfferID><ExpirationTime>2026-11-26T10:00:00.000Z</ExpirationTime><Buyer><UserID>amy</UserID></Buyer><Price currencyID="USD">11.00</Price><Quantity>1</Quantity><Status>Pending</Status><BuyerMessage>Would you take 11?</BuyerMessage></BestOffer>`
  + `</BestOfferArray></ItemBestOffers></ItemBestOffersArray>`)

function withFetch(reply, fn) {
  const real = global.fetch
  const sent = []
  global.fetch = async (url, opts) => { sent.push({ name: opts.headers['X-EBAY-API-CALL-NAME'], body: opts.body }); return { status: 200, text: async () => reply(opts.headers['X-EBAY-API-CALL-NAME']) } }
  return Promise.resolve(fn(sent)).finally(() => { global.fetch = real })
}

test('active Best Offers are listed with their expiry', () => withFetch(() => OFFERS, async (sent) => {
  const trading = freshRequire('marketplaces/ebay/trading.js')
  const offers = await trading.getBestOffers('tok')
  assert.match(sent[0].body, /<BestOfferStatus>Active<\/BestOfferStatus>/)
  assert.deepEqual(offers, [{ itemId: '111', title: 'Blue jeans', offerId: 'B1', buyer: 'amy', price: { value: 11, currency: 'USD' }, quantity: 1, expires: '2026-11-26T10:00:00.000Z', message: 'Would you take 11?', status: 'Pending' }])
}))

test('the offers section lists Best Offers first, with accept, decline and counter', async () => {
  const restore = stubModules({
    './helpers': { ...require('../sections/helpers'), ebayGet: async () => ({ eligibleItems: [] }) },
    '../trading': { getBestOffers: async () => [{ itemId: '111', title: 'Blue jeans', offerId: 'B1', buyer: 'amy', price: { value: 11, currency: 'USD' }, quantity: 1, expires: '2026-11-26T10:00:00.000Z', message: '', status: 'Pending' }] },
    'services/marketplace/sectionKit': { ...require('../../../services/marketplace/sectionKit'), listingTitles: async () => new Map() },
  })
  try {
    const { tables } = await freshRequire('marketplaces/ebay/sections/offers.js')('tok')
    assert.deepEqual(tables.map((t) => [t.id, t.tab]), [['bestOffers', 'Best Offers'], ['eligible', 'Send offers']])
    const [row] = tables[0].rows
    assert.equal(row.id, '111:B1')
    assert.deepEqual(row.actions.map((a) => a.id), ['offer-accept', 'offer-decline', 'offer-counter'])
  } finally { restore() }
})

test('counter sends the price', () => withFetch((name) => XML(name, ''), async (sent) => {
  const trading = freshRequire('marketplaces/ebay/trading.js')
  await trading.respondToBestOffer('tok', { itemId: '111', offerId: 'B1', action: 'Counter', counterPrice: 12.5 })
  assert.equal(sent[0].name, 'RespondToBestOffer')
  assert.match(sent[0].body, /<ItemID>111<\/ItemID>/)
  assert.match(sent[0].body, /<BestOfferID>B1<\/BestOfferID>/)
  assert.match(sent[0].body, /<Action>Counter<\/Action>/)
  assert.match(sent[0].body, /<CounterOfferPrice currencyID="USD">12\.50<\/CounterOfferPrice>/)
}))

test('a counter without a positive price is refused', () => withFetch((name) => XML(name, ''), async (sent) => {
  const trading = freshRequire('marketplaces/ebay/trading.js')
  for (const counterPrice of [undefined, 0, -3, 'abc']) {
    await assert.rejects(trading.respondToBestOffer('tok', { itemId: '111', offerId: 'B1', action: 'Counter', counterPrice }), (e) => e.status === 400)
  }
  assert.equal(sent.length, 0)
}))

test('offer actions check the offers section and send the right Action', async () => {
  const calls = []
  const restore = stubModules({
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'ebay', status: 'connected' })),
    '../manager': { withShopToken: async (shop, fn) => fn('tok') },
    '../../trading': { ...require('../trading'), respondToBestOffer: async (token, args) => { calls.push(args); return {} } },
  })
  try {
    const service = freshRequire('marketplaces/ebay/app/services/sections.js')
    const admin = (actionId, value) => ({ user: { role: 'super_admin' }, params: { actionId }, body: { id: '111:B1', value }, query: {} })
    await service.offerAction(admin('offer-accept'))
    await service.offerAction(admin('offer-counter', '12.5'))
    assert.deepEqual(calls, [{ itemId: '111', offerId: 'B1', action: 'Accept' }, { itemId: '111', offerId: 'B1', action: 'Counter', counterPrice: 12.5 }])
    const sub = { user: { id: 'u2', role: 'sub_admin', allowedSections: ['ebay:orders'] }, allowedShopIds: ['s1'], params: { actionId: 'offer-accept' }, body: { id: '111:B1' }, query: {} }
    await assert.rejects(service.offerAction(sub), (e) => e.status === 403)
    assert.equal(calls.length, 2)
  } finally { restore() }
})
