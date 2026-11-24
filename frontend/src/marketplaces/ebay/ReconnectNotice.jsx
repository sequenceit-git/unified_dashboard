/** Tells a shop connected before eBay's newer scopes which features a reconnect turns on. */
import { Link } from 'react-router-dom'
import { useShopProfile } from '../../hooks/useShopProfiles'

export default function ReconnectNotice() {
  const { profile } = useShopProfile('ebay')
  const missing = profile?.missingScopes || []
  if (!profile?.connected || missing.length === 0) return null
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      Reconnect eBay in <Link to="/settings" className="font-medium underline">Settings</Link> to turn on: {missing.map((m) => m.feature).join(', ')}.
    </p>
  )
}
