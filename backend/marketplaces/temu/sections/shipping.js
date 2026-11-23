/** Temu "fulfillment" section: its tables (subsections) for the shop section page. */
const temu = require('../service')
const { col, tables, firstList } = require('../../../services/marketplace/sectionKit')
const { temuTime } = require('./helpers')

async function fulfillment(token) {
  const list = await tables([
    {
      id: 'unshipped',
      title: 'Awaiting shipment',
      columns: [col('order', 'Order'), col('placed', 'Placed', 'date'), col('items', 'Items')],
      load: async () => (await temu.call('bg.order.list.v2.get', {
        access_token: token,
        pageNumber: 1,
        pageSize: 50,
        parentOrderStatus: 2,
        regionId: 211,
      })).pageItems?.map((row) => {
        const parent = row.parentOrderMap || row
        const lines = row.orderList || []
        return {
          order: parent.parentOrderSn,
          placed: temuTime(parent.parentOrderTime),
          items: lines.map((line) => line.goodsName || line.spec).filter(Boolean).join(', '),
        }
      }) || [],
    },
    {
      id: 'warehouses',
      title: 'Warehouses',
      columns: [col('id', 'Warehouse'), col('name', 'Name'), col('default', 'Default')],
      load: async () => firstList(await temu.call('bg.logistics.warehouse.list.get', { access_token: token })).map((row) => ({
        id: row.warehouseId || row.id,
        name: row.warehouseName || row.name || '',
        default: row.defaultWarehouse ? 'Yes' : '',
      })),
    },
    {
      id: 'templates',
      title: 'Freight templates',
      columns: [col('id', 'Template'), col('name', 'Name')],
      load: async () => firstList(await temu.call('bg.freight.template.list.query', { access_token: token })).map((row) => ({
        id: row.templateId || row.freightTemplateId || row.id,
        name: row.templateName || row.freightTemplateName || row.name || '',
      })),
    },
  ])
  return {
    summary: [
      { label: 'Awaiting shipment', value: list[0].rows.length, type: 'number' },
      { label: 'Warehouses', value: list[1].rows.length, type: 'number' },
      { label: 'Freight templates', value: list[2].rows.length, type: 'number' },
    ],
    tables: list,
  }
}

module.exports = fulfillment
