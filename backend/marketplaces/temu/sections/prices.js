/** Temu "prices" section: its tables (subsections) for the shop section page. */
const temu = require('../service')
const { words, col, tables, firstList } = require('../../../services/marketplace/sectionKit')
const { temuAmount, temuGoodsRows } = require('./helpers')

async function prices(token) {
  const list = await tables([
    {
      id: 'reviews',
      title: 'Price reviews',
      columns: [col('id', 'Price order'), col('goodsId', 'Goods'), col('status', 'Status', 'status'), col('price', 'Price', 'money')],
      load: async () => firstList(await temu.call('bg.local.goods.priceorder.query', { access_token: token, page: 1, size: 50 })).map((row) => ({
        id: row.priceOrderId || row.id,
        goodsId: row.goodsId,
        status: words(row.priceOrderStatus || row.status || row.orderStatus),
        price: temuAmount(row.supplierPrice || row.suggestSupplyPrice || row.price, row.currency),
      })),
    },
    {
      id: 'catalog',
      title: 'Current goods prices',
      columns: [col('goods', 'Goods'), col('sku', 'SKU'), col('price', 'Price', 'money'), col('listPrice', 'List price', 'money'), col('stock', 'Stock', 'number')],
      load: async () => temuGoodsRows(await temu.call('bg.local.goods.list.query', {
        access_token: token,
        pageNo: 1,
        pageSize: 50,
        goodsSearchType: 1,
        orderField: 'price',
        orderType: 0,
      })),
    },
  ])
  return {
    summary: [
      { label: 'Price reviews', value: list[0].rows.length, type: 'number' },
      { label: 'Goods', value: list[1].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = prices
