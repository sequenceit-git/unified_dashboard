import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function DashboardLayout({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
