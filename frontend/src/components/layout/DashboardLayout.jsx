import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function DashboardLayout({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7fb] text-gray-900">
      <Topbar onMenu={() => setOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
