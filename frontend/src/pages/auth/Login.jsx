import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QUICK_ACCOUNTS, useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

export default function Login() {
  const { login, quickLogin } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const done = () => navigate('/', { replace: true })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      done()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const quick = async (accountEmail) => {
    setBusy(true)
    setError('')
    try {
      await quickLogin(accountEmail)
      done()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent p-4 sm:p-6">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-7 text-center">
          <span className="inline-block -skew-x-2 overflow-visible pl-1 pr-3 text-4xl font-black italic tracking-tight text-black" style={{ fontSynthesis: 'style', WebkitTextStroke: '0.6px black' }}><span className="text-[#4F46E5]" style={{ WebkitTextStroke: '0.6px #4F46E5' }}>E</span>comPilot</span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your EcomPilot workspace</p>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-7 border-t border-gray-200 pt-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Developer access</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {QUICK_ACCOUNTS.map((a) => (
              <Button key={a.email} variant="secondary" size="sm" disabled={busy} onClick={() => quick(a.email)}>
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
