/**
 * eBay "advertising" section (Promoted Listings, Marketing API): campaigns with their type, status,
 * ad rate and budget, and the actions eBay allows in each state. Paths are written out in full at
 * each call so the API coverage report finds them.
 */
const { money, words, col, tables } = require('../../../services/marketplace/sectionKit')
const { ebayGet } = require('./helpers')
const { ebaySend } = require('../client')
const { HttpError } = require('../../../utils/httpError')
const Listing = require('../../../models/Listing')
const Product = require('../../../models/Product')

const enc = encodeURIComponent
const PAGE = 100
const MAX_PAGES = 20
const DAY = 86400000
const BATCH = 500 // eBay's limit per bulk ads call and per Recommendation API call
const ACTION_LOOKUPS = 10 // General campaigns whose ads and suggestions are read per load
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

/** The shop's live eBay listings: `[{ listingId, title }]` (ids without the dashboard's `item-` prefix). */
async function shopListings(shop) {
  const listings = await Listing.find({ shopId: shop?._id, marketplace: 'ebay', status: { $in: ['live', 'out_of_stock'] } }).select('externalListingId productId').lean()
  const titles = new Map((await Product.find({ _id: { $in: listings.map((l) => l.productId) } }).select('title').lean()).map((p) => [String(p._id), p.title]))
  return listings
    .map((l) => ({ listingId: String(l.externalListingId || '').replace(/^(ebay-)?item-/, ''), title: titles.get(String(l.productId)) || '' }))
    .filter((l) => l.listingId)
}

/** Every ad of a campaign (all pages, 500 per page). */
async function campaignAds(token, id) {
  const all = []
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await ebayGet(token, `/sell/marketing/v1/ad_campaign/${enc(id)}/ad?limit=${BATCH}&offset=${offset}`)
    const list = res.ads || []
    all.push(...list)
    if (!list.length || (res.total != null ? all.length >= res.total : list.length < BATCH)) break
    offset += list.length
  }
  return all
}

/** eBay's suggested ad rate per listing (Recommendation API, 500 listings per call; ITEM basis first). */
async function suggestedRates(token, listingIds) {
  const rates = new Map()
  for (let i = 0; i < listingIds.length; i += BATCH) {
    const res = await ebaySend(token, 'POST', '/sell/recommendation/v1/find?filter=recommendationTypes:%7BAD%7D', { listingIds: listingIds.slice(i, i + BATCH) })
    for (const rec of res.listingRecommendations || []) {
      const bids = rec.marketing?.ad?.bidPercentages || []
      const bid = bids.find((b) => b.basis === 'ITEM') || bids[0]
      if (bid?.value != null) rates.set(String(rec.listingId), Number(bid.value))
    }
  }
  return rates
}

/** An ad rate typed by the seller: 2–100 % (eBay's limits for General campaigns), one decimal. */
function parseRate(value) {
  const rate = Number(value)
  if (!Number.isFinite(rate) || rate < 2 || rate > 100) throw new HttpError(400, { error: 'An ad rate is between 2% and 100%.' })
  return rate.toFixed(1)
}

const chosen = (value) => [...new Set((Array.isArray(value?.listings) ? value.listings : []).map(String).filter(Boolean))]
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Sends a bulk ads call in batches of 500; each listing eBay refuses comes back with its reason. */
async function bulk(token, url, requests) {
  const refused = []
  for (let i = 0; i < requests.length; i += BATCH) {
    const res = await ebaySend(token, 'POST', url, { requests: requests.slice(i, i + BATCH) })
    for (const r of res.responses || []) {
      if (r.errors?.length || Number(r.statusCode) >= 400) refused.push({ listingId: String(r.listingId), reason: r.errors?.[0]?.message || `eBay returned ${r.statusCode}` })
    }
  }
  return refused
}

const refusedText = (refused, verb) => (refused.length ? ` Not ${verb}: ${refused.map((r) => `${r.listingId} (${r.reason})`).join(', ')}.` : '')

