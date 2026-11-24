/**
 * eBay Trading API (XML). Listings made in Seller Hub exist only here — the Inventory API
 * cannot see them — so listing sync, publishing and revisions go through these calls.
 */

const { cleanDescription } = require('./description')
const { XMLParser } = require('fast-xml-parser')
const config = require('./config')
const { filterEbayCompliantImages } = require('../../utils/imageResolution')

const LIST_TAGS = new Set([
  'Errors',
  'PictureURL',
  'NameValueList',
  'Value',
  'ShippingServiceOptions',
  'ShipToLocations',
  'Variation',
  'VariationSpecificPictureSet',
  'Pictures',
  'Condition',
  'Category',
])
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  isArray: (name, jpath) => LIST_TAGS.has(name) || (name === 'Item' && jpath.endsWith('ItemArray.Item')),
})

const CONDITION_IDS = {
  NEW: 1000,
  LIKE_NEW: 1500,
  USED_EXCELLENT: 3000,
  USED_VERY_GOOD: 3000,
  USED_GOOD: 3000,
  FOR_PARTS_OR_NOT_WORKING: 7000,
}

function resolveConditionId(condition) {
  const raw = String(condition || '').trim()
  if (/^\d{4}$/.test(raw)) return Number(raw)
  return CONDITION_IDS[raw.toUpperCase()] || 1000
}

const EBAY_IDENTIFIER_PATTERNS = {
  UPC: /^\d{12}$/,
  EAN: /^(\d{8}|\d{13}|\d{14})$/,
  ISBN: /^(\d{9}[\dX]|\d{13})$/,
}

function validateEbayIdentifier(idObj) {
  const raw = String(idObj?.code || '').trim()
  if (!raw) return null
  const tag = String(idObj?.type || '').trim().toUpperCase()
  if (!EBAY_IDENTIFIER_PATTERNS[tag]) {
    throw new Error(`eBay identifier type must be UPC, EAN, or ISBN (got "${tag || 'empty'}").`)
  }
  if (/^does\s+not\s+apply$/i.test(raw)) {
    return { tag, value: 'Does not apply' }
  }
  if (!EBAY_IDENTIFIER_PATTERNS[tag].test(raw)) {
    throw new Error(`Invalid eBay ${tag} "${raw}". Enter a valid ${tag} or "Does not apply".`)
  }
  return { tag, value: raw }
}

const text = (value) => (value && typeof value === 'object' ? value['#text'] : value) ?? ''
const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cdata = (value) => `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`

