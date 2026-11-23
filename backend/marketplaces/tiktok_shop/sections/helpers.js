/** Helpers shared by this shop's section files. */
const tiktok = require('../service')

const ttMoney = (value, currency) => (value != null && value !== '' ? { value: Number(value), currency: currency || 'USD' } : null)

const ttPost = (token, shop, path, body = {}, query = { page_size: 50 }) => tiktok.call(token, 'POST', path, { shop, query, body })

const ttGet = (token, shop, path, query) => tiktok.call(token, 'GET', path, { shop, query })

const ttRange = (days) => {
  const to = new Date()
  const from = new Date(to - days * 86400000)
  return { start_date_ge: from.toISOString().slice(0, 10), end_date_lt: to.toISOString().slice(0, 10) }
}

module.exports = { ttMoney, ttPost, ttGet, ttRange }
