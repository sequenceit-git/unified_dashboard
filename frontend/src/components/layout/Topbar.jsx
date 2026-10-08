import { FiBell, FiLogOut, FiMenu, FiSettings } from 'react-icons/fi'
import { useAuth } from '../../auth/AuthContext'
import Button from '../ui/Button'

function formatRole(role) {
  if (role === 'super_admin') return 'Super Admin'
  if (role === 'sub_admin') return 'Sub Admin'
  return role || ''
}

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth()
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#171b35] px-4 text-white sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={onMenu} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Menu">
          <FiMenu size={18} />
        </button>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500 text-xs font-black text-white">EP</span>
          <span className="truncate text-[15px] font-bold tracking-tight text-white">EcomPilotPro</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          title="Notifications (coming soon)"
          aria-label="Notifications"
          className="relative rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <FiBell size={18} />
        </button>
        <button
          type="button"
          title="Settings (coming soon)"
          aria-label="Settings"
          className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <FiSettings size={18} />
        </button>
        <span className="mx-1 hidden h-6 w-px bg-white/15 sm:block" aria-hidden="true" />
        <span className="hidden text-right text-sm sm:block">
          <span className="block max-w-40 truncate font-semibold leading-tight text-white">{user?.name || user?.email}</span>
          <span className="text-xs text-slate-400">{formatRole(user?.role)}</span>
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-500 text-xs font-bold text-white">
          {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
        </span>
        <Button variant="secondary" size="sm" onClick={logout} className="flex items-center gap-1.5">
          <FiLogOut size={14} />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  )
}
