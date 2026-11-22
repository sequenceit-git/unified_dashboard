const dns = require('dns').promises
const net = require('net')

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const lower = ip.toLowerCase()
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('::ffff:')
}

/** Only public http(s) pages; the server must not be pointed at its own network. */
async function checkUrl(raw) {
  let url
  try {
    url = new URL(String(raw || '').trim())
  } catch {
    throw new Error('Enter a full product link, starting with https://')
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https links are supported.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('That link points to a private address.')
  if (net.isIP(host)) {
    if (privateAddress(host)) throw new Error('That link points to a private address.')
    return url
  }
  const addresses = await dns.lookup(host, { all: true }).catch(() => [])
  if (!addresses.length) throw new Error(`Could not find the website ${url.hostname}.`)
  if (addresses.some(({ address }) => privateAddress(address))) throw new Error('That link points to a private address.')
  return url
}

/** Fetches a validated public http(s) URL while re-checking every redirect target against SSRF. */
async function safeFetch(rawUrl, options = {}, { maxHops = 5 } = {}) {
  let current = await checkUrl(rawUrl)
  let res
  for (let hop = 0; hop <= maxHops; hop += 1) {
    res = await fetch(current.href, { ...options, redirect: 'manual' })
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!location) return { response: res, url: current }
    if (hop === maxHops) throw new Error('Too many redirects.')
    current = await checkUrl(new URL(location, current).href)
  }
  return { response: res, url: current }
}

module.exports = { privateAddress, checkUrl, safeFetch }