/** General-campaign ad actions, with the options read for this campaign. */
function adActions(listings, ads, suggested) {
  const inCampaign = new Set(ads.map((a) => String(a.listingId)))
  const tips = new Set(suggested.map((s) => String(s.listingId)))
  const free = listings.filter((l) => !inCampaign.has(l.listingId))
    .map((l) => ({ value: l.listingId, label: `${l.title || 'Listing'} (${l.listingId})${tips.has(l.listingId) ? ' (suggested by eBay)' : ''}`, tip: tips.has(l.listingId) }))
    .sort((a, b) => Number(b.tip) - Number(a.tip))
    .map(({ value, label }) => ({ value, label }))
  const current = ads.map((a) => ({ value: String(a.listingId), label: `${listings.find((l) => l.listingId === String(a.listingId))?.title || 'Listing'} (${a.listingId})` }))
  return [
    ...(free.length ? [{ id: 'add-listings', label: 'Add listings', input: { fields: [
      { name: 'listings', label: 'Listings to promote', options: free, multiple: true },
      { name: 'rate', label: 'Ad rate %', type: 'number', optional: true, hint: "Leave empty to use eBay's suggested rate for each listing." },
    ] } }] : []),
    ...(current.length ? [
      { id: 'set-rate', label: 'Set ad rate', input: { fields: [{ name: 'listings', label: 'Listings', options: current, multiple: true }, { name: 'rate', label: 'Ad rate % (2–100)', type: 'number' }] } },
      { id: 'remove-listings', label: 'Remove listings', danger: true, input: { fields: [{ name: 'listings', label: 'Listings to stop promoting', options: current, multiple: true }] } },
    ] : []),
  ]
}

/** Campaign dates from the form (yyyy-mm-dd): start today or later (today = now), end after the start. */
function campaignDates(value, now) {
  const today = now.toISOString().slice(0, 10)
  const day = /^\d{4}-\d{2}-\d{2}$/
  const start = String(value?.start || '').trim()
  const end = String(value?.end || '').trim()
  if (start && (!day.test(start) || start < today)) throw new HttpError(400, { error: 'The start date must be today or later.' })
  const startDate = !start || start === today ? now.toISOString() : `${start}T00:00:00.000Z`
  if (end && (!day.test(end) || `${end}T23:59:59.000Z` <= startDate)) throw new HttpError(400, { error: 'The end date must be after the start date.' })
  return { startDate, ...(end ? { endDate: `${end}T23:59:59.000Z` } : {}) }
}

