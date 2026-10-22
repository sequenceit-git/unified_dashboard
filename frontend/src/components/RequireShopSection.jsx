import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { fallbackShopId } from '../hooks/useShopSection'

export default function RequireShopSection() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const next = fallbackShopId(user, isAdmin)
  const params = new URLSearchParams(location.search)
  if (!next || params.get('shop') === next) {
    return <p className="p-8 text-center text-sm text-gray-500">No shop is assigned to this account.</p>
  }
  params.set('shop', next)
  return <Navigate to={`${location.pathname}?${params.toString()}`} replace />
}
