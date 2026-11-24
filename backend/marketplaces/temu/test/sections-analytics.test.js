const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire, modelStub } = require('../../../test/helpers/stub')

const NOW = new Date('2026-11-24T00:00:00Z')

function load(replies, { orders = 40, calls = [] } = {}) {
  const restore = stubModules({
    '../service': {
      call: async (type, body) => {
        calls.push([type, body])
        const r = replies[type]
        if (r instanceof Error) throw r
        if (r === undefined) throw new Error(`unexpected ${type}`)
        return typeof r === 'function' ? r(body) : r
      },
    },
    '/models/Order': modelStub(() => null, { countDocuments: async () => orders }),
  })
  return { analytics: freshRequire('marketplaces/temu/sections/analytics.js'), restore, calls }
}
const BASE = {
  'temu.local.goods.list.retrieve': (b) => (b.pageToken ? { goodsList: [{ goodsId: '3', goodsName: 'Hat', lowTrafficTag: 0, restrictedTrafficTag: 1 }], pagination: {} } : { goodsList: [{ goodsId: '1', goodsName: 'Mug', lowTrafficTag: 1, restrictedTrafficTag: 0 }, { goodsId: '2', goodsName: 'Cup', lowTrafficTag: 0, restrictedTrafficTag: 0 }], pagination: { nextToken: 'n2' } }),
  'temu.searchrec.ad.reports.mall.query': { summary: { orderPayAmt: { total: { val: 1000 }, ad: { val: 250 } }, spend: { ad: { val: 50 } } } },
  'bg.aftersales.parentaftersales.list.get': { data: [{}, {}], totalItemNum: 2 },
  'bg.aftersales.cancel.list.get': { data: [{}], totalItemNum: 1 },
  'temu.local.mall.tags.get': { tags: [3, 7] },
}

test('goods with low or restricted traffic are listed from every page', async () => {
  const { analytics, restore } = load(BASE)
  try {
    const t = (await analytics('tok', { _id: 's1' }, { now: NOW })).tables.find((x) => x.id === 'traffic')
    assert.deepEqual(t.rows.map((r) => [r.goodsId, r.title, r.warning]), [['1', 'Mug', 'Low traffic'], ['3', 'Hat', 'Traffic restricted']])
  } finally { restore() }
})

test('ads share of sales and order health over 30 days', async () => {
  const { analytics, restore, calls } = load(BASE)
  try {
    const { summary } = await analytics('tok', { _id: 's1' }, { now: NOW })
    const tile = (label) => summary.find((s) => s.label === label)?.value
    assert.equal(tile('Sales from ads (30 days)'), 25)
    assert.equal(tile('Ad spend (30 days)').value, 50)
    assert.equal(tile('Return requests per 100 orders'), 5)
    assert.equal(tile('Cancellations per 100 orders'), 2.5)
    assert.deepEqual(summary.map((t) => t.id), ['ad-share', 'ad-spend', 'returns-per-100', 'cancels-per-100'])
    const r = calls.find(([t]) => t === 'bg.aftersales.parentaftersales.list.get')[1]
    assert.equal(r.createAtEnd - r.createAtStart, 30 * 86400)
  } finally { restore() }
})

test('store tags are listed', async () => {
  const { analytics, restore } = load(BASE)
  try {
    const t = (await analytics('tok', { _id: 's1' }, { now: NOW })).tables.find((x) => x.id === 'store')
    assert.deepEqual(t.rows.map((r) => r.tag), ['Temu tag 3', 'Temu tag 7'])
  } finally { restore() }
})

test('a Temu call that fails leaves the other insights', async () => {
  const { analytics, restore } = load({ ...BASE, 'temu.searchrec.ad.reports.mall.query': new Error('ads not enabled'), 'temu.local.goods.list.retrieve': new Error('not granted') })
  try {
    const { tables, summary } = await analytics('tok', { _id: 's1' }, { now: NOW })
    assert.match(tables.find((x) => x.id === 'traffic').error, /not granted/)
    assert.equal(summary.find((s) => s.label === 'Sales from ads (30 days)'), undefined)
    assert.equal(summary.find((s) => s.label === 'Return requests per 100 orders').value, 5)
  } finally { restore() }
})
