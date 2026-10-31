/**
 * eBay Trading API (XML). Listings made in Seller Hub exist only here — the Inventory API
 * cannot see them — so listing sync, publishing and revisions go through these calls.
 */

const { XMLParser } = require('fast-xml-parser')
const config = require('../../config/marketplaces').ebay

const LIST_TAGS = new Set(['Errors', 'PictureURL', 'NameValueList', 'Value', 'ShippingServiceOptions', 'ShipToLocations'])
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
  const doc = parser.parse(await response.text())[`${name}Response`] || {}
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
  const quantity = Number(item.Quantity || 0) - Number(item.SellingStatus?.QuantitySold || 0)
  return {
    itemId: String(item.ItemID),
    sku: item.SKU ? String(item.SKU) : '',
    title: item.Title || '',
    description: item.Description || '',
    price: Number(text(item.SellingStatus?.CurrentPrice) || text(item.StartPrice) || 0),
    stock: Math.max(0, quantity),
    images: (item.PictureDetails?.PictureURL || []).map(text).filter(Boolean),
    categoryId: item.PrimaryCategory?.CategoryID ? String(item.PrimaryCategory.CategoryID) : '',
    category: item.PrimaryCategory?.CategoryName || '',
    brand: specifics.Brand || '',
    specifics,
    listingStatus: item.SellingStatus?.ListingStatus || '',
    url: item.ListingDetails?.ViewItemURL || '',
  }
}

async function getItem(token, itemId) {
  const doc = await call(token, 'GetItem', `<ItemID>${escapeXml(itemId)}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics>`)
  return doc.Item ? { ...parseItem(doc.Item), raw: doc.Item } : null
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

function specificsXml(aspects) {
  const rows = Object.entries(aspects || {})
    .map(([name, value]) => [String(name).trim(), (Array.isArray(value) ? value : [value]).map((v) => String(v ?? '').trim()).filter(Boolean)])
    .filter(([name, values]) => name && values.length)
  if (!rows.length) return ''
  return `<ItemSpecifics>${rows.map(([name, values]) => `<NameValueList><Name>${escapeXml(name)}</Name>${values.map((v) => `<Value>${escapeXml(v)}</Value>`).join('')}</NameValueList>`).join('')}</ItemSpecifics>`
}

/**
 * Publishes a fixed-price GTC listing. `verifyOnly` runs eBay's checks without listing it.
 * Returns `{ itemId, fees }`.
 */
async function addListing(token, product, opts) {
  const images = (opts.images || []).filter((url) => /^https:\/\//i.test(url)).slice(0, 12)
  if (!images.length) throw new Error('eBay needs at least one product image with a public https link.')
  const quantity = Math.floor(Number(opts.stock ?? product.stock ?? 0))
  if (!(quantity > 0)) throw new Error('Set stock to at least 1 before listing on eBay.')
  const price = Number(opts.price ?? product.basePrice)
  if (!(price > 0)) throw new Error('Set a price above 0 before listing on eBay.')
  if (!opts.categoryId) throw new Error('eBay could not suggest a category for this title. Pick one and try again.')

  const template = await listingTemplate(token, opts.cacheKey || 'default')
  const title = String(opts.title || product.title || '').slice(0, 80)
  const aspects = { Brand: opts.brand || product.brand || 'Unbranded', ...(opts.aspects || {}) }
  const item = [
    '<Item>',
    `<Title>${escapeXml(title)}</Title>`,
    `<Description>${cdata(opts.description || product.description || title)}</Description>`,
    `<PrimaryCategory><CategoryID>${escapeXml(opts.categoryId)}</CategoryID></PrimaryCategory>`,
    '<CategoryMappingAllowed>true</CategoryMappingAllowed>',
    `<StartPrice currencyID="USD">${price.toFixed(2)}</StartPrice>`,
    `<ConditionID>${CONDITION_IDS[opts.condition] || 1000}</ConditionID>`,
    `<Country>${escapeXml(template.country)}</Country>`,
    '<Currency>USD</Currency>',
    template.location ? `<Location>${escapeXml(template.location)}</Location>` : '',
    template.postalCode ? `<PostalCode>${escapeXml(template.postalCode)}</PostalCode>` : '',
    `<DispatchTimeMax>${escapeXml(template.dispatchTimeMax)}</DispatchTimeMax>`,
    '<ListingDuration>GTC</ListingDuration>',
    '<ListingType>FixedPriceItem</ListingType>',
    `<Quantity>${quantity}</Quantity>`,
    product.sku ? `<SKU>${escapeXml(product.sku)}</SKU>` : '',
    `<PictureDetails>${images.map((url) => `<PictureURL>${escapeXml(url)}</PictureURL>`).join('')}</PictureDetails>`,
    specificsXml(aspects),
    shippingXml(template, product, opts),
    returnsXml(template.returns),
    '</Item>',
  ].join('')
  const doc = await call(token, opts.verifyOnly ? 'VerifyAddFixedPriceItem' : 'AddFixedPriceItem', item)
  return { itemId: doc.ItemID ? String(doc.ItemID) : null }
}

/** Revises a live listing. Only the fields given are changed. */
async function reviseListing(token, itemId, { title, description, price, quantity, images } = {}) {
  const parts = [
    `<ItemID>${escapeXml(itemId)}</ItemID>`,
    title ? `<Title>${escapeXml(String(title).slice(0, 80))}</Title>` : '',
    description ? `<Description>${cdata(description)}</Description>` : '',
    price != null ? `<StartPrice currencyID="USD">${Number(price).toFixed(2)}</StartPrice>` : '',
    quantity != null ? `<Quantity>${Math.max(0, Math.floor(Number(quantity)))}</Quantity>` : '',
    images?.length ? `<PictureDetails>${images.filter((url) => /^https:\/\//i.test(url)).slice(0, 12).map((url) => `<PictureURL>${escapeXml(url)}</PictureURL>`).join('')}</PictureDetails>` : '',
  ]
  await call(token, 'ReviseFixedPriceItem', `<Item>${parts.join('')}</Item>`)
  return { success: true }
}

/** Ends a live listing. Buyers stop seeing it. */
async function endListing(token, itemId, reason = 'NotAvailable') {
  await call(token, 'EndFixedPriceItem', `<ItemID>${escapeXml(itemId)}</ItemID><EndingReason>${escapeXml(reason)}</EndingReason>`)
  return { status: 'ended' }
}

/** Puts an ended listing back on eBay. May return a new item id. */
async function relistListing(token, itemId) {
  const doc = await call(token, 'RelistFixedPriceItem', `<Item><ItemID>${escapeXml(itemId)}</ItemID></Item>`)
  return { status: 'live', externalListingId: doc.ItemID ? String(doc.ItemID) : itemId }
}

module.exports = { getItem, getActiveItemIds, getActiveListings, addListing, reviseListing, endListing, relistListing }
