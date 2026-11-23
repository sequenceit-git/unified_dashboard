/** Step 3 of the sub-admin form: routes and per-shop sections they may use. */
import Card from '../../../components/ui/Card'
import { PLATFORM_ROUTES } from '../../../lib/access'

export default function PermissionsStep({ ctx }) {
  const { clearAllPermissions, clearShopSections, currentShopSections, mainRoutes, nativeSubsections, selectAllPermissions, selectAllShopSections, selectedShop, togglePlatformRoute, toggleSection } = ctx
  return (
    <>
      <Card>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Step 3
              </p>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {selectedShop.shopName} Permissions
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Granular control over which {selectedShop.shopName} pages and platform modules this sub-admin can open.
              </p>
            </div>
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

          {/* Platform-Wide Modules */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Platform-Wide Modules
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {PLATFORM_ROUTES.map(([key, label, desc]) => {
                const isSelected = mainRoutes.includes(key)
                return (
                  <div
                    key={key}
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={isSelected}
                    onClick={() => togglePlatformRoute(key)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault()
                        togglePlatformRoute(key)
                      }
                    }}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-950/30'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      tabIndex={-1}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {label}
                      </span>
                      {desc && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {selectedShop.shopName} Subsections
                </p>
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${selectedShop.theme.badge}`}>
                  {currentShopSections.length} of {nativeSubsections.length} enabled
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllShopSections}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Select all shop sections
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

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isSelected
                        ? `${selectedShop.theme.border} ${selectedShop.theme.bgActive} shadow-xs`
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      tabIndex={-1}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {sub.label}
                      </span>
                      {sub.desc && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {sub.desc}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}
