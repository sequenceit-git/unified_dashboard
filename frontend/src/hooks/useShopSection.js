import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { SHOP_SECTIONS, shopSectionFromId } from '../lib/shops'

export function allowedShopSections(user, isAdmin) {
  if (isAdmin || !Array.isArray(user?.marketplaces)) return SHOP_SECTIONS
  return SHOP_SECTIONS.filter((section) => user.marketplaces.includes(section.marketplace))
}

export function fallbackShopId(user, isAdmin) {
  return allowedShopSections(user, isAdmin)[0]?.id || ''
}

export function useShopSection() {
  const { pathname } = useLocation()
  const { user, isAdmin } = useAuth()
  // Shop pages live at /<shop>/<section>.
  const section = shopSectionFromId(pathname.split('/')[1])
  if (!section) return null
  return allowedShopSections(user, isAdmin).some((item) => item.id === section.id) ? section : null
}
