import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { fallbackShopId } from '../hooks/useShopSection'
import { sameSectionOn } from '../lib/shopRoutes'

/** On a shop page the user can't open: go to the same section of their first shop. */
export default function RequireShopSection() {
  const { pathname } = useLocation()
  const { user, isAdmin } = useAuth()
  const next = fallbackShopId(user, isAdmin)
  const [shop, section = ''] = pathname.split('/').filter(Boolean)
  if (!next || shop === next) {
    return <p className="p-8 text-center text-sm text-gray-500">No shop is assigned to this account.</p>
  }
  // Each shop names its sections itself (eBay listings = Temu goods).
  return <Navigate to={`/${next}/${sameSectionOn(shop, section, next)}`} replace />
}
