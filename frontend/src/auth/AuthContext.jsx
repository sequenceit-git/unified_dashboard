import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

// Dev quick sign-in accounts (seeded). agent1 → eBay, agent2 → Temu, agent3 → TikTok.
export const QUICK_ACCOUNTS = [
  { label: 'Super Admin', email: 'admin@dev.local', role: 'super_admin' },
  { label: 'eBay Agent', email: 'agent1@dev.local', role: 'sub_admin' },
  { label: 'Temu Agent', email: 'agent2@dev.local', role: 'sub_admin' },
  { label: 'TikTok Agent', email: 'agent3@dev.local', role: 'sub_admin' },
]
const QUICK_PASSWORD = 'Temp1234!'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      return null
    }
  })

  const logout = useCallback(() => {
    setToken('')
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }, [])

  useEffect(() => {
    const onExpired = () => logout()
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [logout])

  const save = (t, u) => {
    setToken(t)
    setUser(u)
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }

  const login = async (email, password) => {
    const data = await api.post('/api/auth/login', { email, password })
    save(data.token, data.user)
    return data.user
  }

  const quickLogin = (email) => login(email, QUICK_PASSWORD)
  const hasRoute = (route) => user?.role === 'super_admin' || user?.mainRoutes?.includes(route)

  return (
    <AuthContext.Provider
      value={{ token, user, login, quickLogin, logout, isAdmin: user?.role === 'super_admin', hasRoute }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
