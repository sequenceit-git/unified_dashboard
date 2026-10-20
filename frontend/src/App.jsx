import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
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
import AgentSettingsPage from './pages/support/AgentSettingsPage'
import BuyerChatPage from './pages/support/BuyerChatPage'
import BuyerChat2Page from './pages/support/BuyerChat2Page'
import SellerChatPage from './pages/support/SellerChatPage'

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
        <Route path="/analytics" element={<RouteAccess route="analytics"><AnalyticsPage /></RouteAccess>} />
        <Route path="/market-research" element={<RouteAccess route="market-research"><ProductDiscoveryPage /></RouteAccess>} />
        <Route path="/products" element={<RouteAccess route="products"><ProductsPage /></RouteAccess>} />
        <Route path="/inventory" element={<RouteAccess route="inventory"><InventoryPage /></RouteAccess>} />
        <Route path="/orders" element={<RouteAccess route="orders"><OrdersPage /></RouteAccess>} />
        <Route path="/customers" element={<RouteAccess route="customers"><CustomersPage /></RouteAccess>} />
        <Route path="/inbox" element={<RouteAccess route="inbox"><InboxPage /></RouteAccess>} />
        <Route path="/support/chat-sandbox" element={<Navigate to="/support/buyer-chat" replace />} />
        <Route path="/support/buyer-chat" element={<RouteAccess route="customer-support"><BuyerChatPage /></RouteAccess>} />
        <Route path="/support/buyer-chat-2" element={<RouteAccess route="customer-support"><BuyerChat2Page /></RouteAccess>} />
        <Route path="/support/seller-chat" element={<RouteAccess route="customer-support"><SellerChatPage /></RouteAccess>} />
        <Route path="/support/settings" element={<RouteAccess route="customer-support"><AgentSettingsPage /></RouteAccess>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/sub-admins" element={<AdminOnly><SubAdminManagementPage /></AdminOnly>} />
        <Route path="/sub-admins/new" element={<AdminOnly><SubAdminFormPage /></AdminOnly>} />
        <Route path="/sub-admins/:id/edit" element={<AdminOnly><SubAdminFormPage /></AdminOnly>} />
      </Route>
      <Route path="*" element={<p className="p-8 text-center">404 — Page not found</p>} />
    </Routes>
  )
}
