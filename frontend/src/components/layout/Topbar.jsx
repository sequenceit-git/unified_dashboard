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
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-4 text-[#0F172A] sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={onMenu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden" aria-label="Menu">
          <FiMenu size={18} />
        </button>
        <div className="flex min-w-0 items-center gap-2.5 overflow-visible">
          <img src="/favicon.svg" alt="EcomPilot" className="h-8 w-8 shrink-0 rounded-lg shadow-sm ring-1 ring-slate-200/60" />
          <span className="inline-block -skew-x-2 overflow-visible pl-1 pr-3 text-2xl font-black italic tracking-tight text-black" style={{ fontSynthesis: 'style', WebkitTextStroke: '0.6px black' }}><span className="text-[#4F46E5]" style={{ WebkitTextStroke: '0.6px #4F46E5' }}>E</span>comPilot</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          title="Notifications (coming soon)"
          aria-label="Notifications"
          className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <FiBell size={18} />
        </button>
        <button
          type="button"
          title="Settings (coming soon)"
          aria-label="Settings"
          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <FiSettings size={18} />
        </button>
        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <span className="hidden text-right text-sm sm:block">
          <span className="block max-w-40 truncate font-semibold leading-tight text-slate-900">{user?.name || user?.email}</span>
          <span className="text-xs text-slate-500">{formatRole(user?.role)}</span>
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">
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
