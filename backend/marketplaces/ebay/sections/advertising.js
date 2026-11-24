/**
 * eBay "advertising" section (Promoted Listings, Marketing API): campaigns with their type, status,
 * ad rate and budget, and the actions eBay allows in each state. Paths are written out in full at
 * each call so the API coverage report finds them.
 */
const { money, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet } = require('./helpers')
const { ebaySend } = require('../client')
const { HttpError } = require('../../../utils/httpError')

const enc = encodeURIComponent
const PAGE = 100
const MAX_PAGES = 20
const DAY = 86400000
const TYPES = { COST_PER_SALE: 'General (cost per sale)', COST_PER_CLICK: 'Priority (cost per click)' }

/** Every campaign of the seller (all pages, up to 20 × 100). */
async function allCampaigns(token) {
  const all = []
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await ebayGet(token, `/sell/marketing/v1/ad_campaign?limit=${PAGE}&offset=${offset}`)
    const list = res.campaigns || []
    all.push(...list)
    // eBay's `total` decides (it may send fewer than asked per page); without it, a short page ends.
    if (!list.length || (res.total != null ? all.length >= res.total : list.length < PAGE)) break
    offset += list.length
  }
  return all
}

function campaignActions(c) {
  const status = String(c.campaignStatus || '').toUpperCase()
  if (status === 'ENDED' || status === 'DELETED') return []
  const name = c.campaignName || c.campaignId
  return [
    ...(status === 'RUNNING' ? [{ id: 'pause', label: 'Pause', confirm: `Pause campaign "${name}"? Its ads stop showing until you resume it.` }] : []),
    ...(status === 'PAUSED' ? [{ id: 'resume', label: 'Resume', confirm: `Resume campaign "${name}"?` }] : []),
    { id: 'rename', label: 'Rename', input: { fields: [{ name: 'value', label: 'New name', maxLength: 80 }] } },
    ...(c.fundingStrategy?.fundingModel === 'COST_PER_CLICK' ? [{ id: 'budget', label: 'Daily budget', input: { fields: [{ name: 'value', label: 'Daily budget (USD)', type: 'number' }] } }] : []),
    { id: 'end', label: 'End', danger: true, confirm: `End campaign "${name}"? Its ads stop and it can't be restarted.` },
  ]
}

async function advertising(token, shop, { now = new Date() } = {}) {
  let campaigns = []
  const list = await tables([{
    id: 'campaigns',
    tab: 'Campaigns',
    title: 'Campaigns',
    note: 'General campaigns charge an ad rate (% of the sale) only when a buyer clicks the ad and buys. Priority campaigns charge per click, up to a daily budget.',
    columns: [col('name', 'Campaign'), col('type', 'Type'), col('status', 'Status', 'status'), col('rate', 'Ad rate %', 'number'), col('budget', 'Daily budget', 'money'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
    load: async () => {
      campaigns = await allCampaigns(token)
      return campaigns.map((c) => ({
        id: String(c.campaignId),
        name: c.campaignName || String(c.campaignId),
        type: TYPES[c.fundingStrategy?.fundingModel] || words(c.fundingStrategy?.fundingModel),
        status: words(c.campaignStatus),
        rawStatus: c.campaignStatus || '',
        fundingModel: c.fundingStrategy?.fundingModel || '',
        rate: c.fundingStrategy?.bidPercentage != null ? Number(c.fundingStrategy.bidPercentage) : null,
        budget: money(c.budget?.daily?.amount),
        start: c.startDate || null,
        end: c.endDate || null,
        actions: campaignActions(c),
      }))
    },
  }])
  const count = (status) => campaigns.filter((c) => c.campaignStatus === status).length
  const recentlyEnded = campaigns.filter((c) => c.campaignStatus === 'ENDED' && c.endDate && now - new Date(c.endDate) <= 90 * DAY).length
  return {
    summary: [
      { tab: 'Campaigns', label: 'Running', value: count('RUNNING'), type: 'number' },
      { tab: 'Campaigns', label: 'Paused', value: count('PAUSED'), type: 'number' },
      { tab: 'Campaigns', label: 'Ended (last 90 days)', value: recentlyEnded, type: 'number' },
    ],
    tables: list,
  }
}

/** Read-only drill-downs: `details[name](token, shop, id) → { title, summary?, tables }`. */
advertising.details = {}

/** Row and table actions: `actions[name](token, shop, id, value) → { message }`. */
advertising.actions = {
  pause: async (token, shop, id) => {
    await ebaySend(token, 'POST', `/sell/marketing/v1/ad_campaign/${enc(id)}/pause`)
    return { message: `Campaign ${id} paused.` }
  },
  resume: async (token, shop, id) => {
    await ebaySend(token, 'POST', `/sell/marketing/v1/ad_campaign/${enc(id)}/resume`)
    return { message: `Campaign ${id} resumed.` }
  },
  end: async (token, shop, id) => {
    await ebaySend(token, 'POST', `/sell/marketing/v1/ad_campaign/${enc(id)}/end`)
    return { message: `Campaign ${id} ended.` }
  },
  rename: async (token, shop, id, value) => {
    const campaignName = String((value && typeof value === 'object' ? value.value : value) ?? '').trim()
    if (!campaignName) throw new HttpError(400, { error: 'Enter a campaign name.' })
    await ebaySend(token, 'POST', `/sell/marketing/v1/ad_campaign/${enc(id)}/update_campaign_identification`, { campaignName })
    return { message: `Campaign renamed to "${campaignName}".` }
  },
  /** Priority (cost-per-click) campaigns only: General campaigns have no budget. */
  budget: async (token, shop, id, value) => {
    const amount = Number((value && typeof value === 'object' ? value.value : value) ?? NaN)
    if (!(amount > 0)) throw new HttpError(400, { error: 'Enter a daily budget above 0.' })
    const c = await ebayGet(token, `/sell/marketing/v1/ad_campaign/${enc(id)}`)
    if (c.fundingStrategy?.fundingModel !== 'COST_PER_CLICK') throw new HttpError(400, { error: 'Only Priority (cost per click) campaigns have a daily budget.' })
    const currency = c.budget?.daily?.amount?.currency || 'USD'
    await ebaySend(token, 'POST', `/sell/marketing/v1/ad_campaign/${enc(id)}/update_campaign_budget`, { daily: { amount: { value: amount.toFixed(2), currency } } })
    return { message: `Daily budget set to ${currency} ${amount.toFixed(2)}.` }
  },
}

module.exports = advertising
