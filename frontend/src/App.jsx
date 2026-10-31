import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ShopSectionGate from './components/ShopSectionGate'
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
        <Route path="/analytics" element={<RouteAccess route="analytics"><ShopSectionGate sectionId="analytics"><AnalyticsPage /></ShopSectionGate></RouteAccess>} />
        <Route path="/market-research" element={<RouteAccess route="market-research"><ProductDiscoveryPage /></RouteAccess>} />
        <Route path="/products" element={<RouteAccess route="products"><ShopSectionGate sectionId="products"><ProductsPage /></ShopSectionGate></RouteAccess>} />
        <Route path="/inventory" element={<RouteAccess route="inventory"><ShopSectionGate sectionId="inventory"><InventoryPage /></ShopSectionGate></RouteAccess>} />
        <Route path="/orders" element={<RouteAccess route="orders"><ShopSectionGate sectionId="orders"><OrdersPage /></ShopSectionGate></RouteAccess>} />
        <Route path="/customers" element={<RouteAccess route="customers"><ShopSectionGate sectionId="customers"><CustomersPage /></ShopSectionGate></RouteAccess>} />
        <Route path="/inbox" element={<RouteAccess route="inbox"><ShopSectionGate sectionId="inbox"><InboxPage /></ShopSectionGate></RouteAccess>} />
        <Route path="/shop/:sectionId" element={<ShopSectionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sub-admins" element={<AdminOnly><SubAdminManagementPage /></AdminOnly>} />
        <Route path="/sub-admins/new" element={<AdminOnly><SubAdminFormPage /></AdminOnly>} />
        <Route path="/sub-admins/:id/edit" element={<AdminOnly><SubAdminFormPage /></AdminOnly>} />
      </Route>
      <Route path="*" element={<p className="p-8 text-center">404 — Page not found</p>} />
    </Routes>
  )
}
