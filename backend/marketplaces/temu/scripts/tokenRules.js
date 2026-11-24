/** What a manually issued Temu access token changes on the shop, after Temu's own token info confirms it. */
function tokenUpdate(shop, token, info) {
  const t = String(token || '').trim()
  if (!t) throw new Error('Paste the access token from Temu Seller Center.')
  if (!info || info.mallId == null) throw new Error('Temu did not recognise this access token.')
  if (shop.externalShopId && String(shop.externalShopId) !== String(info.mallId)) {
    throw new Error(`This token belongs to Temu mall ${info.mallId}, not this shop (${shop.externalShopId}).`)
  }
  const exp = Number(info.expiredTime)
  return {
    'auth.accessTokenEnc': t,
    ...(exp > 0 ? { 'auth.expiresAt': new Date(String(Math.trunc(exp)).length > 11 ? exp : exp * 1000) } : {}),
    grantedScopes: Array.isArray(info.apiScopeList) ? info.apiScopeList : [],
    status: 'connected',
    authError: null,
  }
}

module.exports = { tokenUpdate }
