/**
 * Products are shared across shops; a sub-admin may only touch a product through shops they own.
 *   - not listed anywhere yet    -> only the sub-admin who created it sees and edits it (their draft)
 *   - no listing in their shops  -> they cannot see it (404)
 *   - also listed on other shops -> read-only for them, because an edit changes those shops too (403)
 */
const Listing = require('../models/Listing')
const Product = require('../models/Product')

const isMine = (doc, req) => Boolean(doc?.createdBy) && String(doc.createdBy) === String((req.authUser || req.user)._id || req.user.id)

/** Products this sub-admin created that are not listed on any shop yet: their drafts. */
async function ownDrafts(req, extra = {}) {
  const own = await Product.find({ createdBy: req.user.id, ...extra }).select('_id attributes.targetMarketplace').lean()
  if (!own.length) return []
  const listed = new Set((await Listing.distinct('productId', { productId: { $in: own.map((row) => row._id) } })).map(String))
  return own.filter((row) => !listed.has(String(row._id)))
}

async function productAccess(req, productId) {
  const user = req.authUser || req.user
  if (user.role !== 'sub_admin') return { ok: true, visible: true, mine: null, others: 0 }
  const listings = await Listing.find({ productId }).select('shopId')
  if (!listings.length) {
    const own = isMine(await Product.findById(productId).select('createdBy').lean(), req)
    return { ok: own, visible: own, mine: [], others: 0 }
  }
  const allowed = new Set((req.allowedShopIds || []).map(String))
  const mine = listings.filter((row) => allowed.has(String(row.shopId)))
  const others = listings.length - mine.length
  return { ok: mine.length > 0 && others === 0, visible: mine.length > 0, mine, others }
}

/** Sends the 404/403 and returns false when the sub-admin may not change this product. */
async function requireProductAccess(req, res, productId) {
  const access = await productAccess(req, productId)
  if (access.ok) return access
  if (!access.visible) {
    res.status(404).json({ error: 'Not found' })
  } else {
    res.status(403).json({ error: 'This product is also listed on shops outside your access, so only a super admin can change it.' })
  }
  return null
}

module.exports = { productAccess, requireProductAccess, ownDrafts }
