// Builds docs/api-coverage/catalog/ebay.json from eBay's official OpenAPI contracts (download each
// <api>_oas3.json from https://developer.ebay.com/api-docs/master/<group>/<api>/openapi/3/), the Trading
// API WSDL and the Post-Order API reference. usage: node build_ebay_catalog.js <oasDir> <outFile>
const fs = require('fs')
const path = require('path')
const [dir, out] = process.argv.slice(2)
const OAS_BASE = 'https://developer.ebay.com/api-docs/master'
const endpoints = []
const sources = []
const firstSentence = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0].slice(0, 220)
const contractUrl = (file) => {
  const m = file.match(/^(sell|commerce|buy)_([a-z]+)_(v\d+(?:_beta)?)_oas3\.json$/)
  const sub = m[1] === 'sell' && m[2] === 'account' && m[3] === 'v2' ? 'sell/account/v2' : `${m[1]}/${m[2]}`
  return `${OAS_BASE}/${sub}/openapi/3/${file}`
}
const BUY_USED = new Set(['getItemByLegacyId', 'search'])
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('_oas3.json')).sort()) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
  const server = spec.servers?.[0]
  // servers[0].url is e.g. https://api.ebay.com{basePath}: fill the variables in before dropping the host.
  let url = String(server?.url || '')
  for (const [name, v] of Object.entries(server?.variables || {})) url = url.replace(`{${name}}`, v.default || '')
  const base = url.replace(/^https?:\/\/[^/]+/, '')
  const isBuy = file.startsWith('buy_')
  sources.push(contractUrl(file))
  for (const [p, ops] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(ops)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
      if (isBuy && !BUY_USED.has(op.operationId)) continue
      const scopes = (op.security || spec.security || []).flatMap((s) => Object.values(s).flat())
      endpoints.push({
        id: `${method.toUpperCase()} ${(base + p).replace(/\/+$/, '')}`,
        group: spec.info?.title || file,
        name: op.operationId || `${method} ${p}`,
        summary: (firstSentence(op.summary) || firstSentence(op.description) || op.operationId) + (op.deprecated ? ' (deprecated)' : ''),
        scope: scopes[0] || '',
        sellerFacing: !isBuy,
        confirmed: true,
      })
    }
  }
}
// Trading API (XML): every operation in the official WSDL.
const wsdl = fs.readFileSync(path.join(dir, 'ebaySvc.wsdl'), 'utf8')
const portType = wsdl.slice(wsdl.indexOf('<wsdl:portType'), wsdl.indexOf('</wsdl:portType>'))
const BUYER_ONLY = new Set(['PlaceOffer', 'GetMyeBayBuying', 'GetBidderList', 'AddToWatchList', 'RemoveFromWatchList', 'SetUserNotes', 'GetUserContactDetails'])
for (const m of portType.matchAll(/<wsdl:operation name="([A-Za-z]+)">([\s\S]*?)<\/wsdl:operation>/g)) {
  const doc = (m[2].match(/<wsdl:documentation>([\s\S]*?)<\/wsdl:documentation>/) || [])[1]
  endpoints.push({ id: `Trading:${m[1]}`, group: 'Trading API', name: m[1], summary: firstSentence(doc) || m[1], scope: '', sellerFacing: !BUYER_ONLY.has(m[1]), confirmed: true })
}
sources.push('https://developer.ebay.com/webservices/latest/ebaySvc.wsdl', 'https://developer.ebay.com/devzone/xml/docs/reference/ebay/index.html')
// Called by the dashboard but absent from the current WSDL: kept, flagged as retired.
for (const name of ['GetCategoryFeatures']) {
  if (!endpoints.some((e) => e.id === `Trading:${name}`)) endpoints.push({ id: `Trading:${name}`, group: 'Trading API', name, summary: 'Retired: not in the current Trading API WSDL, yet still called by the dashboard.', scope: '', sellerFacing: true, confirmed: true, retired: true })
}
// Post-Order API v2 (no published OpenAPI contract): from the official call reference.
const PO = [
  ['POST', 'cancellation/{cancelId}/approve', 'approveCancellationRequest', 'Seller agrees to a buyer cancellation request.'],
  ['POST', 'cancellation/check_eligibility', 'checkCancellationEligibility', 'Checks whether an order can be cancelled.'],
  ['POST', 'cancellation', 'createCancellation', 'Requests or performs an order cancellation.'],
  ['GET', 'cancellation/{cancelId}', 'getCancellation', 'Returns details of a cancellation request.'],
  ['POST', 'cancellation/{cancelId}/reject', 'rejectCancellationRequest', 'Seller declines a cancellation request.'],
  ['GET', 'cancellation/search', 'searchCancellations', 'Searches cancellations.'],
  ['POST', 'casemanagement/{caseId}/appeal', 'appealCaseDecision', 'Appeals a case decision.'],
  ['GET', 'casemanagement/{caseId}', 'getCase', 'Returns details of one case.'],
  ['GET', 'casemanagement/search', 'searchCases', 'Searches cases.'],
  ['POST', 'inquiry/{inquiryId}/escalate', 'escalateInquiry', 'Escalates an inquiry to an item-not-received case.'],
  ['GET', 'inquiry/{inquiryId}', 'getInquiry', 'Returns the history and details of an inquiry.'],
  ['POST', 'inquiry/{inquiryId}/issue_refund', 'issueInquiryRefund', 'Refunds a line item in an item-not-received inquiry.'],
  ['POST', 'inquiry/{inquiryId}/provide_shipment_info', 'provideInquiryShipmentInfo', 'Supplies shipment information for an inquiry.'],
  ['GET', 'inquiry/search', 'searchInquiries', 'Searches inquiries.'],
  ['POST', 'inquiry/{inquiryId}/send_message', 'sendInquiryMessage', 'Messages the buyer about an inquiry.'],
  ['POST', 'return/{returnId}/add_shipping_label', 'addShippingLabelInfo', 'Adds a seller-provided return shipping label.'],
  ['POST', 'return', 'createReturnRequest', 'Requests a return for an item.'],
  ['POST', 'return/{returnId}/escalate', 'escalateReturn', 'Escalates a return request into a case.'],
  ['GET', 'return/{returnId}', 'getReturn', 'Returns details of a return request.'],
  ['GET', 'return/{returnId}/files', 'getReturnFiles', 'Returns the files attached to a return request.'],
  ['GET', 'return/preference', 'getReturnPreferences', "Returns the seller's return preferences."],
  ['GET', 'return/{returnId}/tracking', 'getShipmentTrackingInfo', 'Returns tracking for a returned item.'],
  ['POST', 'return/{returnId}/issue_refund', 'issueReturnRefund', 'Issues a refund for a returned item.'],
  ['POST', 'return/{returnId}/mark_as_received', 'markReturnReceived', 'Marks a returned item as received.'],
  ['POST', 'return/{returnId}/decide', 'processReturnRequest', 'Approves, declines or otherwise acts on a return request.'],
  ['GET', 'return/search', 'searchReturns', 'Searches return requests.'],
  ['POST', 'return/{returnId}/send_message', 'sendReturnMessage', 'Messages the buyer about a return.'],
  ['POST', 'return/preference', 'setReturnPreferences', "Sets the seller's return preferences."],
  ['POST', 'return/{returnId}/file/upload', 'uploadReturnFile', 'Uploads files for a return request.'],
]
for (const [method, p, name, summary] of PO) endpoints.push({ id: `${method} /post-order/v2/${p}`, group: 'Post-Order API', name, summary, scope: '', sellerFacing: true, confirmed: true })
sources.push('https://developer.ebay.com/devzone/post-order/index.html')
// OAuth token endpoint (not part of any REST contract).
endpoints.push({ id: 'POST /identity/v1/oauth2/token', group: 'OAuth', name: 'getToken', summary: 'Mints application and user access tokens and refreshes them.', scope: '', sellerFacing: true, confirmed: true })
sources.push('https://developer.ebay.com/api-docs/static/oauth-tokens.html')
// The same path+method can appear twice across versions/specs; keep the first.
const seen = new Set()
const unique = endpoints.filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify({ shop: 'ebay', sources, researchedAt: new Date().toISOString().slice(0, 10), notes: ['Sell Compliance API: eBay publishes no contract for it any more (retired); not listed.', 'Buy Browse: only the two methods the dashboard uses, as not for sellers.'], endpoints: unique }, null, 2)}\n`)
const by = {}
for (const e of unique) by[e.group] = (by[e.group] || 0) + 1
console.log(unique.length, 'endpoints'); console.log(by)
