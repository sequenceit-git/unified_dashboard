/** Generated from routes/system/shops.js: business logic behind the routes; routes only handle HTTP. */
const Shop = require('../../models/Shop')
const marketplaceManager = require('../marketplace/connection')
const config = require('../../config/marketplaces')
const registry = require('../../marketplaces')
const syncQueue = require('../../services/core/syncQueue')
const { HttpError } = require('../../utils/httpError')
const { canAccessShop, verifyOAuthState } = require('../../middleware/auth')

const { canonical: canonicalMarketplace } = registry
/** Default shop for the package routes: the first one whose API can fetch shipping documents. */

/**
 * Exchanges an OAuth code and saves the shop as connected. A reconnect updates the existing
 * shop in place (keeping its name), then queues a full sync and an API access check so the new
 * login's orders, listings and sections show up straight away.
 */
async function connectShop(marketplace, code, { shopName, externalShopId: requestedId } = {}) {
  const tokenData = await marketplaceManager.exchangeCode(marketplace, code)
  const existingMarketShop = tokenData.externalShopId
    ? null
    : await Shop.findOne({ marketplace }).select('externalShopId')
  const externalShopId = tokenData.externalShopId || requestedId || existingMarketShop?.externalShopId || `${marketplace}-us`
  const filter = { marketplace, externalShopId }
  const existingShop = await Shop.findOne(filter).select('name accountId')
  const accessToken = tokenData.access_token || tokenData.accessToken

  // eBay's token reply doesn't say which seller signed in, so ask. A login for a different
  // account than the connected shop's would otherwise overwrite that shop's tokens and mix two
  // sellers' orders and listings.
  let accountId = existingShop?.accountId
  const service = marketplaceManager.getService(marketplace)
  if (typeof service.getAccount === 'function') {
    try {
      const account = await service.getAccount(accessToken)
      if (account?.username) {
        const known = existingShop?.accountId
        if (known && known.toLowerCase() !== account.username.toLowerCase()) {
          throw Object.assign(new Error(
            `You signed in to ${config[marketplace]?.name || marketplace} as "${account.username}", but this shop is connected to "${known}". `
            + `Sign out of ${config[marketplace]?.name || marketplace}, then reconnect as "${known}".`,
          ), { wrongAccount: true })
        }
        accountId = account.username
      }
    } catch (err) {
      if (err.wrongAccount) throw err
      console.warn(`Could not check which ${marketplace} account connected: ${err.message}`)
    }
  }

  const shop = await Shop.findOneAndUpdate(
    existingShop ? { _id: existingShop._id } : filter,
    {
      $set: {
        name: shopName || tokenData.shopName || existingShop?.name || `${config[marketplace]?.name || marketplace} Store`,
        marketplace,
        externalShopId,
        shopCipher: tokenData.shopCipher,
        status: 'connected',
        // The seller's real username also replaces the inbox's best guess at it.
        ...(accountId ? { accountId, accountUsername: accountId } : {}),
        ...(Array.isArray(tokenData.grantedScopes) ? { grantedScopes: tokenData.grantedScopes } : {}),
        auth: {
          accessTokenEnc: accessToken,
          refreshTokenEnc: tokenData.refresh_token || tokenData.refreshToken,
          expiresAt: marketplaceManager.tokenExpiry(tokenData.expires_in),
        },
      },
      $unset: { authError: 1, apiAccess: 1, apiAccessCheckedAt: 1 },
    },
    { upsert: true, returnDocument: 'after' },
  )

  // Re-probe section access immediately on reconnect so newly granted scopes unlock without stale flags.
  await syncQueue.enqueue('access', shop._id, { wait: true, timeoutMs: 15000 }).catch((err) => console.warn(`Initial access sync failed for ${shop.name}:`, err.message))
  for (const kind of ['full', 'live']) {
    syncQueue.enqueue(kind, shop._id).catch((err) => console.warn(`Initial ${kind} sync failed for ${shop.name}:`, err.message))
  }
  return shop
}

