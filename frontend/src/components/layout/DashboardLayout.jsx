import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function DashboardLayout({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-[100dvh] max-w-full flex-col overflow-x-hidden bg-[#f6f7fb] text-gray-900">
      <Topbar onMenu={() => setOpen(true)} />
      <div className="flex min-h-0 flex-1 max-w-full">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <main className="min-w-0 max-w-full flex-1 overflow-x-hidden p-3 sm:p-5 md:p-6">{children}</main>
      </div>
    </div>
  )
}
