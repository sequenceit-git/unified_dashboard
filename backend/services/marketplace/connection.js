/**
 * Unified Marketplace Manager
 * Single interface for eBay, TikTok Shop, and Temu operations
 */

const profiles = require('./profiles')
const config = require('../../config/marketplaces')
const Shop = require('../../models/Shop')
const registry = require('../../marketplaces')

/** A shop's optional hooks and capability flags (empty for an unknown marketplace). */
function shopCaps(marketplace) {
  return registry.KEYS.includes(marketplace) ? registry.get(marketplace).capabilities || {} : {}
}

class UnifiedMarketplaceManager {
  getService(marketplace) {
    const service = registry.KEYS.includes(marketplace) ? registry.get(marketplace).service : null
    if (!service) {
      throw new Error(`Unsupported marketplace: ${marketplace}`)
    }
    return service
  }

  getConfig(marketplace) {
    return config[marketplace]
  }

  /**
   * Generates authorization redirect URL for a given marketplace
   */
  getAuthUrl(marketplace, state) {
    const service = this.getService(marketplace)
    if (typeof service.getAuthUrl !== 'function') {
      throw new Error(`OAuth connect is not supported via URL for ${marketplace}`)
    }
    return service.getAuthUrl(state)
  }

  /**
   * Exchanges an authorization code for access credentials
   */
  async exchangeCode(marketplace, code) {
    const service = this.getService(marketplace)
    return service.exchangeCode(code)
  }

  /**
   * Refreshes access tokens for a given marketplace
   */
  async refreshToken(marketplace, refreshToken) {
    const service = this.getService(marketplace)
    return service.refreshToken(refreshToken)
  }

  /**
   * Re-checks which sections the shop's token can reach and saves the result on the shop.
   * Returns the saved `apiAccess` map.
   */
  async checkShopAccess(shop) {
    const access = await this.withShopToken(shop, (token) => profiles.probeSections(shop.marketplace, token, shop))
    const checkedAt = new Date()
    await Shop.updateOne({ _id: shop._id }, { apiAccess: access, apiAccessCheckedAt: checkedAt })
    shop.apiAccess = access
    shop.apiAccessCheckedAt = checkedAt
    return access
  }

  /** Profiles for every marketplace, each with its connected shop's section access. */
  async shopProfiles(shops, { refresh = false } = {}) {
    const result = []
    for (const marketplace of Object.keys(profiles.PROFILES)) {
      const shop = shops.find((item) => item.marketplace === marketplace && item.status === 'connected')
        || shops.find((item) => item.marketplace === marketplace)
      if (shop?.status === 'connected') {
        const syncQueue = require('../core/syncQueue')
        const stale = !shop.apiAccessCheckedAt || Date.now() - new Date(shop.apiAccessCheckedAt).getTime() > profiles.ACCESS_TTL_MS
        if (refresh || !shop.apiAccess) {
          const access = await syncQueue.enqueue('access', shop._id, { wait: true, timeoutMs: 30000 })
          if (access && !access.error && !access.queued && !access.skipped) {
            shop.apiAccess = access
            shop.apiAccessCheckedAt = new Date()
          }
        } else if (stale) {
          syncQueue.enqueue('access', shop._id).catch((err) => console.warn(`Access check failed for ${shop.name}:`, err.message))
        }
      }
      result.push({ ...profiles.describe(marketplace, shop), shopId: shop?._id || null, shopName: shop?.name || null })
    }
    return result
  }

  /** Lets a shop connect itself from server settings (e.g. an eBay token in .env). */
  async autoConnectFromEnv() {
    for (const adapter of registry.all()) {
      if (adapter.hooks?.autoConnectFromEnv) await adapter.hooks.autoConnectFromEnv()
    }
  }

  /** TikTok sends an absolute Unix time; eBay sends seconds from now. */
  tokenExpiry(expiresIn) {
    const value = Number(expiresIn)
    if (!value) return null
    return new Date(value > 1e9 ? value * 1000 : Date.now() + value * 1000)
  }

  /** Current access token, refreshed first when it ends within 10 minutes (or when `force`). */
  async freshToken(shop, { force = false } = {}) {
    const doc = await Shop.findById(shop._id).select('+auth.accessTokenEnc +auth.refreshTokenEnc')
    if (!doc?.auth?.accessTokenEnc) return ''
    const expiresAt = doc.auth.expiresAt ? new Date(doc.auth.expiresAt).getTime() : null
    const endingSoon = expiresAt !== null && expiresAt - Date.now() < 10 * 60 * 1000
    const canRefresh = doc.auth.refreshTokenEnc && shopCaps(doc.marketplace).refreshToken
    if (canRefresh && (force || endingSoon)) {
      try {
        const next = await this.refreshToken(doc.marketplace, doc.auth.refreshTokenEnc)
        doc.auth.accessTokenEnc = next.access_token
        if (next.refresh_token) doc.auth.refreshTokenEnc = next.refresh_token
        doc.auth.expiresAt = this.tokenExpiry(next.expires_in)
        if (Array.isArray(next.grantedScopes)) doc.grantedScopes = next.grantedScopes
        await doc.save()
      } catch (err) {
        require('../core/notify').tokenFailed(doc, err.message).catch(() => {})
        if (err.deadLogin) {
          // The login can't be refreshed any more: show the shop as needing a reconnect and stop syncing it.
          await Shop.updateOne({ _id: doc._id }, { status: 'error', authError: err.message }).catch(() => {})
          throw Object.assign(new Error(`${doc.name} needs reconnecting: ${err.message}`), { notConnected: true })
        }
        if (force) throw err
        console.warn(`[tokens] ${doc.name}: refresh failed: ${err.message}`)
      }
    }
    return doc.auth.accessTokenEnc
  }

  /** Runs `fn(token)`; on an expired-login error, refreshes once and tries again. */
  async withShopToken(shop, fn) {
    const token = await this.freshToken(shop)
    if (!token) throw Object.assign(new Error(`${shop.name} is not connected.`), { notConnected: true })
    try {
      return await fn(token)
    } catch (err) {
      if (!(err.status === 401 || /expired|invalid access.?token/i.test(err.message || ''))) throw err
      return fn(await this.freshToken(shop, { force: true }))
    }
  }

  messageAccessError(shop, err) {
    if (err.notConnected) return err.message
    const denied = err.status === 401 || /scope|access token|access denied|invalid access/i.test(err.message || '')
    return denied
      ? `${shop.name} is connected, but this login does not include message access. Connect the shop again from Settings.`
      : err.message
  }

}

module.exports = new UnifiedMarketplaceManager()
