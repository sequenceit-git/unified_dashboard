const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

function service(replies, calls) {
  const listings = freshRequire('marketplaces/temu/listings.js')
  return {
    ...listings,
    call: async (type, body) => {
      calls.push([type, body])
      const r = replies[type]
      if (r instanceof Error) throw r
      if (r === undefined) throw new Error(`unexpected ${type}`)
      return typeof r === 'function' ? r(body) : r
    },
  }
}

test('a title or photo edit sends a partial update of only those fields', async () => {
  const calls = []
  const s = service({
    'bg.local.goods.image.upload': (b) => ({ url: `https://temu.img/${b.fileUrl.split('/').pop()}` }),
    'bg.local.goods.partial.update': { goodsId: 77 },
  }, calls)
  const res = await s.reviseListing('tok', '77:1', { title: 'New tee', images: ['https://dash.test/uploads/a.jpg'] })
  const update = calls.find(([t]) => t === 'bg.local.goods.partial.update')[1]
  assert.deepEqual(update, { access_token: 'tok', goodsId: 77, goodsBasic: { goodsName: 'New tee', goodsGallery: { goodsCarouselImage: ['https://temu.img/a.jpg'], detailImage: ['https://temu.img/a.jpg'] } } })
  assert.deepEqual(res.skipped || [], [])
  calls.length = 0
  await s.reviseListing('tok', '77:1', { description: 'Soft cotton' })
  assert.deepEqual(calls, [['bg.local.goods.partial.update', { access_token: 'tok', goodsId: 77, goodsDesc: 'Soft cotton' }]])
  // Price still goes through Temu's price review: reported as skipped, not sent.
  calls.length = 0
  assert.deepEqual((await s.reviseListing('tok', '77:1', { price: 12 })).skipped, ['price'])
  assert.equal(calls.length, 0)
})

test("an attribute edit uses Temu's attribute call", async () => {
  const calls = []
  const s = service({ 'temu.local.goods.attributes.edit': { goodsId: 77 } }, calls)
  await s.reviseListing('tok', '77:1', { attributes: { Material: 'Cotton', Features: ['Waterproof', 'Light'], Empty: '' } })
  assert.deepEqual(calls, [['temu.local.goods.attributes.edit', { access_token: 'tok', goodsId: 77, attributes: [{ name: 'Material', value: ['Cotton'] }, { name: 'Features', value: ['Waterproof', 'Light'] }] }]])
})

test('a deleted goods is deleted on Temu; a refusal says why', async () => {
  const calls = []
  const ok = service({ 'temu.local.goods.delete': { success: true } }, calls)
  assert.deepEqual(await ok.applyListingAction('tok', 'delete', { externalListingId: '77:1' }), { status: 'ended', marketplaceStatus: 'DELETED' })
  assert.deepEqual(calls[0], ['temu.local.goods.delete', { access_token: 'tok', goodsId: 77 }])
  const refused = service({ 'temu.local.goods.delete': { success: false, errorMsg: 'Goods has unfinished orders' } }, [])
  await assert.rejects(refused.applyListingAction('tok', 'delete', { externalListingId: '77:1' }), /Goods has unfinished orders/)
})

test('deleting goods Temu refuses keeps the dashboard product and shows why', async () => {
  const deleted = []
  const restore = stubModules({
    '/models/Product': modelStub(() => ({ _id: 'p1', sku: 'TEE' }), { findByIdAndDelete: async (id) => { deleted.push(id) } }),
    '/models/Listing': modelStub(() => [{ _id: 'l1', shopId: 's1', externalListingId: '77:1', status: 'live' }], { deleteMany: async () => { deleted.push('listings') } }),
    '/models/Shop': modelStub(() => ({ _id: 's1', marketplace: 'temu', status: 'connected', name: 'Temu Shop' })),
    '/models/ResearchReport': modelStub(() => null),
    '/services/productAccess': { productAccess: async () => ({ visible: true, mine: null, others: 0 }), assertProductAccess: async () => {}, ownDrafts: () => ({}) },
    '../manager': {
      withShopToken: async (shop, fn) => fn('tok'),
      forgetListing: async () => {},
      removeFromShop: async () => {},
    },
    '../../service': { applyListingAction: async () => { throw new Error('Goods has unfinished orders') } },
  })
  try {
    const products = freshRequire('marketplaces/temu/app/services/products.js')
    await assert.rejects(products.remove({ user: { role: 'super_admin' }, params: { id: 'p1' } }), (e) => e.status === 422 && /Goods has unfinished orders/.test(e.body.error))
    assert.deepEqual(deleted, [])
  } finally { restore() }
})