/** The campaign with this name, or null (eBay answers 404 when there is none). */
async function campaignByName(token, name) {
  try {
    return await ebayGet(token, `/sell/marketing/v1/ad_campaign/get_campaign_by_name?campaign_name=${enc(name)}`)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

const campaignForm = (listings) => ({ fields: [
  { name: 'name', label: 'Campaign name', maxLength: 80 },
  { name: 'rate', label: 'Ad rate %', type: 'number', optional: true, hint: "Leave empty to use eBay's suggested rate for each listing." },
  { name: 'start', label: 'Starts', type: 'date', optional: true, hint: 'Empty: starts now.' },
  { name: 'end', label: 'Ends', type: 'date', optional: true, hint: 'Empty: runs until you end it.' },
  ...(listings.length ? [{ name: 'listings', label: 'Listings to promote', options: listings.map((l) => ({ value: l.listingId, label: `${l.title || 'Listing'} (${l.listingId})` })), multiple: true, optional: true }] : []),
] })

function campaignActions(c) {
  const status = String(c.campaignStatus || '').toUpperCase()
  const ads = [{ id: 'ads', label: 'Ads', detail: true }]
  // eBay copies only ended rules-based campaigns.
  if (status === 'ENDED') return [...ads, ...(c.campaignCriterion ? [{ id: 'clone', label: 'Copy', input: { fields: [{ name: 'name', label: 'Name of the copy', maxLength: 80 }, { name: 'start', label: 'Starts', type: 'date', optional: true }] } }] : [])]
  if (status === 'DELETED') return ads
  const name = c.campaignName || c.campaignId
  return [
    ...(status === 'RUNNING' ? [{ id: 'pause', label: 'Pause', confirm: `Pause campaign "${name}"? Its ads stop showing until you resume it.` }] : []),
    ...(status === 'PAUSED' ? [{ id: 'resume', label: 'Resume', confirm: `Resume campaign "${name}"?` }] : []),
    { id: 'rename', label: 'Rename', input: { fields: [{ name: 'value', label: 'New name', maxLength: 80 }] } },
    ...(c.fundingStrategy?.fundingModel === 'COST_PER_CLICK' ? [{ id: 'budget', label: 'Daily budget', input: { fields: [{ name: 'value', label: 'Daily budget (USD)', type: 'number' }] } }] : []),
    { id: 'end', label: 'End', danger: true, confirm: `End campaign "${name}"? Its ads stop and it can't be restarted.` },
    ...ads,
  ]
}

async function advertising(token, shop, { now = new Date() } = {}) {
  let campaigns = []
  const listings = await shopListings(shop).catch(() => [])
  const list = await tables([{
    id: 'campaigns',
    tab: 'Campaigns',
    title: 'Campaigns',
    note: 'General campaigns charge an ad rate (% of the sale) only when a buyer clicks the ad and buys. Priority campaigns charge per click, up to a daily budget.',
    columns: [col('name', 'Campaign'), col('type', 'Type'), col('status', 'Status', 'status'), col('rate', 'Ad rate %', 'number'), col('budget', 'Daily budget', 'money'), col('start', 'Starts', 'date'), col('end', 'Ends', 'date')],
    load: async () => {
      campaigns = await allCampaigns(token)
      // General campaigns that can still change get their ads and eBay's suggestions for the add/remove choices.
      const open = campaigns.filter((c) => c.fundingStrategy?.fundingModel === 'COST_PER_SALE' && !/ENDED|DELETED/i.test(c.campaignStatus || '')).slice(0, ACTION_LOOKUPS)
      const extra = new Map(await Promise.all(open.map(async (c) => {
        const [ads, suggested] = await Promise.all([
          campaignAds(token, c.campaignId).catch(() => null),
          ebayGet(token, `/sell/marketing/v1/ad_campaign/${enc(c.campaignId)}/suggest_items?limit=100`).then((r) => r.suggestedItems || []).catch(() => []),
        ])
        return [String(c.campaignId), ads ? adActions(listings, ads, suggested) : []]
      })))
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
        actions: [...(extra.get(String(c.campaignId)) || []), ...campaignActions(c)],
      }))
    },
  }])
  list[0].actions = [{ id: 'create', label: '+ New campaign', input: campaignForm(listings) }]
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
advertising.details = {
  /** A campaign's ads: listing, title, ad rate and status. */
  ads: async (token, shop, id) => {
    const [ads, listings] = await Promise.all([campaignAds(token, id), shopListings(shop).catch(() => [])])
    const titles = new Map(listings.map((l) => [l.listingId, l.title]))
    return {
      title: `Ads in campaign ${id}`,
      tables: [{
        id: 'ads',
        title: 'Ads',
        columns: [col('listingId', 'Listing'), col('title', 'Title'), col('rate', 'Ad rate %', 'number'), col('status', 'Status', 'status')],
        rows: ads.map((a) => ({ listingId: String(a.listingId), title: titles.get(String(a.listingId)) || '—', rate: a.bidPercentage != null ? Number(a.bidPercentage) : null, status: words(a.adStatus) })),
      }],
    }
  },
}

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
    /** Promotes the chosen listings: the rate typed for all, else eBay's suggestion per listing, else the campaign's rate. */
  'add-listings': async (token, shop, id, value) => {
    const ids = chosen(value)
    if (!ids.length) throw new HttpError(400, { error: 'Choose at least one listing.' })
    const typed = String(value?.rate ?? '').trim() ? parseRate(value.rate) : null
    const refused = []
    let requests
    if (typed) requests = ids.map((listingId) => ({ listingId, bidPercentage: typed }))
    else {
      const [suggested, c] = await Promise.all([suggestedRates(token, ids), ebayGet(token, `/sell/marketing/v1/ad_campaign/${enc(id)}`)])
      const fallback = c.fundingStrategy?.bidPercentage != null ? Number(c.fundingStrategy.bidPercentage) : null
      requests = ids.flatMap((listingId) => {
        const rate = suggested.get(listingId) ?? fallback
        if (rate == null) { refused.push({ listingId, reason: 'eBay has no suggested rate for it: enter an ad rate' }); return [] }
        return [{ listingId, bidPercentage: Math.min(100, Math.max(2, rate)).toFixed(1) }]
      })
    }
    refused.push(...await bulk(token, `/sell/marketing/v1/ad_campaign/${enc(id)}/bulk_create_ads_by_listing_id`, requests))
    const added = ids.length - refused.length
    return { message: `Added ${plural(added, 'listing')}.${refusedText(refused, 'added')}`, refused }
  },
  'remove-listings': async (token, shop, id, value) => {
    const ids = chosen(value)
    if (!ids.length) throw new HttpError(400, { error: 'Choose at least one listing.' })
    const refused = await bulk(token, `/sell/marketing/v1/ad_campaign/${enc(id)}/bulk_delete_ads_by_listing_id`, ids.map((listingId) => ({ listingId })))
    return { message: `Removed ${plural(ids.length - refused.length, 'listing')}.${refusedText(refused, 'removed')}`, refused }
  },
  'set-rate': async (token, shop, id, value) => {
    const ids = chosen(value)
    const rate = parseRate(value?.rate)
    if (!ids.length) throw new HttpError(400, { error: 'Choose at least one listing.' })
    const refused = await bulk(token, `/sell/marketing/v1/ad_campaign/${enc(id)}/bulk_update_ads_bid_by_listing_id`, ids.map((listingId) => ({ listingId, bidPercentage: rate })))
    return { message: `Ad rate ${rate}% set on ${plural(ids.length - refused.length, 'listing')}.${refusedText(refused, 'changed')}`, refused }
  },
  /** A new General (cost-per-sale) campaign, then the chosen listings added to it. */
  create: async (token, shop, id, value) => {
    const campaignName = String(value?.name ?? '').trim()
    if (!campaignName) throw new HttpError(400, { error: 'Enter a campaign name.' })
    const typed = String(value?.rate ?? '').trim() ? parseRate(value.rate) : null
    const dates = campaignDates(value, advertising.now())
    if (await campaignByName(token, campaignName)) throw new HttpError(400, { error: `A campaign named "${campaignName}" already exists.` })
    await ebaySend(token, 'POST', '/sell/marketing/v1/ad_campaign', {
      campaignName,
      marketplaceId: 'EBAY_US',
      ...dates,
      fundingStrategy: { fundingModel: 'COST_PER_SALE', ...(typed ? { bidPercentage: typed } : {}) },
    })
    // eBay returns the new id only in a Location header: read it back by name.
    const made = await campaignByName(token, campaignName)
    let added = ''
    if (made?.campaignId && chosen(value).length) added = ` ${(await advertising.actions['add-listings'](token, shop, String(made.campaignId), { listings: chosen(value), rate: typed || '' })).message}`
    return { message: `Campaign "${campaignName}" created.${added}` }
  },
  /** A copy of an ended rules-based campaign (eBay's requirement), with its funding. */
  clone: async (token, shop, id, value) => {
    const campaignName = String(value?.name ?? '').trim()
    if (!campaignName) throw new HttpError(400, { error: 'Enter a name for the copy.' })
    const { startDate } = campaignDates({ start: value?.start }, advertising.now())
    const source = await ebayGet(token, `/sell/marketing/v1/ad_campaign/${enc(id)}`)
    await ebaySend(token, 'POST', `/sell/marketing/v1/ad_campaign/${enc(id)}/clone`, { campaignName, startDate, fundingStrategy: source.fundingStrategy })
    return { message: `Campaign "${campaignName}" created from ${source.campaignName || id}.` }
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

advertising.now = () => new Date()
advertising.suggestedRates = suggestedRates
advertising.campaignAds = campaignAds
advertising.bulkAds = bulk
advertising.shopListings = shopListings

module.exports = advertising
