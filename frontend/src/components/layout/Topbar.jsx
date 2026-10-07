import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth()
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
      <button onClick={onMenu} className="rounded p-2 hover:bg-gray-100 lg:hidden" aria-label="Menu">
        ☰
      </button>
      <p className="hidden text-sm text-gray-500 sm:block">eBay · Temu · TikTok Shop</p>
      <div className="flex items-center gap-3">
        <span className="text-sm">
          <span className="font-medium">{user?.name || user?.email}</span>{' '}
          <span className="text-gray-500">({user?.role})</span>
        </span>
        <Button variant="secondary" size="sm" onClick={logout}>
          Logout
        </Button>
      </div>
    </header>
  )
}
