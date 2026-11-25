/** Shared bits of the sub-admin pages: shop themes, date formatting, access pills. */
import { SHOPS, KEYS } from '../../marketplaces'

/** Per-shop labels and colours, from the marketplace registry (src/marketplaces/<key>/index.js). */
export const SHOP_THEMES = Object.fromEntries(SHOPS.map((shop) => [shop.key, {
  label: shop.theme.subAdminLabel,
  shortLabel: shop.shortLabel,
  badge: shop.theme.badge,
  indicator: shop.theme.indicator,
}]))
export const DEFAULT_THEME = SHOP_THEMES[KEYS[0]]

export function formatDateSafe(val) {
  if (!val) return '—'
  const d = new Date(val)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function formatDateTimeSafe(val) {
  if (!val) return 'Never'
  const d = new Date(val)
  return isNaN(d.getTime()) ? 'Never' : d.toLocaleString()
}

export function marketsOf(user) {
  const explicit = Array.isArray(user?.marketplaces) && user.marketplaces.length > 0
    ? user.marketplaces
    : (user?.marketplace ? [user.marketplace] : [KEYS[0]])
  const rawAllowed = Array.isArray(user?.allowedSections) ? user.allowedSections : []
  const scoped = rawAllowed
    .filter((x) => typeof x === 'string' && x.includes(':'))
    .map((x) => x.split(':')[0])
  return [...new Set([...explicit, ...scoped])].filter((m) => KEYS.includes(m))
}

export function AccessPill({ children, variant = 'indigo' }) {
  const styles = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/50',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
    gray: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${styles[variant] || styles.indigo}`}>
      {children}
    </span>
  )
}

export function emptySectionsByShop() {
  return Object.fromEntries(KEYS.map((key) => [key, []]))
}

export function shopNamesList(markets) {
  const labels = (markets || []).map((m) => SHOP_THEMES[m]?.shortLabel || m).filter(Boolean)
  return labels.length ? labels.join(', ') : 'assigned shops'
}

export function platformRoutesOf(user, platformRoutes) {
  const routes = Array.isArray(user?.mainRoutes) ? user.mainRoutes : []
  return platformRoutes.filter(([key]) => routes.includes(key))
}

export function choiceCardClass(on) {
  return `flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
    on
      ? 'border-indigo-500 bg-indigo-50/80 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/40'
      : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
  }`
}