async function call(token, name, inner) {
  const response = await fetch(`${config.apiBaseUrl}/ws/api.dll`, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name,
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1225',
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><${name}Request xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${inner}</${name}Request>`,
  })
  const text = await response.text()
  let doc
  try {
    doc = parser.parse(text)[`${name}Response`]
  } catch {
    doc = undefined
  }
  // A gateway/maintenance page or any reply without eBay's own <Ack> is a failure, never an empty success.
  if (!doc || !doc.Ack) {
    const error = new Error(`eBay ${name} failed: unexpected response (HTTP ${response.status})`)
    error.status = response.status >= 400 ? response.status : 502
    throw error
  }
  const errors = (doc.Errors || []).filter((item) => item.SeverityCode === 'Error')
  if (doc.Ack === 'Failure' || errors.length) {
    const message = errors.map((item) => item.LongMessage || item.ShortMessage).join(' ') || `eBay ${name} failed`
    const error = new Error(`eBay: ${message}`)
    error.status = /auth|token/i.test(message) ? 401 : response.status
    error.missingSpecifics = [...new Set([...message.matchAll(/item specific .*?Add (.+?) to this listing/gi)].map((match) => match[1].trim()))]
    if (error.missingSpecifics.length) {
      error.message = `eBay needs these item specifics for this category: ${error.missingSpecifics.join(', ')}. Fill them in and publish again.`
    }
    throw error
  }
  return doc
}

function parseItem(item) {
  const specifics = {}
  for (const row of item.ItemSpecifics?.NameValueList || []) {
    specifics[row.Name] = (row.Value || []).map(text).join(', ')
  }

  const rawVariations = item.Variations?.Variation || []
  const picMap = new Map()
  let primaryPicAttr = ''
  for (const picGroup of item.Variations?.Pictures || []) {
    const attrName = String(text(picGroup.VariationSpecificName) || '').trim()
    if (!primaryPicAttr && attrName) primaryPicAttr = attrName
    for (const picSet of picGroup.VariationSpecificPictureSet || []) {
      const val = String(text(picSet.VariationSpecificValue) || '').trim()
      const url = (picSet.PictureURL || []).map(text).find(Boolean)
      if (val && url && !picMap.has(val)) picMap.set(val, url)
    }
  }

  const variants = rawVariations.map((v, idx) => {
    const options = {}
    for (const nvl of v.VariationSpecifics?.NameValueList || []) {
      const k = String(text(nvl.Name) || '').trim()
      const val = (nvl.Value || []).map(text).find(Boolean) || ''
      if (k && val) options[k] = val
    }
    const vQty = Number(v.Quantity || 0) - Number(v.SellingStatus?.QuantitySold || 0)
    const vPrice = Number(text(v.StartPrice) || 0)
    const vSku = v.SKU && !/^none$/i.test(String(v.SKU).trim()) ? String(v.SKU).trim() : `EBAY-${item.ItemID}-${idx + 1}`
    const vDetails = v.VariationProductListingDetails || {}
    const vIdTag = ['UPC', 'EAN', 'ISBN'].find((tag) => text(vDetails[tag]))
    const primaryVal = primaryPicAttr ? options[primaryPicAttr] : Object.values(options)[0]
    const vImage = primaryVal ? picMap.get(primaryVal) : undefined
    return {
      sku: vSku,
      options,
      price: vPrice,
      stock: Math.max(0, vQty),
      ...(vImage ? { image: vImage } : {}),
      ...(vIdTag ? { identifierCode: { type: vIdTag, code: String(text(vDetails[vIdTag])).trim() } } : {}),
    }
  })

  const quantity = variants.length
    ? variants.reduce((sum, v) => sum + v.stock, 0)
    : Math.max(0, Number(item.Quantity || 0) - Number(item.SellingStatus?.QuantitySold || 0))
  const positiveVarPrices = variants.map((v) => v.price).filter((p) => p > 0)
  const price = variants.length && positiveVarPrices.length
    ? Math.min(...positiveVarPrices)
    : Number(text(item.SellingStatus?.CurrentPrice) || text(item.StartPrice) || 0)

  const pld = item.ProductListingDetails || {}
  const idTag = ['UPC', 'EAN', 'ISBN'].find((tag) => text(pld[tag]))
  const mpn = String(text(pld.BrandMPN?.MPN) || specifics.MPN || '').trim()
  const boEnabled = String(text(item.BestOfferDetails?.BestOfferEnabled) || '').toLowerCase() === 'true'
  const autoAccept = Number(text(item.ListingDetails?.BestOfferAutoAcceptPrice) || 0)
  const minOffer = Number(text(item.ListingDetails?.MinimumBestOfferPrice) || 0)

  return {
    itemId: String(item.ItemID),
    sku: item.SKU && !/^none$/i.test(String(item.SKU).trim()) ? String(item.SKU).trim() : '',
    title: item.Title || '',
    subtitle: String(text(item.SubTitle) || '').trim() || undefined,
    description: cleanDescription(item.Description),
    price,
    stock: quantity,
    images: (item.PictureDetails?.PictureURL || []).map(text).filter(Boolean),
    categoryId: item.PrimaryCategory?.CategoryID ? String(item.PrimaryCategory.CategoryID) : '',
    category: item.PrimaryCategory?.CategoryName || '',
    brand: specifics.Brand || String(text(pld.BrandMPN?.Brand) || '').trim() || '',
    ...(mpn ? { mpn } : {}),
    conditionId: item.ConditionID ? String(text(item.ConditionID)) : undefined,
    conditionDescription: String(text(item.ConditionDescription) || '').trim() || undefined,
    ...(item.DispatchTimeMax != null && item.DispatchTimeMax !== '' ? { dispatchTimeMax: Number(text(item.DispatchTimeMax)) } : {}),
    ...(idTag ? { identifierCode: { type: idTag, code: String(text(pld[idTag])).trim() } } : {}),
    ...(boEnabled ? {
      bestOffer: {
        enabled: true,
        ...(autoAccept > 0 ? { autoAcceptPrice: autoAccept } : {}),
        ...(minOffer > 0 ? { minOfferPrice: minOffer } : {}),
      },
    } : {}),
    ...(variants.length ? { variants } : {}),
    specifics,
    listingStatus: item.SellingStatus?.ListingStatus || '',
    url: item.ListingDetails?.ViewItemURL || '',
  }
}

async function getItem(token, itemId) {
  const doc = await call(token, 'GetItem', `<ItemID>${escapeXml(itemId)}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics>`)
  return doc.Item ? { ...parseItem(doc.Item), raw: doc.Item } : null
}

/** Category rules (variations enabled, allowed conditions, Best Offer, UPC/EAN/ISBN requirements). */
async function getCategoryFeatures(token, categoryId) {
  const inner = [
    `<CategoryID>${escapeXml(categoryId)}</CategoryID>`,
    '<DetailLevel>ReturnAll</DetailLevel>',
    '<ViewAllNodes>true</ViewAllNodes>',
    '<FeatureID>VariationsEnabled</FeatureID>',
    '<FeatureID>ConditionEnabled</FeatureID>',
    '<FeatureID>ConditionValues</FeatureID>',
    '<FeatureID>BestOfferEnabled</FeatureID>',
    '<FeatureID>UPCEnabled</FeatureID>',
    '<FeatureID>EANEnabled</FeatureID>',
    '<FeatureID>ISBNEnabled</FeatureID>',
  ].join('')
  const doc = await call(token, 'GetCategoryFeatures', inner)
  const defaults = doc.SiteDefaults || {}
  const categories = Array.isArray(doc.Category) ? doc.Category : []
  const cat = categories.find((row) => String(text(row.CategoryID)) === String(categoryId)) || categories[0] || {}
  const pick = (key, fallback) => {
    if (cat[key] !== undefined && cat[key] !== '') return cat[key]
    if (defaults[key] !== undefined && defaults[key] !== '') return defaults[key]
    return fallback
  }
  const rawVariations = pick('VariationsEnabled', 'false')
  const rawBestOffer = pick('BestOfferEnabled', 'true')
  const rawCondList = cat.ConditionValues?.Condition?.length
    ? cat.ConditionValues.Condition
    : (defaults.ConditionValues?.Condition || [])
  return {
    variationsEnabled: String(text(rawVariations)).toLowerCase() === 'true',
    conditionEnabled: String(text(pick('ConditionEnabled', 'Enabled'))),
    conditions: rawCondList
      .map((c) => ({ id: String(text(c.ID)), name: String(text(c.DisplayName) || text(c.ID)) }))
      .filter((c) => c.id),
    bestOfferEnabled: String(text(rawBestOffer)).toLowerCase() !== 'false',
    upcEnabled: String(text(pick('UPCEnabled', 'Enabled'))),
    eanEnabled: String(text(pick('EANEnabled', 'Enabled'))),
    isbnEnabled: String(text(pick('ISBNEnabled', 'Enabled'))),
  }
}

/** The eBay account (user ID) a token belongs to. GetUser needs no extra OAuth scope. */
async function getUser(token) {
  const doc = await call(token, 'GetUser', '')
  return { userId: String(text(doc.User?.UserID) || '').trim() }
}

const CORE_NOTIFICATION_EVENTS = [
  'FixedPriceTransaction',
  'AuctionCheckoutComplete',
  'ItemSold',
  'ItemMarkedShipped',
  'AskSellerQuestion',
  'MyMessagesM2MMessage',
  'ItemRevised',
  'ItemClosed',
]

/**
 * Points eBay's Platform Notifications for this seller at `url` and turns on `events`.
 * The delivery URL is app-wide; the event list is per seller. Falls back to the core event
 * set if eBay rejects an extended event name on the seller's account.
 */
async function setNotificationPreferences(token, { url, events = [] }) {
  const send = async (list) => {
    const enable = list
      .map((event) => `<NotificationEnable><EventType>${escapeXml(event)}</EventType><EventEnable>Enable</EventEnable></NotificationEnable>`)
      .join('')
    await call(token, 'SetNotificationPreferences', [
      '<ApplicationDeliveryPreferences>',
      '<ApplicationEnable>Enable</ApplicationEnable>',
      `<ApplicationURL>${escapeXml(url)}</ApplicationURL>`,
      '<DeviceType>Platform</DeviceType>',
      '</ApplicationDeliveryPreferences>',
      `<UserDeliveryPreferenceArray>${enable}</UserDeliveryPreferenceArray>`,
    ].join(''))
  }
  try {
    await send(events)
    return events
  } catch (err) {
    const core = events.filter((event) => CORE_NOTIFICATION_EVENTS.includes(event))
    if (core.length && core.length < events.length) {
      await send(core)
      return core
    }
    throw err
  }
}

/** Item IDs of every active fixed-price listing, newest pages first. */
async function getActiveItemIds(token, { maxPages = 10 } = {}) {
  const ids = []
  for (let page = 1; page <= maxPages; page += 1) {
    const doc = await call(token, 'GetMyeBaySelling', `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>`)
    const list = doc.ActiveList || {}
    for (const item of list.ItemArray?.Item || []) ids.push(String(item.ItemID))
    if (page >= Number(list.PaginationResult?.TotalNumberOfPages || 1)) break
  }
  return ids
}

/**
 * One line per active listing, from the GetMyeBaySelling pages alone (about one call per 200
 * listings): id, SKU, title, price, stock available and URL. Throws if any page fails, and
 * `complete` is true only when every page was read, so a partial read never looks like a full one.
 */
async function getActiveSummaries(token, { maxPages = 50 } = {}) {
  const items = []
  let totalPages = 1
  let page = 1
  for (; page <= Math.min(totalPages, maxPages); page += 1) {
    const doc = await call(token, 'GetMyeBaySelling', `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>`)
    const list = doc.ActiveList || {}
    totalPages = Number(list.PaginationResult?.TotalNumberOfPages || 1)
    for (const item of list.ItemArray?.Item || []) {
      const available = item.QuantityAvailable != null && item.QuantityAvailable !== ''
        ? Number(item.QuantityAvailable)
        : item.Quantity != null ? Number(item.Quantity) - Number(item.SellingStatus?.QuantitySold || 0) : NaN
      const price = Number(text(item.SellingStatus?.CurrentPrice) || text(item.BuyItNowPrice) || NaN)
      items.push({
        itemId: String(item.ItemID),
        sku: item.SKU && !/^none$/i.test(String(item.SKU).trim()) ? String(item.SKU).trim() : '',
        title: item.Title || '',
        price: Number.isFinite(price) && price > 0 ? price : NaN,
        stock: Number.isFinite(available) ? Math.max(0, available) : NaN,
        url: item.ListingDetails?.ViewItemURL || '',
        listingStatus: item.SellingStatus?.ListingStatus || 'Active',
      })
    }
  }
  return { items, complete: totalPages <= maxPages }
}

/** Full details of active listings (GetItem per listing), capped to keep a sync short. */
async function getActiveListings(token, { limit = 200 } = {}) {
  const ids = (await getActiveItemIds(token)).slice(0, limit)
  const items = []
  for (const id of ids) {
    const item = await getItem(token, id).catch(() => null)
    if (item) items.push(item)
  }
  return items
}

const templates = new Map()

/** Location, shipping and returns copied from one of the seller's live listings. */
async function listingTemplate(token, cacheKey) {
  const cached = templates.get(cacheKey)
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.value
  const [firstId] = await getActiveItemIds(token, { maxPages: 1 })
  if (!firstId) {
    throw new Error('eBay: add one listing in Seller Hub first. New listings copy its location, shipping and return settings.')
  }
  const { raw } = await getItem(token, firstId)
  const shipping = raw.ShippingDetails || {}
  const value = {
    country: raw.Country || 'US',
    location: raw.Location || '',
    postalCode: raw.PostalCode || '',
    dispatchTimeMax: raw.DispatchTimeMax || '3',
    shippingType: shipping.ShippingType || 'Flat',
    shippingOptions: (shipping.ShippingServiceOptions || []).map((option) => ({
      service: option.ShippingService,
      priority: option.ShippingServicePriority || '1',
      free: String(option.FreeShipping) === 'true',
      cost: text(option.ShippingServiceCost),
      additionalCost: text(option.ShippingServiceAdditionalCost),
    })),
    packageType: shipping.CalculatedShippingRate?.ShippingPackage || raw.ShippingPackageDetails?.ShippingPackage || '',
    returns: raw.ReturnPolicy || {},
  }
  templates.set(cacheKey, { at: Date.now(), value })
  return value
}

function shippingXml(template, product, opts) {
  const options = template.shippingOptions.map((option) => [
    '<ShippingServiceOptions>',
    `<ShippingServicePriority>${escapeXml(option.priority)}</ShippingServicePriority>`,
    `<ShippingService>${escapeXml(option.service)}</ShippingService>`,
    option.free ? '<FreeShipping>true</FreeShipping>' : '',
    template.shippingType !== 'Calculated' && option.cost !== '' ? `<ShippingServiceCost currencyID="USD">${escapeXml(option.cost)}</ShippingServiceCost>` : '',
    template.shippingType !== 'Calculated' && option.additionalCost !== '' ? `<ShippingServiceAdditionalCost currencyID="USD">${escapeXml(option.additionalCost)}</ShippingServiceAdditionalCost>` : '',
    '</ShippingServiceOptions>',
  ].join('')).join('')
  let xml = `<ShippingDetails><ShippingType>${escapeXml(template.shippingType)}</ShippingType>${options}</ShippingDetails>`
  if (/Calculated/i.test(template.shippingType)) {
    const pounds = Number(opts.weight || product.weight || 1)
    const dims = opts.dimensions || product.dimensions || {}
    xml += [
      '<ShippingPackageDetails><MeasurementUnit>English</MeasurementUnit>',
      `<PackageDepth unit="inches">${Number(dims.height || 5)}</PackageDepth>`,
      `<PackageLength unit="inches">${Number(dims.length || 10)}</PackageLength>`,
      `<PackageWidth unit="inches">${Number(dims.width || 10)}</PackageWidth>`,
      template.packageType ? `<ShippingPackage>${escapeXml(template.packageType)}</ShippingPackage>` : '',
      `<WeightMajor unit="lbs">${Math.floor(pounds)}</WeightMajor>`,
      `<WeightMinor unit="oz">${Math.round((pounds % 1) * 16)}</WeightMinor>`,
      '</ShippingPackageDetails>',
    ].join('')
  }
  return xml
}

function returnsXml(returns) {
  const accepted = returns.ReturnsAcceptedOption || 'ReturnsNotAccepted'
  if (accepted === 'ReturnsNotAccepted') return '<ReturnPolicy><ReturnsAcceptedOption>ReturnsNotAccepted</ReturnsAcceptedOption></ReturnPolicy>'
  return [
    '<ReturnPolicy>',
    `<ReturnsAcceptedOption>${escapeXml(accepted)}</ReturnsAcceptedOption>`,
    returns.RefundOption ? `<RefundOption>${escapeXml(returns.RefundOption)}</RefundOption>` : '',
    returns.ReturnsWithinOption ? `<ReturnsWithinOption>${escapeXml(returns.ReturnsWithinOption)}</ReturnsWithinOption>` : '',
    returns.ShippingCostPaidByOption ? `<ShippingCostPaidByOption>${escapeXml(returns.ShippingCostPaidByOption)}</ShippingCostPaidByOption>` : '',
    '</ReturnPolicy>',
  ].join('')
}

function specificsXml(aspects, excludeNames = new Set()) {
  const rows = Object.entries(aspects || {})
    .filter(([name]) => !excludeNames.has(String(name).trim().toLowerCase()))
    .map(([name, value]) => [String(name).trim(), (Array.isArray(value) ? value : [value]).map((v) => String(v ?? '').trim()).filter(Boolean)])
    .filter(([name, values]) => name && values.length)
  if (!rows.length) return ''
  return `<ItemSpecifics>${rows.map(([name, values]) => `<NameValueList><Name>${escapeXml(name)}</Name>${values.map((v) => `<Value>${escapeXml(v)}</Value>`).join('')}</NameValueList>`).join('')}</ItemSpecifics>`
}

function productListingDetailsXml({ identifierCode, brand, mpn, includeIdentifier = true }) {
  const parts = []
  if (includeIdentifier) {
    const id = validateEbayIdentifier(identifierCode)
    if (id) parts.push(`<${id.tag}>${escapeXml(id.value)}</${id.tag}>`)
  }
  const cleanMpn = String(mpn || '').trim()
  if (cleanMpn) {
    const cleanBrand = String(brand || 'Unbranded').trim() || 'Unbranded'
    parts.push(`<BrandMPN><Brand>${escapeXml(cleanBrand)}</Brand><MPN>${escapeXml(cleanMpn)}</MPN></BrandMPN>`)
  }
  return parts.length ? `<ProductListingDetails>${parts.join('')}</ProductListingDetails>` : ''
}

function bestOfferXml(bestOffer, minPrice) {
  if (!bestOffer?.enabled) return { bestOfferXml: '', listingDetailsXml: '' }
  const autoAccept = bestOffer.autoAcceptPrice !== '' && bestOffer.autoAcceptPrice != null
    ? Number(bestOffer.autoAcceptPrice)
    : null
  const minOffer = bestOffer.minOfferPrice !== '' && bestOffer.minOfferPrice != null
    ? Number(bestOffer.minOfferPrice)
    : null
  if (autoAccept != null && Number.isFinite(autoAccept)) {
    if (!(autoAccept > 0 && autoAccept < minPrice)) {
      throw new Error(`Best Offer auto-accept price must be between $0.01 and less than $${minPrice.toFixed(2)}.`)
    }
  }
  if (minOffer != null && Number.isFinite(minOffer)) {
    if (!(minOffer > 0 && minOffer < minPrice)) {
      throw new Error(`Minimum Best Offer price must be between $0.01 and less than $${minPrice.toFixed(2)}.`)
    }
  }
  if (autoAccept != null && minOffer != null && Number.isFinite(autoAccept) && Number.isFinite(minOffer) && minOffer >= autoAccept) {
    throw new Error('Minimum Best Offer price must be less than the Best Offer auto-accept price.')
  }
  const ldParts = []
  if (autoAccept != null && Number.isFinite(autoAccept) && autoAccept > 0) {
    ldParts.push(`<BestOfferAutoAcceptPrice currencyID="USD">${autoAccept.toFixed(2)}</BestOfferAutoAcceptPrice>`)
  }
  if (minOffer != null && Number.isFinite(minOffer) && minOffer > 0) {
    ldParts.push(`<MinimumBestOfferPrice currencyID="USD">${minOffer.toFixed(2)}</MinimumBestOfferPrice>`)
  }
  return {
    bestOfferXml: '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>',
    listingDetailsXml: ldParts.length ? `<ListingDetails>${ldParts.join('')}</ListingDetails>` : '',
  }
}

async function variationsXml(rawVariants, baseSku = 'EBAY') {
  if (!Array.isArray(rawVariants) || !rawVariants.length) return null
  if (rawVariants.length > 250) {
    throw new Error('eBay supports at most 250 variations per multi-variation listing.')
  }
  const firstKeys = Object.keys(rawVariants[0]?.options || {}).map((k) => String(k).trim()).filter(Boolean)
  const allKeys = [...new Set(rawVariants.flatMap((v) => Object.keys(v?.options || {}).map((k) => String(k).trim()).filter(Boolean)))]
  const optionNames = firstKeys.length === allKeys.length ? firstKeys : allKeys

  if (optionNames.length < 1 || optionNames.length > 5) {
    throw new Error('eBay multi-variation listings must have 1 to 5 variation option types (e.g. Color, Size).')
  }
  for (const name of optionNames) {
    if (name.length > 40) throw new Error(`eBay variation option name "${name}" must be 40 characters or less.`)
  }

  const valuesByOption = new Map(optionNames.map((n) => [n, []]))
  const seenCombos = new Set()
  const usedSkus = new Set()
  const rawVal0Images = new Map()
  const normalizedVariants = []
  const cleanBase = String(baseSku || 'EBAY').trim().replace(/\s+/g, '-').slice(0, 42) || 'EBAY'

  for (let i = 0; i < rawVariants.length; i += 1) {
    const v = rawVariants[i] || {}
    const vPrice = Number(v.price)
    if (!(vPrice > 0)) throw new Error(`Variation ${i + 1}: price must be greater than 0.`)
    const vQty = Math.floor(Number(v.stock ?? 0))
    if (!(vQty >= 1)) throw new Error(`Variation ${i + 1}: stock must be at least 1.`)
    const idObj = validateEbayIdentifier(v.identifierCode)

    let vSku = String(v.sku || `${cleanBase}-${i + 1}`).trim().replace(/\s+/g, '-').slice(0, 50)
    if (!vSku || usedSkus.has(vSku)) {
      const suffix = `-${i + 1}`
      vSku = `${(vSku || cleanBase).slice(0, 50 - suffix.length)}${suffix}`
      let n = i + 2
      while (usedSkus.has(vSku)) {
        const s = `-${n++}`
        vSku = `${(vSku || cleanBase).slice(0, 50 - s.length)}${s}`
      }
    }
    usedSkus.add(vSku)

    const optEntries = []
    for (const name of optionNames) {
      const val = String(v.options?.[name] ?? '').trim()
      if (!val) throw new Error(`Variation ${i + 1} is missing a value for "${name}".`)
      if (val.length > 50) throw new Error(`Variation value "${val}" must be 50 characters or less.`)
      const arr = valuesByOption.get(name)
      if (!arr.includes(val)) {
        if (arr.length >= 50) throw new Error(`eBay supports at most 50 unique values for "${name}".`)
        arr.push(val)
      }
      optEntries.push([name, val])
    }
    const comboKey = optEntries.map(([, val]) => val.toLowerCase()).join('\u0000')
    if (seenCombos.has(comboKey)) {
      throw new Error(`Duplicate eBay variation combination: ${optEntries.map(([, val]) => val).join(' / ')}.`)
    }
    seenCombos.add(comboKey)

    const val0 = optEntries[0][1]
    const imgUrl = String(v.image || '').trim()
    if (imgUrl && !rawVal0Images.has(val0)) rawVal0Images.set(val0, imgUrl)

    normalizedVariants.push({
      ...v,
      sku: vSku,
      price: vPrice,
      stock: vQty,
      options: Object.fromEntries(optEntries),
      ...(idObj ? { identifierCode: { type: idObj.tag, code: idObj.value } } : {}),
      idObj,
    })
  }

  // Filter primary option images via eBay 500px / HTTPS compliance helper
  const pictureSetsXml = []
  if (rawVal0Images.size > 0) {
    const entries = [...rawVal0Images.entries()]
    const filtered = await filterEbayCompliantImages(entries.map(([, url]) => url))
    const allowed = new Set(filtered)
    for (const [val0, url] of entries) {
      const matchUrl = allowed.has(url) ? url : filtered.find((u) => u === url)
      if (matchUrl) {
        pictureSetsXml.push(
          `<VariationSpecificPictureSet><VariationSpecificValue>${escapeXml(val0)}</VariationSpecificValue><PictureURL>${escapeXml(matchUrl)}</PictureURL></VariationSpecificPictureSet>`,
        )
      }
    }
  }

  const setXml = optionNames.map((name) => {
    const vals = valuesByOption.get(name)
    return `<NameValueList><Name>${escapeXml(name)}</Name>${vals.map((val) => `<Value>${escapeXml(val)}</Value>`).join('')}</NameValueList>`
  }).join('')

  const picturesXml = pictureSetsXml.length
    ? `<Pictures><VariationSpecificName>${escapeXml(optionNames[0])}</VariationSpecificName>${pictureSetsXml.join('')}</Pictures>`
    : ''

  const variationNodes = normalizedVariants.map((v) => {
    const specifics = Object.entries(v.options)
      .map(([name, val]) => `<NameValueList><Name>${escapeXml(name)}</Name><Value>${escapeXml(val)}</Value></NameValueList>`)
      .join('')
    const vpld = v.idObj
      ? `<VariationProductListingDetails><${v.idObj.tag}>${escapeXml(v.idObj.value)}</${v.idObj.tag}></VariationProductListingDetails>`
      : ''
    return [
      '<Variation>',
      `<SKU>${escapeXml(v.sku)}</SKU>`,
      `<StartPrice currencyID="USD">${v.price.toFixed(2)}</StartPrice>`,
      `<Quantity>${v.stock}</Quantity>`,
      `<VariationSpecifics>${specifics}</VariationSpecifics>`,
      vpld,
      '</Variation>',
    ].join('')
  }).join('')

  const minPrice = Math.min(...normalizedVariants.map((v) => v.price))
  const totalStock = normalizedVariants.reduce((sum, v) => sum + v.stock, 0)
  return {
    xml: `<Variations><VariationSpecificsSet>${setXml}</VariationSpecificsSet>${picturesXml}${variationNodes}</Variations>`,
    optionNames,
    minPrice,
    totalStock,
    normalizedVariants: normalizedVariants.map(({ idObj, ...rest }) => rest),
  }
}

/**
 * Publishes a fixed-price GTC listing (single-SKU or multi-variation).
 * `verifyOnly` runs eBay's checks without listing it.
 * Returns `{ itemId, variants? }`.
 */
async function addListing(token, product, opts = {}) {
  const rawImages = opts.images?.length ? opts.images : (product.images || [])
  const images = await filterEbayCompliantImages(rawImages)
  if (!images.length) {
    throw new Error('eBay requires pictures to be at least 500 pixels on the longest side. None of the provided image(s) met this requirement. Please upload a higher resolution image.')
  }
  if (!opts.categoryId) throw new Error('eBay could not suggest a category for this title. Pick one and try again.')

  const rawVariants = Array.isArray(opts.variants)
    ? opts.variants
    : (Array.isArray(product.variants) ? product.variants : [])
  const hasVariants = rawVariants.length > 0

  let varResult = null
  let price = 0
  let quantity = 0
  let singleIdCode = null
  if (hasVariants) {
    varResult = await variationsXml(rawVariants, opts.sellerSku || product.sku)
    price = varResult.minPrice
    quantity = varResult.totalStock
  } else {
    quantity = Math.floor(Number(opts.stock ?? product.stock ?? 0))
    if (!(quantity > 0)) throw new Error('Set stock to at least 1 before listing on eBay.')
    price = Number(opts.price ?? product.basePrice)
    if (!(price > 0)) throw new Error('Set a price above 0 before listing on eBay.')
    singleIdCode = opts.identifierCode !== undefined ? opts.identifierCode : product.identifierCode
  }

  const template = await listingTemplate(token, opts.cacheKey || 'default')
  const title = String(opts.title || product.title || '').slice(0, 80)
  const subtitle = String(opts.subtitle ?? product.subtitle ?? '').trim().slice(0, 55)
  const brand = String(opts.brand || product.brand || 'Unbranded').trim() || 'Unbranded'
  const mpn = String(opts.mpn ?? product.mpn ?? '').trim()
  const conditionId = resolveConditionId(opts.condition || product.condition || 'NEW')
  const rawCondDesc = String(opts.conditionDescription ?? product.conditionDescription ?? '').trim().slice(0, 1000)
  const conditionDescription = conditionId >= 1500 ? rawCondDesc : ''
  const rawDispatch = opts.dispatchTimeMax ?? product.dispatchTimeMax ?? template.dispatchTimeMax ?? '3'
  const dispatchTimeMax = Number.isFinite(Number(rawDispatch)) && String(rawDispatch).trim() !== ''
    ? String(Math.min(30, Math.max(0, Math.floor(Number(rawDispatch)))))
    : String(template.dispatchTimeMax || '3')

  const bestOfferInput = opts.bestOffer !== undefined ? opts.bestOffer : product.bestOffer
  const { bestOfferXml: boXml, listingDetailsXml: ldXml } = bestOfferXml(bestOfferInput, price)

  const aspects = {
    Brand: brand,
    ...(mpn ? { MPN: mpn } : {}),
    ...opts.aspects,
  }
  const excludeSpecifics = new Set((varResult?.optionNames || []).map((n) => n.toLowerCase()))
  const pldXml = productListingDetailsXml({
    identifierCode: singleIdCode,
    brand,
    mpn,
    includeIdentifier: !hasVariants,
  })
  const skuValue = String(opts.sellerSku || product.sku || '').trim()

  const item = [
    '<Item>',
    `<Title>${escapeXml(title)}</Title>`,
    subtitle ? `<SubTitle>${escapeXml(subtitle)}</SubTitle>` : '',
    `<Description>${cdata(opts.description || product.description || title)}</Description>`,
    `<PrimaryCategory><CategoryID>${escapeXml(opts.categoryId)}</CategoryID></PrimaryCategory>`,
    '<CategoryMappingAllowed>true</CategoryMappingAllowed>',
    !hasVariants ? `<StartPrice currencyID="USD">${price.toFixed(2)}</StartPrice>` : '',
    opts.conditionEnabled !== 'Disabled' ? `<ConditionID>${conditionId}</ConditionID>` : '',
    conditionDescription ? `<ConditionDescription>${escapeXml(conditionDescription)}</ConditionDescription>` : '',
    `<Country>${escapeXml(template.country)}</Country>`,
    '<Currency>USD</Currency>',
    template.location ? `<Location>${escapeXml(template.location)}</Location>` : '',
    template.postalCode ? `<PostalCode>${escapeXml(template.postalCode)}</PostalCode>` : '',
    `<DispatchTimeMax>${escapeXml(dispatchTimeMax)}</DispatchTimeMax>`,
    '<ListingDuration>GTC</ListingDuration>',
    '<ListingType>FixedPriceItem</ListingType>',
    !hasVariants ? `<Quantity>${quantity}</Quantity>` : '',
    !hasVariants && skuValue ? `<SKU>${escapeXml(skuValue)}</SKU>` : '',
    `<PictureDetails>${images.map((url) => `<PictureURL>${escapeXml(url)}</PictureURL>`).join('')}</PictureDetails>`,
    pldXml,
    specificsXml(aspects, excludeSpecifics),
    boXml,
    ldXml,
    varResult ? varResult.xml : '',
    shippingXml(template, product, opts),
    returnsXml(template.returns),
    '</Item>',
  ].join('')
  const doc = await call(token, opts.verifyOnly ? 'VerifyAddFixedPriceItem' : 'AddFixedPriceItem', item)
  return {
    itemId: doc.ItemID ? String(doc.ItemID) : null,
    ...(varResult ? { variants: varResult.normalizedVariants } : {}),
  }
}

/** Fast SKU-level price/quantity updates for multi-variation or SKU-tracked listings (max 4 per call). */
async function reviseInventoryStatus(token, itemId, updates = []) {
  const rows = (updates || []).filter((u) => u && u.sku && (u.quantity != null || u.price != null))
  for (let i = 0; i < rows.length; i += 4) {
    const chunk = rows.slice(i, i + 4)
    const inner = chunk.map((u) => [
      '<InventoryStatus>',
      `<ItemID>${escapeXml(itemId)}</ItemID>`,
      `<SKU>${escapeXml(u.sku)}</SKU>`,
      u.price != null && Number(u.price) > 0 ? `<StartPrice currencyID="USD">${Number(u.price).toFixed(2)}</StartPrice>` : '',
      u.quantity != null ? `<Quantity>${Math.max(0, Math.floor(Number(u.quantity)))}</Quantity>` : '',
      '</InventoryStatus>',
    ].join('')).join('')
    await call(token, 'ReviseInventoryStatus', inner)
  }
  return { success: true }
}

/**
 * Revises a live listing. Only the fields given are changed. `quantity` is the stock available
 * to buy: eBay treats Quantity in a revise request as the available quantity and adds the units
 * already sold itself (GetItem then returns available + sold). Adding the sold count here too
 * inflated eBay's stock by every past sale.
 */
async function reviseListing(token, itemId, changes = {}) {
  const { title, description, price, quantity, images, subtitle, conditionDescription } = changes
  let compliantImages = []
  if (images && images.length) {
    compliantImages = await filterEbayCompliantImages(images)
  }

  const variants = Array.isArray(changes.variants) ? changes.variants : []
  const isVariantRevision = variants.length > 0 && Boolean(
    changes.variantSku || changes.variantStocks || changes.variantPrices || changes.syncAllVariants || changes.useVariantPrices || quantity != null || price != null,
  )

  if (isVariantRevision) {
    let skuUpdates = []
    if (changes.variantSku) {
      const target = variants.find((v) => v.sku === changes.variantSku)
      if (!target?.sku) throw new Error(`Variant "${changes.variantSku}" has no eBay SKU. Sync listings first.`)
      skuUpdates = [{
        sku: target.sku,
        quantity: Math.max(0, Math.floor(Number(changes.variantStock ?? quantity ?? target.stock ?? 0))),
      }]
    } else {
      const withSku = variants.filter((v) => v.sku)
      if (!withSku.length) throw new Error('eBay multi-variation updates require variant SKUs. Sync listings first.')
      const updateQty = Boolean(changes.variantStocks || changes.syncAllVariants || quantity != null)
      const updatePrice = Boolean(changes.variantPrices || changes.useVariantPrices || price != null)
      skuUpdates = withSku.map((v) => {
        const nextQty = Number(quantity) === 0 ? 0 : Math.max(0, Math.floor(Number(v.stock) || 0))
        const nextPrice = (changes.useVariantPrices || changes.variantPrices) ? Number(v.price) : Number(price ?? v.price)
        return {
          sku: v.sku,
          ...(updateQty ? { quantity: nextQty } : {}),
          ...(updatePrice && Number.isFinite(nextPrice) && nextPrice > 0 ? { price: nextPrice } : {}),
        }
      })
    }
    if (skuUpdates.length) {
      await reviseInventoryStatus(token, itemId, skuUpdates)
    }

    const itemParts = [
      `<ItemID>${escapeXml(itemId)}</ItemID>`,
      title ? `<Title>${escapeXml(String(title).slice(0, 80))}</Title>` : '',
      subtitle !== undefined ? `<SubTitle>${escapeXml(String(subtitle || '').slice(0, 55))}</SubTitle>` : '',
      description ? `<Description>${cdata(description)}</Description>` : '',
      conditionDescription !== undefined ? `<ConditionDescription>${escapeXml(String(conditionDescription || '').slice(0, 1000))}</ConditionDescription>` : '',
      compliantImages.length ? `<PictureDetails>${compliantImages.map((url) => `<PictureURL>${escapeXml(url)}</PictureURL>`).join('')}</PictureDetails>` : '',
    ]
    if (itemParts.slice(1).some(Boolean)) {
      await call(token, 'ReviseFixedPriceItem', `<Item>${itemParts.join('')}</Item>`)
    }
    return { success: true }
  }

  const normalizedQty = quantity != null ? Math.max(0, Math.floor(Number(quantity))) : null
  const nonQtyParts = [
    `<ItemID>${escapeXml(itemId)}</ItemID>`,
    title ? `<Title>${escapeXml(String(title).slice(0, 80))}</Title>` : '',
    subtitle !== undefined ? `<SubTitle>${escapeXml(String(subtitle || '').slice(0, 55))}</SubTitle>` : '',
    description ? `<Description>${cdata(description)}</Description>` : '',
    conditionDescription !== undefined ? `<ConditionDescription>${escapeXml(String(conditionDescription || '').slice(0, 1000))}</ConditionDescription>` : '',
    price != null ? `<StartPrice currencyID="USD">${Number(price).toFixed(2)}</StartPrice>` : '',
    compliantImages.length ? `<PictureDetails>${compliantImages.map((url) => `<PictureURL>${escapeXml(url)}</PictureURL>`).join('')}</PictureDetails>` : '',
  ]
  const qtyPart = normalizedQty != null ? `<Quantity>${normalizedQty}</Quantity>` : ''
  try {
    await call(token, 'ReviseFixedPriceItem', `<Item>${nonQtyParts.join('')}${qtyPart}</Item>`)
    return { success: true }
  } catch (err) {
    if (normalizedQty === 0 && /quantity|greater than 0|at least 1|out.?of.?stock/i.test(err.message || '')) {
      const hasOtherChanges = Boolean(title || description || price != null || compliantImages.length || subtitle !== undefined || conditionDescription !== undefined)
      if (hasOtherChanges) {
        await call(token, 'ReviseFixedPriceItem', `<Item>${nonQtyParts.join('')}</Item>`)
      }
      await endListing(token, itemId, 'NotAvailable')
      return { success: true, ended: true, status: 'ended', marketplaceStatus: 'Ended' }
    }
    throw err
  }
}

/** Ends a live listing. Buyers stop seeing it. */
async function endListing(token, itemId, reason = 'NotAvailable') {
  try {
    await call(token, 'EndFixedPriceItem', `<ItemID>${escapeXml(itemId)}</ItemID><EndingReason>${escapeXml(reason)}</EndingReason>`)
  } catch (err) {
    if (/has ended|already ended|not active|does not exist/i.test(err.message)) {
      return { status: 'ended', marketplaceStatus: 'Ended' }
    }
    throw err
  }
  return { status: 'ended', marketplaceStatus: 'Ended' }
}

/** Puts an ended listing back on eBay. A restock can send the new quantity. May return a new item id. */
async function relistListing(token, itemId, { quantity, price, title, description } = {}) {
  const parts = [
    `<ItemID>${escapeXml(itemId)}</ItemID>`,
    quantity != null ? `<Quantity>${Math.max(1, Math.floor(Number(quantity)))}</Quantity>` : '',
    price != null ? `<StartPrice currencyID="USD">${Number(price).toFixed(2)}</StartPrice>` : '',
    title ? `<Title>${escapeXml(String(title).slice(0, 80))}</Title>` : '',
    description ? `<Description>${cdata(description)}</Description>` : '',
  ]
  const doc = await call(token, 'RelistFixedPriceItem', `<Item>${parts.join('')}</Item>`)
  return { status: 'live', externalListingId: doc.ItemID ? String(doc.ItemID) : itemId }
}

const asList = (value) => (value == null ? [] : Array.isArray(value) ? value : [value])

/** Active Best Offers buyers made on the seller's listings, one entry per offer. */
async function getBestOffers(token) {
  const doc = await call(token, 'GetBestOffers', '<BestOfferStatus>Active</BestOfferStatus><DetailLevel>ReturnAll</DetailLevel>')
  const groups = doc.ItemBestOffersArray
    ? asList(doc.ItemBestOffersArray.ItemBestOffers)
    : [{ Item: doc.Item, BestOfferArray: doc.BestOfferArray }]
  return groups.flatMap((group) => {
    const item = asList(group.Item)[0] || {}
    return asList(group.BestOfferArray?.BestOffer).map((offer) => ({
      itemId: String(text(item.ItemID)),
      title: String(text(item.Title) || ''),
      offerId: String(text(offer.BestOfferID)),
      buyer: String(text(offer.Buyer?.UserID) || ''),
      price: { value: Number(text(offer.Price)), currency: offer.Price?.['@currencyID'] || 'USD' },
      quantity: Number(text(offer.Quantity) || 1),
      expires: text(offer.ExpirationTime) || null,
      message: String(text(offer.BuyerMessage) || ''),
      status: String(text(offer.Status) || ''),
    }))
  })
}

/** Accepts, declines or counters one Best Offer. A counter needs a positive price. */
async function respondToBestOffer(token, { itemId, offerId, action, counterPrice, quantity = 1, currency = 'USD' }) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }) }
  if (!itemId || !offerId) fail('itemId and offerId are required')
  if (!['Accept', 'Decline', 'Counter'].includes(action)) fail(`Unknown Best Offer action ${action}`)
  const price = Number(counterPrice)
  if (action === 'Counter' && !(Number.isFinite(price) && price > 0)) fail('Enter a counter price above 0.')
  const parts = [
    `<ItemID>${escapeXml(itemId)}</ItemID>`,
    `<BestOfferID>${escapeXml(offerId)}</BestOfferID>`,
    `<Action>${action}</Action>`,
    action === 'Counter' ? `<CounterOfferPrice currencyID="${escapeXml(currency)}">${price.toFixed(2)}</CounterOfferPrice><CounterOfferQuantity>${Math.max(1, Math.floor(Number(quantity)) || 1)}</CounterOfferQuantity>` : '',
  ]
  return call(token, 'RespondToBestOffer', parts.join(''))
}

module.exports = {
  getBestOffers,
  respondToBestOffer,
  getUser,
  setNotificationPreferences,
  getItem,
  parseItem,
  getCategoryFeatures,
  resolveConditionId,
  validateEbayIdentifier,
  getActiveItemIds,
  getActiveSummaries,
  getActiveListings,
  addListing,
  reviseInventoryStatus,
  reviseListing,
  endListing,
  relistListing,
}
