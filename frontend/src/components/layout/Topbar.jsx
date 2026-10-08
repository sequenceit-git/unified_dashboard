import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth()
  return (
    <header className="flex items-center justify-between border-b border-gray-200/80 bg-white/80 px-4 py-3.5 backdrop-blur sm:px-7 lg:px-8">
      <button onClick={onMenu} className="rounded-lg p-2 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 lg:hidden" aria-label="Menu">
        ☰
      </button>
      <p className="hidden text-sm font-medium text-gray-500 sm:block">Multi-channel commerce, simplified</p>
      <div className="flex items-center gap-3">
        <span className="hidden text-right text-sm sm:block">
          <span className="block font-semibold">{user?.name || user?.email}</span>
          <span className="text-xs text-gray-500">{user?.role}</span>
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
          {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
        </span>
        <Button variant="secondary" size="sm" onClick={logout}>
          Logout
        </Button>
      </div>
    </header>
  )
}
