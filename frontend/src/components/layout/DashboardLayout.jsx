import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function DashboardLayout({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-screen bg-transparent text-gray-900">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-7 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
