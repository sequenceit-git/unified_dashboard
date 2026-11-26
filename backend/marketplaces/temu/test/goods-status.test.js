const test = require('node:test')
const assert = require('node:assert/strict')
const { goodsState } = require('../goodsStatus')
const listings = require('../listings')

test('Temu sub-status decides the listing status: rejected goods are never on sale', () => {
  assert.deepEqual(goodsState({ goodsShowSubStatus: 2001 }, 1), { status: 'live', marketplaceStatus: '2001' })
  assert.equal(goodsState({ subStatus4VO: 3002 }, 1).status, 'paused')
  assert.equal(goodsState({ goodsShowSubStatus: 4002 }, 4).status, 'pending')
  const rejected = goodsState({ goodsShowSubStatus: 4004 }, 4)
  assert.equal(rejected.status, 'error')
  assert.equal(rejected.marketplaceStatus, '4004')
  assert.match(rejected.reason, /Seller Center/)
  assert.equal(goodsState({}, 4).status, 'pending')
  assert.equal(goodsState({}, 1).status, 'live')
})

test('sync reads Active and Incomplete goods, uses Temu SKU ids and keeps old seller codes for matching', async () => {
  const asked = []
  const svc = {
    ...listings,
    call: async (type, body) => {
      asked.push(body.goodsStatusFilterType)
      if (body.goodsStatusFilterType === 1) return { goodsList: [{ goodsId: 1, goodsName: 'A', goodsShowSubStatus: 2001, skuList: [{ skuId: 11, outSkuSn: 'OLD-A', quantity: 3 }] }] }
      return { goodsList: [{ goodsId: 2, goodsName: 'B', goodsShowSubStatus: 4004, skuList: [{ skuId: 22, quantity: 5 }] }] }
    },
  }
  const { inventoryItems, complete } = await svc.getInventory('tok')
  assert.deepEqual(asked, [1, 4])
  assert.equal(complete, true)
  const [a, b] = inventoryItems
  assert.deepEqual([a.sku, a.matchSkus, a.listingStatus, a.externalListingId], ['11', ['OLD-A'], 'live', '1:11'])
  assert.deepEqual([b.sku, b.listingStatus, b.marketplaceStatus], ['22', 'error', '4004'])
  assert.ok(b.listingError)
})

test('a new goods takes Temu\'s SKU id as its SKU', () => {
  const temu = require('..')
  assert.equal(temu.hooks.publishedSku({ sku: 'TEMU-261124-9BBBCC' }, { temuSkus: [{ skuId: '167026983233969' }] }), '167026983233969')
})