/** The connected shop for a marketplace this user may use; HttpError 403/404 otherwise. */
async function connectedShop(ctx, marketplace) {
  const filter = { marketplace, status: 'connected' }
  if (ctx.user.role === 'sub_admin') filter._id = { $in: ctx.allowedShopIds || [] }
  const shop = await Shop.findOne(filter)
  if (shop) return shop
  if (ctx.user.role === 'sub_admin' && await Shop.exists({ marketplace, status: 'connected' })) {
    throw new HttpError(403, { error: 'You do not have permission for this shop' })
  }
  throw new HttpError(404, { error: `No connected ${marketplace} shop` })
}

/** GET / */
async function list(ctx) {
    const filter = ctx.user.role === 'sub_admin' ? { _id: { $in: ctx.allowedShopIds } } : {}
    const shops = await Shop.find(filter).select('name marketplace status authError externalShopId lastSyncAt aiReplyEnabled liveUpdates').sort({ marketplace: 1 }).lean()
    return shops.map(({ liveUpdates, ...shop }) => ({
      ...shop,
      liveUpdates: liveUpdates ? { enabled: Boolean(liveUpdates.enabled), error: liveUpdates.error, enabledAt: liveUpdates.enabledAt } : undefined,
      listing: marketplaceManager.listingCapabilities(shop.marketplace),
    }))
}

/** GET /profiles */
async function getProfiles(ctx) {
    const filter = ctx.user.role === 'sub_admin' ? { _id: { $in: ctx.allowedShopIds } } : {}
    const refresh = ctx.query.refresh === '1' && ctx.user.role === 'super_admin'
    const shops = await Shop.find(filter).select('name marketplace status apiAccess apiAccessCheckedAt shopCipher grantedScopes')
    let list = await marketplaceManager.shopProfiles(shops, { refresh })
    if (ctx.user.role === 'sub_admin') list = list.filter((profile) => shops.some((shop) => shop.marketplace === profile.marketplace))
    return list
}

/** POST /oauth/callback/:marketplace */
async function oauthCallback(ctx) {
    const marketplace = canonicalMarketplace(ctx.params.marketplace)
    if (!marketplace) throw new HttpError(400, { error: 'Unknown marketplace' })
    const { code, shopName, state } = ctx.body
    if (!code) throw new HttpError(400, { error: 'Authorization code is required' })
    if (!state || !verifyOAuthState(state, marketplace, ctx.user.id)) {
      throw new HttpError(400, { error: 'Invalid or expired connect request. Start the connection again from Settings.' })
    }

    const shop = await connectShop(marketplace, code, { shopName, externalShopId: ctx.body.externalShopId })
    const safeShop = shop.toObject()
    delete safeShop.auth
    return { success: true, shop: safeShop }
}

/** POST /sync-all */
async function syncAll(ctx) {
    const filter = { status: 'connected' }
    if (ctx.user.role === 'sub_admin') {
      filter._id = { $in: ctx.allowedShopIds }
    }
    const shops = await Shop.find(filter).select('_id')
    const results = await Promise.all(shops.map((shop) => syncQueue.enqueue('full', shop._id, { wait: true })))
    return { success: true, results }
}

/** POST /:id/live-updates */
async function liveUpdates(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('_id marketplace')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!registry.KEYS.includes(shop.marketplace) || !registry.get(shop.marketplace).webhooks) {
      throw new HttpError(400, { error: 'Live updates are only available for eBay, TikTok Shop and Temu' })
    }
    const result = await syncQueue.enqueue('live', shop._id, { wait: true, timeoutMs: 20000 })
    return { success: true, result }
}

/** POST /:id/sync */
async function sync(ctx) {
    const shop = await Shop.findById(ctx.params.id).select('_id')
    if (!shop) throw new HttpError(404, { error: 'Shop not found' })
    if (!canAccessShop(ctx, shop._id)) throw new HttpError(403, { error: 'You do not have permission for this shop' })
    const result = await syncQueue.enqueue('full', shop._id, { wait: true })
    return { success: true, result }
}

module.exports = { connectedShop, connectShop, list, getProfiles, oauthCallback, syncAll, liveUpdates, sync }
