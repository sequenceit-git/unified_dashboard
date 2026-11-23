/** Shared value helpers for this shop (moved from the service file). */


/** eBay notices arrive as full HTML emails; this keeps the readable text. */
function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Numeric eBay item ID; older dashboard records stored `item-<id>`. */
function ebayItemId(externalListingId) {
  const id = String(externalListingId || '').replace(/^(ebay-)?item-/, '')
  if (!/^\d{9,}$/.test(id)) {
    throw new Error('This product is not linked to a live eBay listing yet. Sync the shop or list it again.')
  }
  return id
}

module.exports = { htmlToText, ebayItemId }
