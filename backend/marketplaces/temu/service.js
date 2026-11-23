/** The Temu service singleton the shared core uses: client + order + listing methods on one object. */
const { TemuClient } = require('./client')
const orders = require('./orders')
const listings = require('./listings')

module.exports = Object.assign(new TemuClient(), orders, listings)
