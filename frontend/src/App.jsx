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

function PublicOnly({ children }) {
  const { token } = useAuth()
  if (token) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Overview />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/inbox" element={<InboxPage />} />
      </Route>
      <Route path="*" element={<p className="p-8 text-center">404 — Page not found</p>} />
    </Routes>
  )
}
