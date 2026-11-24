/**
 * Temu "promotions" section: activities the shop joined (with its enrolled goods) and Temu's
 * activities, with "Enrol goods" from Temu's own candidate list for that activity.
 */
const crypto = require('crypto')
const temu = require('../service')
const { HttpError } = require('../../../utils/httpError')
const { words, col, tables } = require('../../../services/marketplace/sectionKit')
const { temuTime } = require('./helpers')

// Temu documents no page-size limit for bg.promotion.activity.query; a size it refuses answers
// 220010001 "parameter is illegal", so smaller sizes (then no paging at all) are tried in turn.
const PAGE_TRIES = [{ pageNumber: 1, pageSize: 50 }, { pageNumber: 1, pageSize: 20 }, { pageNumber: 1, pageSize: 10 }, {}]
const illegal = (err) => Number(err?.code) === 220010001 || /parameter is illegal/i.test(err?.message || '')

/** Temu's activities (read-only), trying smaller pages while Temu calls the parameters illegal. */
async function activityQuery(token, extra = {}) {
  let last
  for (const paging of PAGE_TRIES) {
    try {
      return await temu.call('bg.promotion.activity.query', { access_token: token, ...paging, ...extra })
    } catch (err) {
      if (!illegal(err)) throw err
      last = err
    }
  }
  throw new Error(`${last.message} (Temu refused every page size). Run "npm run temu-probe -- bg.promotion.activity.query" on the server and send the output.`)
}

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
      load: async () => ((await activityQuery(token, { onlyQueryJoinedActivity: true })).activityList || []).map(activityRow),
    },
    {
      id: 'available',
      title: 'Temu promotions',
      note: "Enrol goods with Temu's recommended activity price and quantity. Activities without an Enrol button have no goods Temu allows in them.",
      columns,
      load: async () => ((await activityQuery(token)).activityList || []).map(activityRow),
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
  return allPages((pageNumber) => temu.call('bg.promotion.activity.candidate.goods.query', { access_token: token, activityId: Number(activityId), pageNumber, pageSize: 100 }))
}

const MAX_PAGES = 20

/** Every goods of a paged Temu list (`{ goodsList, total }`), up to 20 pages of 100. */
async function allPages(fetchPage) {
  const all = []
  let first = null
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchPage(page)
    if (!first) first = res
    const rows = res.goodsList || []
    all.push(...rows)
    if (!rows.length || all.length >= (res.total ?? all.length)) break
  }
  all.info = first?.activityInfo
  return all
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
    const goods = await allPages((pageNumber) => temu.call('bg.promotion.activity.goods.query', { access_token: token, activityId: Number(activityId), pageNumber, pageSize: 100 }))
    return {
      title: goods.info?.activityName || `Activity ${activityId}`,
      tables: [{
        id: 'goods',
        title: 'Enrolled goods',
        columns: [col('goodsId', 'Goods'), col('skus', 'SKUs', 'number'), col('quantity', 'Activity quantity', 'number'), col('remaining', 'Left', 'number')],
        rows: goods.map((g) => ({ goodsId: String(g.goodsId), skus: (g.skuList || []).length, quantity: g.activityQuantity ?? 0, remaining: g.remainingActivityQuantity ?? 0 })),
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
      // One goods refused by Temu (success:false) must not stop the others.
      let res
      try {
        res = await temu.call('bg.promotion.activity.goods.enroll', {
        access_token: token,
        activityId: Number(activityId),
        enrollGoods: {
          traceCode: crypto.randomUUID(),
          goodsId: Number(goodsId),
          activityQuantity: g.recommendActivityQuantity,
          enrollSkuList: (g.skuList || []).map((s) => ({ skuId: s.skuId, activitySupplierPrice: s.recommendActivitySupplierPrice })),
        },
        })
      } catch (err) {
        refused.push({ goodsId, reason: err.message || 'Temu refused it' })
        continue
      }
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
    // Temu reviews enrolments: they are submitted, not yet confirmed.
    const submitted = chosen.length - refused.length
    return {
      message: `Submitted ${submitted} goods to Temu.${refused.length ? ` Not enrolled: ${refused.map((r) => `${r.goodsId} (${r.reason})`).join(', ')}.` : ''}`,
      refused,
    }
  },
}

module.exports = promotionsWithActions
