/**
 * eBay "buyers" section tables (next to the buyer list): feedback received and its 12-month
 * rating summary, from the Commerce Feedback API. Feedback without a reply offers "Reply"; orders
 * still waiting for the seller's feedback offer "Leave feedback" (sellers can only leave positive).
 */
const { col, tables, words } = require('../../../services/marketplace/sectionKit')
const { ebayGet, scopeAware } = require('./helpers')
const { ebaySend } = require('../client')
const { HttpError } = require('../../../utils/httpError')

const MAX_REPLY = 500 // eBay's limit for respond_to_feedback
const MAX_COMMENT = 500 // eBay's limit for leave feedback (commentText)
const PAGE = 100

/** Every order line waiting for the seller's feedback (all pages, up to 20). */
async function awaitingFeedback(token) {
  const all = []
  for (let page = 0; page < 20; page += 1) {
    const res = await ebayGet(token, `/commerce/feedback/v1/awaiting_feedback?filter=userRole:SELLER&limit=${PAGE}&offset=${all.length}`)
    const items = res.lineItems || []
    all.push(...items)
    if (!items.length || all.length >= (res.pagination?.total ?? 0)) break
  }
  return all
}

function summaryTiles(res) {
  const byRole = (res.feedbackRatingSummary || []).flatMap((s) => s.ratingSummaryByRatingType || [])
  const seller = byRole.find((s) => /SELLER/i.test(s.userRoleType || '')) || byRole[0]
  if (!seller) return []
  const count = (v) => (seller.feedbackRatingValueDistribution || []).find((d) => d.value === v)?.count || 0
  const [pos, neu, neg] = [count('POSITIVE'), count('NEUTRAL'), count('NEGATIVE')]
  const metric = (seller.feedbackMetrics || []).find((m) => /POSITIVE.*PERCENT|PERCENT.*POSITIVE/i.test(m.metricName || ''))
  const positivePct = metric ? Number(metric.metricValue) : pos + neg ? Math.round((pos / (pos + neg)) * 1000) / 10 : 0
  return [
    { tab: 'Feedback', label: 'Positive feedback', value: positivePct, type: 'percent' },
    { tab: 'Feedback', label: 'Positive', value: pos, type: 'number' },
    { tab: 'Feedback', label: 'Neutral', value: neu, type: 'number' },
    { tab: 'Feedback', label: 'Negative', value: neg, type: 'number' },
  ]
}

async function buyers(token, shop) {
  const user = shop?.accountUsername
  const needUser = () => {
    if (!user) throw new Error('Reconnect eBay in Settings so the dashboard knows your eBay user name.')
    return encodeURIComponent(user)
  }
  let summary = []
  const list = await tables([
    {
      id: 'received',
      tab: 'Feedback',
      title: 'Feedback received',
      columns: [col('date', 'Date', 'date'), col('buyer', 'Buyer'), col('rating', 'Rating', 'status'), col('comment', 'Comment'), col('item', 'Item'), col('reply', 'Your reply')],
      load: scopeAware(async () => {
        const u = needUser()
        const [entries, rating] = await Promise.all([
          ebayGet(token, `/commerce/feedback/v1/feedback?user_id=${u}&feedback_type=FEEDBACK_RECEIVED&limit=50`),
          ebayGet(token, `/commerce/feedback/v1/feedback_rating_summary?user_id=${u}&filter=${encodeURIComponent('ratingType:OVERALL_EXPERIENCE,lookbackPeriodInDays:365')}`).catch(() => null),
        ])
        if (rating) summary = summaryTiles(rating)
        return (entries.feedbackEntries || [])
          .map((f) => {
            const reply = f.replyComment?.commentText || ''
            return {
              id: f.feedbackId,
              date: f.feedbackEnteredDate || null,
              buyer: f.providerUserDetail?.userId || '',
              rating: words(f.commentType),
              comment: f.feedbackComment?.commentText || '',
              item: f.orderLineItemSummary?.listingTitle || f.orderLineItemSummary?.listingId || '',
              reply,
              actions: reply ? [] : [{ id: 'reply', label: 'Reply', input: { label: `Your reply (up to ${MAX_REPLY} characters, no links or contact details)`, maxLength: MAX_REPLY } }],
            }
          })
          .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      }, 'feedback'),
    },
    {
      id: 'awaiting',
      tab: 'Feedback',
      title: 'Waiting for your feedback',
      note: 'Orders where you can still leave feedback for the buyer. eBay lets sellers leave positive feedback only.',
      columns: [col('item', 'Item'), col('listingId', 'Listing'), col('price', 'Price', 'money')],
      load: scopeAware(async () => (await awaitingFeedback(token)).map((l) => ({
        id: String(l.orderLineItemId),
        item: l.listingTitle || '',
        listingId: String(l.listingId || ''),
        price: l.listingPrice?.value != null ? { value: Number(l.listingPrice.value), currency: l.listingPrice.currency || 'USD' } : null,
        actions: [{ id: 'leave-feedback', label: 'Leave feedback', input: { label: `Positive feedback for the buyer (up to ${MAX_COMMENT} characters, no links or contact details)`, maxLength: MAX_COMMENT } }],
      })), 'feedback'),
    },
  ])
  return { summary, tables: list }
}

/** Row actions served by the generic section action route. */
buyers.actions = {
  /** Positive feedback for the buyer of one order line; listing and transaction come from eBay, not the page. */
  'leave-feedback': async (token, shop, id, value) => {
    const commentText = String((value && typeof value === 'object' ? value.value : value) ?? '').trim()
    if (!commentText || commentText.length > MAX_COMMENT) throw new HttpError(400, { error: `Feedback is 1 to ${MAX_COMMENT} characters.` })
    const line = (await awaitingFeedback(token)).find((l) => String(l.orderLineItemId) === String(id))
    if (!line) throw new HttpError(404, { error: 'eBay no longer waits for feedback on this order.' })
    await ebaySend(token, 'POST', '/commerce/feedback/v1/feedback', {
      listingId: String(line.listingId),
      transactionId: String(line.transactionId),
      orderLineItemId: String(line.orderLineItemId),
      commentType: 'POSITIVE',
      commentText,
    })
    return { message: `Feedback left for the buyer of ${line.listingTitle || line.listingId}.` }
  },
}

module.exports = buyers
module.exports.MAX_REPLY = MAX_REPLY
