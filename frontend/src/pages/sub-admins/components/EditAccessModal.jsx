/** Edit a sub-admin's shop access, routes and subsections (opened from the Sub-admins page). */
import { useState } from 'react'
import { SHOPS, KEYS } from '../../../marketplaces'
import { api } from '../../../lib/api'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { PLATFORM_ROUTES, MARKETPLACE_SUBSECTIONS } from '../../../lib/access'
import { SHOP_THEMES, DEFAULT_THEME, choiceCardClass } from '../subAdminShared'

export default function EditAccessModal({ user, token, onClose, onSaved, onDeleted }) {
  const existingMarkets = Array.isArray(user?.marketplaces) && user.marketplaces.length > 0
    ? user.marketplaces
    : [user?.marketplace || KEYS[0]]
  const [activeShop, setActiveShop] = useState(existingMarkets[0] || KEYS[0])
  const [mainRoutes, setMainRoutes] = useState(() => (Array.isArray(user?.mainRoutes) ? user.mainRoutes : []))

  const [sectionsByShop, setSectionsByShop] = useState(() => {
    const rawAllowed = Array.isArray(user?.allowedSections) ? user.allowedSections : []
    const byShop = Object.fromEntries(KEYS.map((key) => [key, []]))
    const hasScoped = rawAllowed.some((x) => x.includes(':'))

    for (const market of KEYS) {
      const native = MARKETPLACE_SUBSECTIONS[market] || []
      const nativeIds = native.map((s) => s.id)

      if (hasScoped) {
        byShop[market] = nativeIds.filter((subId) => rawAllowed.includes(`${market}:${subId}`))
      } else if (existingMarkets.length === 1 && existingMarkets[0] === market && rawAllowed.length > 0) {
        byShop[market] = nativeIds.filter((subId) => rawAllowed.includes(subId))
      } else {
        // Multi-shop without scoped entries or empty allowedSections: NEVER auto-default to mainRoutes
        byShop[market] = []
      }
    }
    return byShop
  })

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const theme = SHOP_THEMES[activeShop] || DEFAULT_THEME
  const nativeSubsections = MARKETPLACE_SUBSECTIONS[activeShop] || []
  const currentShopSections = sectionsByShop[activeShop] || []

  const togglePlatformRoute = (key) => {
    setMainRoutes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const toggleSection = (sectionId) => {
    setSectionsByShop((prev) => {
      const current = prev[activeShop] || []
      const next = current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId]
      return { ...prev, [activeShop]: next }
    })
  }

  const selectAllShopSections = () => {
    const subs = MARKETPLACE_SUBSECTIONS[activeShop] || []
    setSectionsByShop((prev) => ({
      ...prev,
      [activeShop]: subs.map((s) => s.id),
    }))
  }

  const clearShopSections = () => {
    setSectionsByShop((prev) => ({
      ...prev,
      [activeShop]: [],
    }))
  }

  const selectAllPermissions = () => {
    setMainRoutes(PLATFORM_ROUTES.map(([k]) => k))
    const subs = MARKETPLACE_SUBSECTIONS[activeShop] || []
    setSectionsByShop((prev) => ({
      ...prev,
      [activeShop]: subs.map((s) => s.id),
    }))
  }

  const clearAllPermissions = () => {
    setMainRoutes([])
    setSectionsByShop((prev) => ({
      ...prev,
      [activeShop]: [],
    }))
  }

  const handleSwitchShop = (nextMarket) => {
    setActiveShop(nextMarket)
  }

  const save = async () => {
    setError('')

    const activeMarkets = Object.keys(sectionsByShop).filter(
      (m) => (sectionsByShop[m] || []).length > 0
    )
    const finalMarkets = activeMarkets.length > 0 ? activeMarkets : [activeShop]

    const platformSelected = mainRoutes.filter((r) => PLATFORM_ROUTES.some(([k]) => k === r))
    const shopRoutesSelected = []
    const allAllowedSections = []

    finalMarkets.forEach((market) => {
      const subs = MARKETPLACE_SUBSECTIONS[market] || []
      const selectedIds = sectionsByShop[market] || []
      selectedIds.forEach((id) => {
        allAllowedSections.push(`${market}:${id}`)
        if (finalMarkets.length === 1) {
          allAllowedSections.push(id)
        }
      })
      subs.forEach((s) => {
        if (selectedIds.includes(s.id) && !shopRoutesSelected.includes(s.route)) {
          shopRoutesSelected.push(s.route)
        }
      })
    })

    const uniqueAllowedSections = [...new Set(allAllowedSections)]
    const computedMainRoutes = [...new Set([...platformSelected, ...shopRoutesSelected])]

    if (!computedMainRoutes.length && !uniqueAllowedSections.length) {
      return setError('Please select at least one authorized subsection or module.')
    }

    setBusy(true)
    try {
      await api.patch(
        `/api/auth/users/${user._id}`,
        {
          marketplace: finalMarkets[0],
          marketplaces: finalMarkets,
          mainRoutes: computedMainRoutes,
          allowedSections: uniqueAllowedSections,
        },
        token,
      )
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await api.del(`/api/auth/users/${user._id}`, token)
      onDeleted()
    } catch (e) {
      setError(e.message)
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Permissions & Access — ${user.name}`} onClose={onClose} wide>
      {confirmDelete ? (
        <div className="space-y-4 text-sm">
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            <p className="font-semibold">Permanently Delete Sub-Admin</p>
            <p className="mt-1 text-xs">
              Are you sure you want to permanently delete <span className="font-bold">{user.name} (@{user.username || user.email})</span>? All permissions for {theme.label} will be revoked and this account will be removed immediately.
            </p>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? 'Deleting…' : 'Confirm Delete'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Target Shop Designation */}
          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Assigned Marketplace Shop
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {SHOPS.map((registryShop) => ({ id: registryShop.key, label: registryShop.theme.storeLabel })).map((shop) => {
                const isSelected = activeShop === shop.id
                const count = (sectionsByShop[shop.id] || []).length
                const total = (MARKETPLACE_SUBSECTIONS[shop.id] || []).length
                return (
                  <button
                    key={shop.id}
                    type="button"
                    onClick={() => handleSwitchShop(shop.id)}
                    className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-500 dark:bg-indigo-950/40'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <div>
                      <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {shop.label}
                      </span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {count > 0 ? `${count}/${total} selected` : '0 selected'}
                      </span>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isSelected ? 'bg-indigo-600 dark:bg-indigo-400' : count > 0 ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    />
                  </button>
                )
              })}
            </div>
          </section>

          {/* Section Permissions */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Authorized Modules & Subsections
              </p>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllPermissions}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Select all
                </button>
                <span className="text-gray-300 dark:text-gray-700">|</span>
                <button
                  type="button"
                  onClick={clearAllPermissions}
                  className="text-gray-500 hover:underline dark:text-gray-400"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Platform Modules */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                Platform Modules
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PLATFORM_ROUTES.map(([value, label, desc]) => {
                  const on = mainRoutes.includes(value)
                  return (
                    <div
                      key={value}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={on}
                      onClick={() => togglePlatformRoute(value)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          togglePlatformRoute(value)
                        }
                      }}
                      className={choiceCardClass(on)}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {}}
                        tabIndex={-1}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {label}
                        </span>
                        {desc && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {desc}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Shop Native Subsections */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                    {theme.shortLabel} Subsections
                  </p>
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${theme.badge}`}>
                    {currentShopSections.length} of {nativeSubsections.length} enabled
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAllShopSections}
                    className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Select all
                  </button>
                  <span className="text-gray-300 dark:text-gray-700">|</span>
                  <button
                    type="button"
                    onClick={clearShopSections}
                    className="text-gray-500 hover:underline dark:text-gray-400"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {nativeSubsections.map((sub) => {
                  const isSelected = currentShopSections.includes(sub.id)
                  return (
                    <div
                      key={sub.id}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={isSelected}
                      onClick={() => toggleSection(sub.id)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          toggleSection(sub.id)
                        }
                      }}
                      className={choiceCardClass(isSelected)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        tabIndex={-1}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {sub.label}
                        </span>
                        {sub.desc && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                            {sub.desc}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-slate-800">
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete Sub-Admin
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save permissions'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
