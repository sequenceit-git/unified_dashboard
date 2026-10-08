import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AnalyticsPage from './pages/AnalyticsPage'
import CustomersPage from './pages/CustomersPage'
import InboxPage from './pages/InboxPage'
import InventoryPage from './pages/InventoryPage'
import Login from './pages/Login'
import OrdersPage from './pages/OrdersPage'
import Overview from './pages/Overview'
import ProductsPage from './pages/ProductsPage'
import SubAdminFormPage from './pages/SubAdminFormPage'
import SubAdminManagementPage from './pages/SubAdminManagementPage'

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
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RouteAccess route="dashboard"><Overview /></RouteAccess>} />
        <Route path="/analytics" element={<RouteAccess route="analytics"><AnalyticsPage /></RouteAccess>} />
        <Route path="/products" element={<RouteAccess route="products"><ProductsPage /></RouteAccess>} />
        <Route path="/inventory" element={<RouteAccess route="inventory"><InventoryPage /></RouteAccess>} />
        <Route path="/orders" element={<RouteAccess route="orders"><OrdersPage /></RouteAccess>} />
        <Route path="/customers" element={<RouteAccess route="customers"><CustomersPage /></RouteAccess>} />
        <Route path="/inbox" element={<RouteAccess route="inbox"><InboxPage /></RouteAccess>} />
        <Route path="/sub-admins" element={<AdminOnly><SubAdminManagementPage /></AdminOnly>} />
        <Route path="/sub-admins/new" element={<AdminOnly><SubAdminFormPage /></AdminOnly>} />
        <Route path="/sub-admins/:id/edit" element={<AdminOnly><SubAdminFormPage /></AdminOnly>} />
      </Route>
      <Route path="*" element={<p className="p-8 text-center">404 — Page not found</p>} />
    </Routes>
  )
}
