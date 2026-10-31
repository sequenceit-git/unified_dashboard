import { useShopSection } from '../hooks/useShopSection'
import { useShopProfile } from '../hooks/useShopProfiles'
import { EmptyState } from './ui/Feedback'

/** Hides a shop page when the selected shop doesn't have that section or can't reach its API. */
export default function ShopSectionGate({ sectionId, children }) {
  const shopSection = useShopSection()
  const { profile } = useShopProfile(shopSection?.marketplace)
  if (!shopSection || !profile) return children
  const section = profile.sections.find((item) => item.id === sectionId)
  if (!section) return <EmptyState message={`${profile.label} doesn't have this section.`} />
  if (section.available === false) {
    return <EmptyState message={`${section.label} isn't available for ${profile.label}: ${section.reason}.`} />
  }
  return children
}
