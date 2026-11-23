import { useSubAdmins } from './hooks/useSubAdmins'
import { SHOPS, KEYS, getShop } from '../../marketplaces'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import Modal from '../../components/ui/Modal'
import SearchInput from '../../components/ui/SearchInput'
import { MARKETPLACE_SUBSECTIONS } from '../../lib/access'
import { SHOP_THEMES, DEFAULT_THEME, formatDateSafe, formatDateTimeSafe, AccessPill } from './subAdminShared'
import EditAccessModal from './components/EditAccessModal'

export default function SubAdminManagementPage() {
  const {
    token,
    usersRes,
    users,
    search,
    setSearch,
    shopFilter,
    setShopFilter,
    statusFilter,
    setStatusFilter,
    editingAccessUser,
    setEditingAccessUser,
    deletingUser,
    setDeletingUser,
    deleteBusy,
    deleteError,
    setDeleteError,
    successBanner,
    setSuccessBanner,
    togglingId,
    handleConfirmDelete,
    handleToggleStatus,
    filteredUsers,
    counts,
  } = useSubAdmins()
  if (usersRes.loading) return <Spinner />
  if (usersRes.error) return <ErrorState message={usersRes.error} onRetry={usersRes.refetch} />

  const closeAndRefresh = () => {
    setEditingAccessUser(null)
    usersRes.refetch()
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
            Administration
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Sub-admin management
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Manage employee access across your marketplace shops (eBay, TikTok Shop, Temu) in one unified dashboard.
          </p>
        </div>
        <Link to="/sub-admins/new" className="self-start sm:self-auto">
          <Button className="shadow-sm">+ Create Sub-Admin</Button>
        </Link>
      </div>

      {/* Success Notification */}
      {successBanner && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold">✓</span>
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner('')}
            className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Shop Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShopFilter('all')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            shopFilter === 'all'
              ? 'border-indigo-500 bg-indigo-50/60 shadow-xs dark:bg-indigo-950/30'
              : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">All Sub-Admins</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{counts.total}</p>
        </div>

        {SHOPS.map((shop) => (
          <div
            key={shop.key}
            role="button"
            tabIndex={0}
            onClick={() => setShopFilter(shop.key)}
            className={`cursor-pointer rounded-xl border p-4 transition-all ${
              shopFilter === shop.key
                ? shop.theme.card
                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${shop.theme.indicator}`} />
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{shop.theme.adminsLabel}</p>
            </div>
            <p className={`mt-1 text-2xl font-bold ${shop.theme.count}`}>{counts.byShop[shop.key]}</p>
          </div>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search sub-admins…"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Shop Segmentation Tabs */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShopFilter('all')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  shopFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                All Shops ({counts.total})
              </button>
              {SHOPS.map((shop) => (
                <button
                  key={shop.key}
                  type="button"
                  onClick={() => setShopFilter(shop.key)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    shopFilter === shop.key
                      ? shop.theme.tab
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  {shop.theme.tabLabel} ({counts.byShop[shop.key]})
                </button>
              ))}
            </div>

            {/* Status tabs */}
            <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 text-xs dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                All Status
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Active ({counts.active})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('disabled')}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  statusFilter === 'disabled'
                    ? 'bg-white text-rose-700 shadow-xs dark:bg-slate-800 dark:text-rose-400'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                Suspended ({counts.suspended})
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Sub-Admins Grid */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          message={
            users.length === 0
              ? 'No sub-admin accounts created yet. Click "+ Create Sub-Admin" to get started.'
              : 'No sub-admins match your current shop or status filter.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredUsers.map((user) => {
            const explicitMarkets = Array.isArray(user.marketplaces) && user.marketplaces.length > 0
              ? user.marketplaces
              : [user.marketplace || KEYS[0]]
            const rawAllowed = Array.isArray(user.allowedSections) ? user.allowedSections : []
            const scopedMarkets = rawAllowed
              .filter((x) => typeof x === 'string' && x.includes(':'))
              .map((x) => x.split(':')[0])
            const userMarkets = [...new Set([...explicitMarkets, ...scopedMarkets])].filter((m) =>
              KEYS.includes(m)
            )
            const theme = SHOP_THEMES[userMarkets[0]] || DEFAULT_THEME
            const isActive = (user.status || 'active') === 'active'
            const isToggling = togglingId === user._id

            const hasScoped = rawAllowed.some((x) => x.includes(':'))
            const hasExplicit = rawAllowed.length > 0

            // Group active subsections across all assigned shops
            const activeSubs = []
            userMarkets.forEach((m) => {
              const subsMeta = MARKETPLACE_SUBSECTIONS[m] || []
              let matched = []
              if (hasScoped) {
                matched = subsMeta.filter((s) => rawAllowed.includes(`${m}:${s.id}`))
              } else if (hasExplicit && userMarkets.length === 1) {
                matched = subsMeta.filter((s) => rawAllowed.includes(s.id))
              }
              matched.forEach((s) => {
                activeSubs.push({ ...s, market: m })
              })
            })

            return (
              <Card key={user._id} className="relative flex flex-col justify-between transition-all hover:shadow-md">
                <div>
                  {/* Top user row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {user.profileImageUrl ? (
                        <img
                          src={user.profileImageUrl}
                          alt=""
                          className="h-12 w-12 rounded-full object-cover ring-2 ring-indigo-100 dark:ring-indigo-900/50"
                        />
                      ) : (
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-base font-bold text-white shadow-sm">
                          {user.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="truncate font-semibold text-gray-900 dark:text-gray-100">
                            {user.name}
                          </h2>
                          {userMarkets.map((m) => {
                            const mTheme = SHOP_THEMES[m] || DEFAULT_THEME
                            return (
                              <span key={m} className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${mTheme.badge}`}>
                                {mTheme.shortLabel}
                              </span>
                            )
                          })}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            {isActive ? 'Active' : 'Suspended'}
                          </span>
                        </div>
                        <p className="truncate text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                          @{user.username || user.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link to={`/sub-admins/${user._id}/edit`}>
                        <Button variant="secondary" size="sm" title="Edit account details">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingAccessUser(user)}
                        title="Configure subsections"
                      >
                        Permissions
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setDeleteError('')
                          setDeletingUser(user)
                        }}
                        title="Delete sub-admin account"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Subsections & Access summary */}
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 text-[11px]">
                        {userMarkets.length > 1 ? 'Assigned Subsections' : `${theme.shortLabel} Subsections`} ({activeSubs.length})
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {activeSubs.length > 0 ? (
                        activeSubs.map((sub, idx) => (
                          <AccessPill
                            key={`${sub.market || 'm'}-${sub.id}-${idx}`}
                            variant={getShop(sub.market)?.theme.pill || 'amber'}
                          >
                            {userMarkets.length > 1 ? `${SHOP_THEMES[sub.market]?.shortLabel || ''}: ${sub.label}` : sub.label}
                          </AccessPill>
                        ))
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic">No subsections assigned</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Audit & Quick Toggle Footer */}
                <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-3 text-[11px] text-gray-500 dark:border-slate-800 dark:text-gray-400">
                  <div className="space-y-0.5">
                    <div>
                      Created: {formatDateSafe(user.createdAt)}
                    </div>
                    <div>
                      Last active: {formatDateTimeSafe(user.lastLoginAt)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleStatus(user)}
                    disabled={isToggling}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold text-xs transition-colors ${
                      isActive
                        ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
                        : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                    }`}
                  >
                    {isToggling ? 'Updating…' : isActive ? 'Suspend Account' : 'Activate Account'}
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Permissions Modal */}
      {editingAccessUser && (
        <EditAccessModal
          user={editingAccessUser}
          token={token}
          onClose={() => setEditingAccessUser(null)}
          onSaved={closeAndRefresh}
          onDeleted={closeAndRefresh}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <Modal
          title="Delete Sub-Admin"
          onClose={() => !deleteBusy && setDeletingUser(null)}
        >
          <div className="space-y-4 text-sm">
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div>
                  <h4 className="font-bold text-red-950 dark:text-red-100 mb-1">
                    Permanently delete this sub-admin?
                  </h4>
                  <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold underline">{deletingUser.name}</span> (<span className="font-mono">{deletingUser.username || deletingUser.email}</span>)?
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                    All shop permissions for <span className="font-semibold">{SHOP_THEMES[deletingUser.marketplace || deletingUser.marketplaces?.[0] || KEYS[0]]?.label || 'Marketplace'}</span> will be permanently revoked, and this account will be removed immediately.
                  </p>
                </div>
              </div>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
              >
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-slate-800">
              <Button
                variant="secondary"
                onClick={() => setDeletingUser(null)}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting…' : 'Delete Sub-Admin'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
