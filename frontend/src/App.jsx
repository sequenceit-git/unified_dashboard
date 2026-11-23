import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ShopSectionGate from './components/ShopSectionGate'
import LegacyShopRedirect from './components/LegacyShopRedirect'
import { SHOPS } from './marketplaces'
import ShopSectionPage from './pages/shop/ShopSectionPage'
import AnalyticsPage from './pages/analytics/AnalyticsPage'
import CustomersPage from './pages/customers/CustomersPage'
import InboxPage from './pages/inbox/InboxPage'
import InventoryPage from './pages/inventory/InventoryPage'
import Login from './pages/auth/Login'
import OrdersPage from './pages/orders/OrdersPage'
import Overview from './pages/dashboard/Overview'
import ProductDiscoveryPage from './pages/discovery/ProductDiscoveryPage'
import ProductsPage from './pages/products/ProductsPage'
import OAuthCallback from './pages/auth/OAuthCallback'
import SettingsPage from './pages/settings/SettingsPage'
import SubAdminFormPage from './pages/sub-admins/SubAdminFormPage'
import SubAdminManagementPage from './pages/sub-admins/SubAdminManagementPage'

/** Shop pages with their own route; other sections render through ShopSectionPage. */
const SHOP_PAGES = {
  analytics: AnalyticsPage,
  products: ProductsPage,
  inventory: InventoryPage,
  orders: OrdersPage,
  customers: CustomersPage,
  inbox: InboxPage,
}
const LEGACY_SHOP_PATHS = [...Object.keys(SHOP_PAGES).map((id) => `/${id}`), '/shop/:sectionId']

function PublicOnly({ children }) {
  const { token } = useAuth()
  if (token) return <Navigate to="/" replace />
  return children
}

function RouteAccess({ route, children }) {
  const { hasRoute, user } = useAuth()
  if (hasRoute(route)) return children
  const firstRoute = user?.mainRoutes?.find((name) => name !== route)
  if (firstRoute) return <Navigate to={`/${firstRoute === 'dashboard' ? '' : firstRoute}`} replace />
  return <p className="p-8 text-center">No application sections have been assigned to this account.</p>
}

function AdminOnly({ children }) {
  const { isAdmin } = useAuth()
  return isAdmin ? children : <Navigate to="/" replace />
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
            {Object.entries(SHOP_PAGES).map(([id, Page]) => (
              <Route key={id} path={id} element={<RouteAccess route={id}><ShopSectionGate sectionId={id}><Page /></ShopSectionGate></RouteAccess>} />
            ))}
            <Route path=":sectionId" element={<ShopSectionPage />} />
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
