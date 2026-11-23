/**
 * What each shop looks like in the dashboard: its sidebar sections, its own status names and
 * its product form. Every section has a read-only `probe` against the API it needs, so a shop
 * only shows sections its token can actually reach (see `checkAccess`).
 */

const registry = require('../../marketplaces')

/** Every shop's profile, from its folder (marketplaces/<key>/profile.js). */
const PROFILES = Object.fromEntries(registry.all().map((adapter) => [adapter.key, adapter.profile]))

const ACCESS_TTL_MS = 12 * 60 * 60 * 1000

/** Runs every section probe at once; returns `{ [sectionId]: { ok, reason } }`. */
async function probeSections(marketplace, token, shop) {
  const profile = PROFILES[marketplace]
  const results = await Promise.all(profile.sections.map(async (section) => {
    try {
      await section.probe(token, shop)
      return [section.id, { ok: true }]
    } catch (err) {
      const denied = /access denied|scope|not been granted|insufficient|permission|not authorized|401|403/i.test(err.message || '')
      return [section.id, { ok: !denied, reason: denied ? `Needs ${section.needs}` : '', error: denied ? '' : String(err.message || '').slice(0, 200) }]
    }
  }))
  return Object.fromEntries(results)
}

/** Public view of a profile for one shop, with each section's availability. */
function describe(marketplace, shop) {
  const profile = PROFILES[marketplace]
  if (!profile) return null
  const access = shop?.apiAccess || {}
  return {
    marketplace,
    label: profile.label,
    connected: shop?.status === 'connected',
    accessCheckedAt: shop?.apiAccessCheckedAt || null,
    grantedScopes: shop?.grantedScopes || [],
    sections: profile.sections.map(({ probe, ...section }) => {
      const result = access[section.id]
      const available = !shop || shop.status !== 'connected' ? null : result ? result.ok : null
      return { ...section, available, reason: result?.reason || '' }
    }),
    statuses: profile.statuses,
    rawStatuses: profile.rawStatuses,
    productForm: profile.productForm,
    listingActions: profile.listingActions || [],
  }
}

module.exports = { PROFILES, ACCESS_TTL_MS, probeSections, describe }
