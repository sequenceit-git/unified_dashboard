/**
 * Shop page routing helpers. Each shop names its sections after its own API (eBay `listings`,
 * Temu `goods`); `renamedSections` on the shop maps the older names to the new ones.
 */
import { SHOPS, getShop } from '../marketplaces'

/** Shop pages that sit behind a main-route permission (the other sections check access themselves). */
const GATED_ROUTES = ['analytics', 'products', 'inventory', 'orders', 'customers', 'inbox']

/** `/<urlId>/<old section>` → `/<urlId>/<new section>` (keeping anything after it), or null. */
export function renamedPath(pathname) {
  const [, urlId, section, ...rest] = pathname.split('/')
  const next = getShop(urlId)?.renamedSections?.[section]
  return next ? ['', urlId, next, ...rest].join('/') : null
}

/** The old (generic) name of a shop section: what main-route permission names it after. */
function originalId(shop, id) {
  return Object.keys(shop.renamedSections || {}).find((old) => shop.renamedSections[old] === id) || id
}

/** Whether a shop section page is gated by a main route, and which one. */
export function gateFor(shop, id) {
  const route = shop.subsections.find((section) => section.id === id)?.route || id
  return { gated: GATED_ROUTES.includes(originalId(shop, id)), route }
}

/** The same section (by its original name) on another shop, in that shop's own naming. */
export function sameSectionOn(fromUrlId, section, toUrlId) {
  const from = getShop(fromUrlId)
  const original = from ? originalId(from, section) : section
  return getShop(toUrlId)?.renamedSections?.[original] || original
}

/** First accessible destination path for a user based on their routes, shops, and subsections. */
export function firstAllowedPath(user) {
  if (!user) return null
  if (user.role === 'super_admin') return '/'
  const routes = Array.isArray(user.mainRoutes) ? user.mainRoutes : []
  if (routes.includes('dashboard')) return '/'
  if (routes.includes('market-research')) return '/market-research'
  const hasExplicitMarkets = Array.isArray(user.marketplaces)
  if (hasExplicitMarkets && user.marketplaces.length === 0) return null
  const allowedMarkets = hasExplicitMarkets ? user.marketplaces : []
  const allowedSections = Array.isArray(user.allowedSections) ? user.allowedSections : []
  for (const shop of SHOPS) {
    if (allowedMarkets.length && !allowedMarkets.includes(shop.key)) continue
    for (const sub of shop.subsections || []) {
      if (!routes.includes(sub.route)) continue
      if (
        allowedSections.length === 0 ||
        allowedSections.includes(sub.id) ||
        allowedSections.includes(`${shop.key}:${sub.id}`)
      ) {
        return `/${shop.urlId}/${sub.id}`
      }
    }
  }
  return null
}
