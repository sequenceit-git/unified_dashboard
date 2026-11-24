/**
 * TikTok Shop "orders" section operations: order split eligibility & execution, POD customization
 * inspection, and external order reference linking/lookup via the standard section routes.
 */
const { col } = require('../../../services/marketplace/sectionKit')
const { HttpError } = require('../../../utils/httpError')
const { ttGet, ttPost, scopeAware } = require('./helpers')

const enc = encodeURIComponent

async function orders() {
  return { summary: [], tables: [] }
}

orders.details = {
  /** Operational metadata for one TikTok order: split attributes, POD customizations, external refs. */
  ops: async (token, shop, externalOrderId) => {
    const id = String(externalOrderId || '').trim()
    const [splitRes, podRes, extRes] = await Promise.all([
      ttGet(token, shop, '/fulfillment/202309/orders/split_attributes', { order_ids: id }).catch(() => null),
      ttPost(token, shop, '/order/202606/pod_details/search', { order_id: id }, { page_size: 20 }).catch(() => null),
      ttGet(token, shop, `/order/202406/orders/${enc(id)}/external_orders`, { platform: 'ERP' }).catch(() => null),
    ])

    const splitAttr = splitRes?.split_attributes?.[0] || null
    const rawPod = podRes?.pod_details || podRes?.customizations || podRes?.items || []
    const pod = rawPod.map((item) => ({
      lineItemId: item.order_line_item_id || item.line_item_id || '',
      skuId: item.sku_id || '',
      text: item.custom_text || item.text || item.customization_info || '',
      imageUrl: item.preview_image?.urls?.[0] || item.image_url || '',
    }))
    const externalRefs = (extRes?.external_orders || []).map((row) => ({
      id: row.id || '',
      platform: row.platform || 'ERP',
    })).filter((r) => r.id)

    return {
      title: `TikTok fulfillment · ${id}`,
      split: {
        canSplit: Boolean(splitAttr?.can_split),
        mustSplit: Boolean(splitAttr?.must_split),
        reason: Array.isArray(splitAttr?.must_split_reasons)
          ? splitAttr.must_split_reasons.join('; ')
          : splitAttr?.must_split_reasons || '',
      },
      pod,
      externalRefs,
    }
  },

  /** Looks up TikTok orders linked to an external ERP/order reference id. */
  'search-external': scopeAware(async (token, shop, externalRefId) => {
    const refId = String(externalRefId || '').trim()
    const res = await ttPost(token, shop, '/order/202406/orders/external_order_search', {}, {
      platform: 'ERP',
      external_order_id: refId,
    })
    return {
      title: `External reference · ${refId}`,
      tables: [{
        id: 'matches',
        title: 'Matching TikTok orders',
        columns: [col('orderId', 'TikTok Order ID'), col('externalId', 'External Reference'), col('platform', 'Platform')],
        rows: (res.orders || []).map((o) => ({
          id: o.id,
          orderId: o.id || '',
          externalId: o.external_order?.id || refId,
          platform: o.external_order?.platform || 'ERP',
        })),
      }],
    }
  }, 'Read External Order References'),
}

orders.actions = {
  /** Splits a multi-item TikTok order into one package per line item. */
  'split-order': scopeAware(async (token, shop, externalOrderId) => {
    const id = String(externalOrderId || '').trim()
    const orderRes = await ttGet(token, shop, '/order/202507/orders', { ids: id })
    const lineItems = orderRes?.orders?.[0]?.line_items || []
    if (lineItems.length < 2) {
      throw new HttpError(400, { error: 'This order only has one line item and cannot be split.' })
    }
    const splittable_groups = lineItems.map((li, idx) => ({
      id: String(idx + 1),
      order_line_item_ids: [String(li.id)],
    }))
    const res = await ttPost(token, shop, `/fulfillment/202309/orders/${enc(id)}/split`, { splittable_groups }, {})
    const count = (res.packages || []).length || splittable_groups.length
    return { message: `Split order ${id} into ${count} packages on TikTok Shop.`, packages: res.packages || [] }
  }, 'Package Split And Combine'),

  /** Links a dashboard/ERP reference id back onto the TikTok order. */
  'link-external': scopeAware(async (token, shop, externalOrderId, referenceId) => {
    const id = String(externalOrderId || '').trim()
    const ref = String(referenceId || '').trim()
    if (!ref) throw new HttpError(400, { error: 'Enter an external reference ID first.' })
    const res = await ttPost(token, shop, '/order/202406/orders/external_orders', {
      orders: [{ id, external_order: { id: ref, platform: 'ERP' } }],
    }, {})
    if (res.errors?.length) {
      throw new HttpError(400, { error: res.errors.map((e) => e.message).join('; ') })
    }
    return { message: `Linked reference ${ref} to TikTok order ${id}.` }
  }, 'Write External Order References'),
}

module.exports = orders
