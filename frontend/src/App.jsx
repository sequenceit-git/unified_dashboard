import { Link, Route, Routes } from 'react-router-dom'
import About from './pages/About'
import Home from './pages/Home'

function Navbar() {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-lg font-bold text-gray-900">
          MERN Starter
        </Link>
        <div className="flex gap-4 text-sm font-medium">
          <Link to="/" className="text-gray-600 hover:text-black">
            Home
          </Link>
          <Link to="/about" className="text-gray-600 hover:text-black">
            About
          </Link>
        </div>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route
            path="*"
            element={<p className="text-center">404 — Page not found</p>}
          />
        </Routes>
      </main>
    </div>
  )
}
