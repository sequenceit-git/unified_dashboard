/** Temu "fulfillment" section: its tables (subsections) for the shop section page. */
const temu = require('../service')
const { col, tables, firstList } = require('../../../services/marketplace/sectionKit')
const { temuTime, grantAware } = require('./helpers')

const LABEL_STATUS = { 0: 'Buying', 1: 'Bought', 2: 'Failed' }

async function fulfillment(token, shop, { now = new Date() } = {}) {
  const end = Math.floor(now.getTime() / 1000)
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
    {
      id: 'labels',
      tab: 'Labels',
      title: 'Temu labels (last 30 days)',
      note: 'Labels bought with Temu. Open an order to buy, print or retry a label.',
      columns: [col('packageSn', 'Package'), col('orders', 'Orders'), col('carrier', 'Carrier'), col('tracking', 'Tracking'), col('status', 'Label', 'status'), col('printed', 'Printed'), col('created', 'Bought', 'date')],
      load: grantAware(shop, 'temu.logistics.label.list.get', async () => ((await temu.call('temu.logistics.label.list.get', { access_token: token, createAtStart: end - 30 * 86400, createAtEnd: end, pageNumber: 1, pageSize: 100 })).shippingLabelInfoList || []).map((l) => ({
        packageSn: l.packageSn,
        orders: [...new Set((l.orderInfoList || []).map((o) => o.parentOrderSn))].join(', '),
        carrier: l.trackingInfoList?.[0]?.shippingCompanyName || '',
        tracking: l.trackingInfoList?.[0]?.trackingNumber || '',
        status: LABEL_STATUS[l.shippingLabelStatus] || `Temu status ${l.shippingLabelStatus}`,
        printed: l.labelPrintStatus ? 'Yes' : 'No',
        created: temuTime(l.createTime),
      }))),
    },
    {
      id: 'carriers',
      tab: 'Labels',
      title: 'Temu US carriers and services',
      columns: [col('carrier', 'Carrier'), col('service', 'Service')],
      load: grantAware(shop, 'temu.logistics.shiplogisticstype.get', async () => ((await temu.call('temu.logistics.shiplogisticstype.get', { access_token: token, regionId: 211 })).shipLogisticsTypeInfoDTOList || []).map((c) => ({ carrier: c.shippingCompanyName || '', service: c.shipLogisticsType || '' }))),
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
