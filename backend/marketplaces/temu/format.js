/** Temu value helpers shared by orders and listings. */

const ORDER_STATUS = {
  1: 'pending',
  2: 'paid',
  3: 'cancelled',
  4: 'shipped',
  5: 'delivered',
}

/** Temu sends seconds or milliseconds. */
function temuDate(value) {
  const n = Number(value)
  if (!n) return new Date()
  return new Date(n > 1e12 ? n : n * 1000)
}

/** Buyer address from bg.order.shippinginfo.v2.get (regionName1-4 = country, state, city, district). */
function temuAddress(info) {
  if (!info || typeof info !== 'object') return undefined
  const street = [info.addressLine1, info.addressLine2, info.addressLine3].filter(Boolean).join(', ') || info.addressLineAll || ''
  const address = {
    street,
    city: info.regionName3 || '',
    state: info.regionName2 || '',
    zip: info.postCode || '',
    country: info.regionName1 || 'US',
  }
  return address.street || address.city || address.zip ? address : undefined
}

/** Temu money is either a number/string or `{ amount, currency }`. */
function temuMoney(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'object') return Number(value.amount) || 0
  return Number(value) || 0
}

module.exports = { ORDER_STATUS, temuDate, temuAddress, temuMoney }
