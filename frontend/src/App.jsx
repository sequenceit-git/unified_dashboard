import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ShopSectionGate from './components/ShopSectionGate'
import { Spinner } from './components/ui/Feedback'
import LegacyShopRedirect from './components/LegacyShopRedirect'
import { SHOPS } from './marketplaces'
import { firstAllowedPath, gateFor, renamedPath } from './lib/shopRoutes'
import Login from './pages/auth/Login'
import Overview from './pages/dashboard/Overview'
import ProductDiscoveryPage from './pages/discovery/ProductDiscoveryPage'
import OAuthCallback from './pages/auth/OAuthCallback'
import SettingsPage from './pages/settings/SettingsPage'
import SubAdminFormPage from './pages/sub-admins/SubAdminFormPage'
import SubAdminManagementPage from './pages/sub-admins/SubAdminManagementPage'

/** Old shop URLs: /orders?shop=ebay, /shop/returns?shop=tiktok → /<shop>/<section>. */
const LEGACY_SHOP_PATHS = ['/analytics', '/products', '/inventory', '/orders', '/customers', '/inbox', '/shop/:sectionId']

/** /<shop>/<old section name> → the shop's own name for it (eBay products → listings). */
function RenamedSectionRedirect() {
  const { pathname, search } = useLocation()
  return <Navigate to={`${renamedPath(pathname) || pathname}${search}`} replace />
}

function PublicOnly({ children }) {
  const { token } = useAuth()
  if (token) return <Navigate to="/" replace />
  return children
}

function RouteAccess({ route, children }) {
  const { hasRoute, user } = useAuth()
  const { pathname } = useLocation()
  if (hasRoute(route)) return children
  const next = firstAllowedPath(user)
  if (next && next !== pathname) return <Navigate to={next} replace />
  return <p className="p-8 text-center">No application sections have been assigned to this account.</p>
}

function AdminOnly({ children }) {
  const { isAdmin, user } = useAuth()
  return isAdmin ? children : <Navigate to={firstAllowedPath(user) || '/'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="/oauth/:marketplace/callback" element={<OAuthCallback />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/discovery" element={<Navigate to="/market-research" replace />} />
        <Route path="/" element={<RouteAccess route="dashboard"><Overview /></RouteAccess>} />
        <Route path="/market-research" element={<RouteAccess route="market-research"><ProductDiscoveryPage /></RouteAccess>} />
        {LEGACY_SHOP_PATHS.map((path) => <Route key={path} path={path} element={<LegacyShopRedirect />} />)}
        {SHOPS.map((shop) => (
          <Route key={shop.key} path={`/${shop.urlId}`}>
            {Object.entries(shop.pages).map(([id, Page]) => {
              const { gated, route } = gateFor(shop, id)
              return (
                <Route
                  key={id}
                  path={id}
                  element={<Suspense fallback={<Spinner />}>{gated ? <RouteAccess route={route}><ShopSectionGate sectionId={id}><Page /></ShopSectionGate></RouteAccess> : <Page />}</Suspense>}
                />
              )
            })}
            {Object.keys(shop.renamedSections || {}).map((old) => <Route key={old} path={old} element={<RenamedSectionRedirect />} />)}
          </Route>
        ))}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sub-admins" element={<AdminOnly><SubAdminManagementPage /></AdminOnly>} />
        <Route path="/sub-admins/new" element={<AdminOnly><SubAdminFormPage /></AdminOnly>} />
        <Route path="/sub-admins/:id/edit" element={<AdminOnly><SubAdminFormPage /></AdminOnly>} />
      </Route>
      <Route path="*" element={<p className="p-8 text-center">404 — Page not found</p>} />
    </Routes>
  )
}
