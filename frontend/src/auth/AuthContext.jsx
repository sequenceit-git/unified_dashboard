import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

// Dev quick sign-in accounts (disabled in production).
export const QUICK_ACCOUNTS = []
const QUICK_PASSWORD = ''

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
    try {
      sessionStorage.removeItem('shop-profiles:v1')
    } catch {
      // Ignore storage errors.
    }
  }, [])

  useEffect(() => {
    const onExpired = () => logout()
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [logout])

  useEffect(() => {
    if (!token) return
    let active = true
    api.get('/api/auth/me', token)
      .then((freshUser) => {
        if (!active || !freshUser) return
        setUser(freshUser)
        try {
          localStorage.setItem('user', JSON.stringify(freshUser))
        } catch {
          // Ignore storage errors.
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [token])

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
