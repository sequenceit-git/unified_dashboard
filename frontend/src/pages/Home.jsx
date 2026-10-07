import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Home() {
  const [status, setStatus] = useState('Checking backend…')

  useEffect(() => {
    api
      .get('/api/health')
      .then((d) => setStatus(d.message || 'Backend connected'))
      .catch(() => setStatus('Backend not reachable'))
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">React + Express + Mongo</h1>
      <p className="text-gray-600">
        Frontend is running with React Router, Tailwind CSS, and a proxied API.
      </p>
      <p className="rounded bg-white p-3 text-sm shadow">
        API status: <span className="font-mono font-semibold">{status}</span>
      </p>
    </div>
  )
}
