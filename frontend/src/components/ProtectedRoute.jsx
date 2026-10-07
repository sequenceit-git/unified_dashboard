import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import DashboardLayout from './layout/DashboardLayout'

export default function ProtectedRoute() {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  )
}
