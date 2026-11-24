/**
 * Temu "promotions" section: activities the shop joined (with its enrolled goods) and Temu's
 * activities, with "Enrol goods" from Temu's own candidate list for that activity.
 */
const crypto = require('crypto')
const temu = require('../service')
const { HttpError } = require('../../../utils/httpError')
const { words, col, tables } = require('../../../services/marketplace/sectionKit')
const { temuTime } = require('./helpers')

async function promotions(token) {
  const activityRow = (row) => ({
    id: String(row.activityId),
    name: row.activityName || '',
    type: words(row.activityType),
    status: words(row.activityStatus),
    joined: row.isJoinedActivity ? 'Yes' : '',
    starts: temuTime(row.activityStartTime),
    ends: temuTime(row.activityEndTime),
  })
  const columns = [col('name', 'Activity'), col('type', 'Type'), col('status', 'Status', 'status'), col('joined', 'Joined'), col('starts', 'Starts', 'date'), col('ends', 'Ends', 'date')]
  const list = await tables([
    {
      id: 'joined',
      title: 'Promotions you joined',
      columns,
      load: async () => ((await temu.call('bg.promotion.activity.query', {
        access_token: token,
        pageNumber: 1,
        pageSize: 50,
        onlyQueryJoinedActivity: true,
      })).activityList || []).map(activityRow),
    },
    {
      id: 'available',
      title: 'Temu promotions',
      note: "Enrol goods with Temu's recommended activity price and quantity. Activities without an Enrol button have no goods Temu allows in them.",
      columns,
      load: async () => ((await temu.call('bg.promotion.activity.query', {
        access_token: token,
        pageNumber: 1,
        pageSize: 50,
      })).activityList || []).map(activityRow),
    },
  ])
  return {
    summary: [
      { label: 'Joined', value: list[0].rows.length, type: 'number' },
      { label: 'Available', value: list[1].rows.filter((row) => !row.joined).length, type: 'number' },
    ],
    tables: list,
  }
}

const CANDIDATE_LOOKUPS = 10 // activities whose candidate goods are looked up per load

/** Goods Temu allows in an activity, with its recommended activity price and quantity per goods. */
async function candidates(token, activityId) {
  const res = await temu.call('bg.promotion.activity.candidate.goods.query', { access_token: token, activityId: Number(activityId), pageNumber: 1, pageSize: 100 })
  return res.goodsList || []
}

/** The section loader, plus the actions activity rows offer. */
async function promotionsWithActions(token, shop) {
  const data = await promotions(token, shop)
  const [joined, available] = data.tables
  for (const row of joined.rows) row.actions = [{ id: 'enrolled', label: 'Enrolled goods', detail: true }]
  await Promise.all(available.rows.slice(0, CANDIDATE_LOOKUPS).map(async (row) => {
    const goods = (await candidates(token, row.id).catch(() => [])).filter((g) => g.isAllowedEnroll)
    row.actions = goods.length ? [{
      id: 'enrol',
      label: 'Enrol goods',
      input: {
        label: "Goods to enrol (each at Temu's recommended activity price and quantity)",
        multiple: true,
        options: goods.map((g) => ({ value: String(g.goodsId), label: `Goods ${g.goodsId} (${(g.skuList || []).length} SKU${(g.skuList || []).length === 1 ? '' : 's'})` })),
      },
    }] : []
  }))
  return data
}

/** Read-only drill-downs. */
promotionsWithActions.details = {
  /** The goods the shop has in an activity, with the activity quantity left. */
  enrolled: async (token, shop, activityId) => {
    const res = await temu.call('bg.promotion.activity.goods.query', { access_token: token, activityId: Number(activityId), pageNumber: 1, pageSize: 100 })
    return {
      title: res.activityInfo?.activityName || `Activity ${activityId}`,
      tables: [{
        id: 'goods',
        title: 'Enrolled goods',
        columns: [col('goodsId', 'Goods'), col('skus', 'SKUs', 'number'), col('quantity', 'Activity quantity', 'number'), col('remaining', 'Left', 'number')],
        rows: (res.goodsList || []).map((g) => ({ goodsId: String(g.goodsId), skus: (g.skuList || []).length, quantity: g.activityQuantity ?? 0, remaining: g.remainingActivityQuantity ?? 0 })),
      }],
    }
  },
}

/** Row actions. */
promotionsWithActions.actions = {
  /**
   * Enrols the chosen goods at Temu's own recommended activity price and quantity (read again here,
   * not taken from the page), then asks Temu for each result.
   */
  enrol: async (token, shop, activityId, value) => {
    const chosen = [...new Set((Array.isArray(value) ? value : [value]).map(String).filter(Boolean))]
    if (!chosen.length) throw new HttpError(400, { error: 'Choose at least one goods to enrol.' })
    const byId = new Map((await candidates(token, activityId)).map((g) => [String(g.goodsId), g]))
    const refused = []
    const drafts = []
    for (const goodsId of chosen) {
      const g = byId.get(goodsId)
      if (!g?.isAllowedEnroll) { refused.push({ goodsId, reason: 'Temu does not allow this goods in the activity' }); continue }
      const res = await temu.call('bg.promotion.activity.goods.enroll', {
        access_token: token,
        activityId: Number(activityId),
        enrollGoods: {
          traceCode: crypto.randomUUID(),
          goodsId: Number(goodsId),
          activityQuantity: g.recommendActivityQuantity,
          enrollSkuList: (g.skuList || []).map((s) => ({ skuId: s.skuId, activitySupplierPrice: s.recommendActivitySupplierPrice })),
        },
      })
      if (res.failReason) refused.push({ goodsId, reason: res.failReason })
      else if (res.draftId != null) drafts.push({ goodsId, draftId: res.draftId })
    }
    if (drafts.length) {
      const results = await temu.call('bg.promotion.activity.goods.operation.query', { access_token: token, draftIdList: drafts.map((d) => d.draftId) })
      const byDraft = new Map((Array.isArray(results) ? results : results?.list || []).map((r) => [String(r.draftId), r]))
      for (const d of drafts) {
        const reason = byDraft.get(String(d.draftId))?.failReason
        if (reason) refused.push({ goodsId: d.goodsId, reason })
      }
    }
    refused.sort((a, b) => chosen.indexOf(a.goodsId) - chosen.indexOf(b.goodsId))
    const enrolled = chosen.length - refused.length
    return {
      message: `Enrolled ${enrolled} goods.${refused.length ? ` Not enrolled: ${refused.map((r) => `${r.goodsId} (${r.reason})`).join(', ')}.` : ''}`,
      refused,
    }
  },
}

module.exports = promotionsWithActions
