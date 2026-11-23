import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { fallbackShopId } from '../hooks/useShopSection'
import { shopSectionFromId } from '../lib/shops'

/**
 * Old shop URLs (/orders?shop=ebay, /shop/returns?shop=tiktok) → /<shop>/<section>.
 * Without ?shop the user's first shop is used. Keeps bookmarks and older notification links working.
 */
export default function LegacyShopRedirect() {
  const { pathname, search } = useLocation()
  const { sectionId } = useParams()
  const { user, isAdmin } = useAuth()
  const params = new URLSearchParams(search)
  const section = sectionId || pathname.split('/').filter(Boolean)[0]
  const shop = shopSectionFromId(params.get('shop'))?.id || fallbackShopId(user, isAdmin)
  if (!shop) return <p className="p-8 text-center text-sm text-gray-500">No shop is assigned to this account.</p>
  params.delete('shop')
  const rest = params.toString()
  return <Navigate to={`/${shop}/${section}${rest ? `?${rest}` : ''}`} replace />
}
