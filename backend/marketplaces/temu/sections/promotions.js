/**
 * Temu "promotions" section: activities the shop joined (with its enrolled goods) and Temu's
 * activities, with "Enrol goods" from Temu's own candidate list for that activity.
 */
const crypto = require('crypto')
const temu = require('../service')
const { HttpError } = require('../../../utils/httpError')
const { words, col, tables } = require('../../../services/marketplace/sectionKit')
const { temuTime, temuAmount } = require('./helpers')
const goodsTitles = require('./goodsTitles')

// Temu documents no page-size limit for bg.promotion.activity.query; a size it refuses answers
// 220010001 "parameter is illegal", so smaller sizes (then no paging at all) are tried in turn.
// activityType is required in practice: probed on the live Temu US local shop (2026-11-24),
// no type and types 1, 3, 4 answer "parameter is illegal"; type 2 works.
const ACTIVITY_TYPE = 2
const PAGE_TRIES = [{ pageNumber: 1, pageSize: 50 }, { pageNumber: 1, pageSize: 20 }, { pageNumber: 1, pageSize: 10 }, {}]
const illegal = (err) => Number(err?.code) === 220010001 || /parameter is illegal/i.test(err?.message || '')

/** Temu's activities (read-only), trying smaller pages while Temu calls the parameters illegal. */
async function activityQuery(token, extra = {}) {
  let last
  for (const paging of PAGE_TRIES) {
    try {
      return await temu.call('bg.promotion.activity.query', { access_token: token, activityType: ACTIVITY_TYPE, ...paging, ...extra })
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

/**
 * The quantity and SKU prices to send for one goods: Temu's recommendation, or the seller's own.
 * Own prices are in the unit Temu's recommendation comes in and go back in its shape (a number,
 * or { amount, currency }), so no unit is guessed; a price never goes above that recommendation,
 * and a SKU without one can only keep Temu's own price.
 */
function enrolPlan(g, mine) {
  const recommended = (g.skuList || []).map((s) => ({ skuId: s.skuId, activitySupplierPrice: s.recommendActivitySupplierPrice }))
  if (!mine) return { quantity: g.recommendActivityQuantity, skus: recommended }
  const quantity = Number(mine.quantity)
  if (!Number.isInteger(quantity) || quantity < 1) return { error: 'the activity quantity must be a whole number of at least 1' }
  const prices = new Map((mine.skus || []).map((s) => [String(s.skuId), Number(s.price)]))
  const skus = []
  for (const s of recommended) {
    if (!prices.has(String(s.skuId))) { skus.push(s); continue }
    const raw = s.activitySupplierPrice
    const rec = temuAmount(raw)?.value
    if (!Number.isFinite(rec)) return { error: `SKU ${s.skuId}: Temu gave no recommended price, so only Temu's own price can be used` }
    const price = Math.round(prices.get(String(s.skuId)) * 100) / 100
    if (!Number.isFinite(price) || price <= 0) return { error: `SKU ${s.skuId}: enter a price` }
    if (price > rec) return { error: `SKU ${s.skuId}: price above Temu's recommended activity price` }
    skus.push({ skuId: s.skuId, activitySupplierPrice: raw && typeof raw === 'object' ? { ...raw, amount: price.toFixed(2) } : price })
  }
  return { quantity, skus }
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
  // Lookups go to activities not joined yet; a row marked `checked` had its candidates read from Temu.
  await Promise.all(available.rows.filter((row) => !row.joined).slice(0, CANDIDATE_LOOKUPS).map(async (row) => {
    let goods
    try {
      goods = (await candidates(token, row.id)).filter((g) => g.isAllowedEnroll)
    } catch {
      return
    }
    row.checked = true
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
  /**
   * Goods Temu allows in an activity, with its recommended activity quantity and price per SKU
   * (the amount as Temu gives it; null when Temu gives none), for the Enrol goods steps.
   */
  candidates: async (token, shop, activityId) => {
    const all = await candidates(token, activityId)
    const goods = all.filter((g) => g.isAllowedEnroll)
    goods.info = all.info
    const titles = await goodsTitles(shop, goods.map((g) => String(g.goodsId))).catch(() => new Map())
    return {
      title: goods.info?.activityName || `Activity ${activityId}`,
      goods: goods.map((g) => ({
        goodsId: String(g.goodsId),
        title: titles.get(String(g.goodsId)) || '',
        quantity: g.recommendActivityQuantity ?? null,
        skus: (g.skuList || []).map((s) => ({ skuId: String(s.skuId), price: temuAmount(s.recommendActivitySupplierPrice)?.value ?? null })),
      })),
    }
  },
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
    // Each item: a goods id (Temu's recommended price and quantity), or
    // { goodsId, quantity, skus: [{ skuId, price }] } with your own (price in the unit Temu's
    // recommendation comes in; sent back in that same shape).
    const items = (Array.isArray(value) ? value : [value]).filter(Boolean)
    const own = new Map(items.filter((v) => typeof v === 'object').map((v) => [String(v.goodsId), v]))
    const chosen = [...new Set(items.map((v) => String(typeof v === 'object' ? v.goodsId : v)).filter(Boolean))]
    if (!chosen.length) throw new HttpError(400, { error: 'Choose at least one goods to enrol.' })
    const byId = new Map((await candidates(token, activityId)).map((g) => [String(g.goodsId), g]))
    const refused = []
    const drafts = []
    for (const goodsId of chosen) {
      const g = byId.get(goodsId)
      if (!g?.isAllowedEnroll) { refused.push({ goodsId, reason: 'Temu does not allow this goods in the activity' }); continue }
      const plan = enrolPlan(g, own.get(goodsId))
      if (plan.error) { refused.push({ goodsId, reason: plan.error }); continue }
      // One goods refused by Temu (success:false) must not stop the others.
      let res
      try {
        res = await temu.call('bg.promotion.activity.goods.enroll', {
        access_token: token,
        activityId: Number(activityId),
        enrollGoods: {
          traceCode: crypto.randomUUID(),
          goodsId: Number(goodsId),
          activityQuantity: plan.quantity,
          enrollSkuList: plan.skus,
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
