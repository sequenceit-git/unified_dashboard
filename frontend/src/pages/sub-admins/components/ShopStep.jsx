/** Step 1 of the sub-admin form: which shops the sub-admin works in. */
import Card from '../../../components/ui/Card'
import { MARKETPLACE_SUBSECTIONS } from '../../../lib/access'

export default function ShopStep({ ctx }) {
  const { SHOPS, activeShop, connectedShops, handleSelectShop, sectionsByShop } = ctx
  return (
    <>
      <Card>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Step 1
            </p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Marketplace Shop Scope
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Choose a shop tab to configure its subsections below. Selecting subsections across multiple shops grants access to each selected shop.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SHOPS.map((shop) => {
              const isSelected = activeShop === shop.marketplace
              const count = (sectionsByShop[shop.marketplace] || []).length
              const total = (MARKETPLACE_SUBSECTIONS[shop.marketplace] || []).length
              const conn = connectedShops.find((s) => s.marketplace === shop.marketplace && s.status === 'connected')

              return (
                <div
                  key={shop.id}
                  role="radio"
                  tabIndex={0}
                  aria-checked={isSelected}
                  onClick={() => handleSelectShop(shop.marketplace)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      handleSelectShop(shop.marketplace)
                    }
                  }}
                  className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isSelected
                      ? `${shop.theme.border} ${shop.theme.bgActive} shadow-sm ring-1 ${shop.theme.border}`
                      : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                        {shop.label}
                      </span>
                      <input
                        type="radio"
                        name="marketplace_shop"
                        checked={isSelected}
                        onChange={() => {}}
                        tabIndex={-1}
                        className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-0 dark:border-slate-700"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      {shop.desc}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          conn ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      />
                      <span className="truncate">
                        {conn ? (conn.name || 'Store Connected') : 'Not Connected'}
                      </span>
                    </div>
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold shrink-0 ${
                      count > 0 ? shop.theme.badge : 'text-gray-400 bg-gray-50 dark:bg-slate-800 dark:text-gray-500'
                    }`}>
                      {count > 0 ? `${count}/${total} selected` : '0 selected'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </>
  )
}
