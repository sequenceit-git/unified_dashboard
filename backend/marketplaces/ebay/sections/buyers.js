/**
 * eBay "buyers" section tables (next to the buyer list): feedback received and its 12-month
 * rating summary, from the Commerce Feedback API. Feedback without a reply offers "Reply".
 */
const { col, tables, words } = require('../../../services/marketplace/sectionKit')
const { ebayGet, scopeAware } = require('./helpers')

const MAX_REPLY = 500 // eBay's limit for respond_to_feedback

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
  ])
  return { summary, tables: list }
}

module.exports = buyers
module.exports.MAX_REPLY = MAX_REPLY
