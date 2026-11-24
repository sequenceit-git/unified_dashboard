/**
 * eBay hands back some descriptions as a whole web page (<html><head><link…><title>eBay</title>…
 * <body>…), e.g. listings made with eBay's own description editor. The dashboard keeps only the
 * description itself: what is inside <body>, without scripts or page-level tags. Styles in the
 * body stay. A plain fragment or text is returned unchanged.
 */
function cleanDescription(html) {
  let s = String(html ?? '')
  if (!/<(!doctype|html|head|body)\b/i.test(s)) return s.trim()
  const body = s.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)
  if (body) s = body[1]
  else s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '')
  return s
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?(html|head|body)\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '')
    .replace(/<(link|meta)\b[^>]*>/gi, '')
    .trim()
}

module.exports = { cleanDescription }
