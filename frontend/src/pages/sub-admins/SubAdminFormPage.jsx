import { useSubAdminForm } from './hooks/useSubAdminForm'
import PermissionsStep from './components/PermissionsStep'
import CredentialsStep from './components/CredentialsStep'
import ShopStep from './components/ShopStep'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import Modal from '../../components/ui/Modal'
import { SHOPS as REGISTRY_SHOPS } from '../../marketplaces'

/** Shop cards for the form, from the marketplace registry (src/marketplaces/<key>/index.js). */
const SHOPS = REGISTRY_SHOPS.map((shop) => ({
  id: shop.key,
  marketplace: shop.key,
  label: shop.theme.subAdminLabel,
  shopName: shop.theme.shopName,
  desc: shop.theme.desc,
  theme: { border: shop.theme.border, bgActive: shop.theme.bgActive, badge: shop.theme.badge, indicator: shop.theme.indicator },
}))

export default function SubAdminFormPage() {
  const {
    editing,
    usersRes,
    existing,
    connectedShops,
    activeShop,
    sectionsByShop,
    name,
    setName,
    username,
    setUsername,
    password,
    setPassword,
    status,
    setStatus,
    mainRoutes,
    busy,
    error,
    showDeleteModal,
    setShowDeleteModal,
    deleteBusy,
    deleteError,
    setDeleteError,
    handleDelete,
    selectedShop,
    nativeSubsections,
    currentShopSections,
    handleSelectShop,
    togglePlatformRoute,
    toggleSection,
    selectAllShopSections,
    clearShopSections,
    selectAllPermissions,
    clearAllPermissions,
    save,
  } = useSubAdminForm()
  if (editing && usersRes.loading) return <Spinner />
  if (editing && (usersRes.error || !existing)) return <ErrorState message={usersRes.error || 'Sub-admin not found'} />

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      {/* Header Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          to="/sub-admins"
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:underline"
        >
          ← Sub-admins
        </Link>
        <span className="text-gray-300 dark:text-gray-700">/</span>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          {editing ? `Edit ${selectedShop.label}` : `Create ${selectedShop.label}`}
        </h1>
      </div>

      <form onSubmit={save} className="space-y-6">
        {/* Step 1: Target Marketplace Shop Selection */}
        <ShopStep ctx={{ SHOPS, activeShop, connectedShops, handleSelectShop, sectionsByShop }} />

        {/* Step 2: Account Credentials */}
        <CredentialsStep ctx={{ editing, name, password, setName, setPassword, setStatus, setUsername, status, username }} />

        {/* Step 3: Scoped Section Permissions */}
        <PermissionsStep ctx={{ clearAllPermissions, clearShopSections, currentShopSections, mainRoutes, nativeSubsections, selectAllPermissions, selectAllShopSections, selectedShop, togglePlatformRoute, toggleSection }} />

        {/* Error notification */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {/* Form Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {editing ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setDeleteError('')
                setShowDeleteModal(true)
              }}
              disabled={busy || deleteBusy}
            >
              Delete Sub-Admin
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <Link to="/sub-admins">
              <Button type="button" variant="secondary" disabled={busy || deleteBusy}>
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={busy || deleteBusy}>
              {busy ? 'Saving…' : editing ? 'Save Changes' : `Create ${selectedShop.label}`}
            </Button>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          title="Delete Sub-Admin"
          onClose={() => !deleteBusy && setShowDeleteModal(false)}
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
                    Are you sure you want to delete <span className="font-bold underline">{name}</span> (<span className="font-mono">{username}</span>)?
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                    All shop permissions for <span className="font-semibold">{selectedShop.label}</span> will be permanently revoked and their account removed immediately.
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
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
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
