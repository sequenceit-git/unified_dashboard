import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'

// GET helper with loading/error/refetch. Deps array re-triggers the fetch.
export function useApi(path, deps = []) {
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(token && path))
  const [error, setError] = useState('')
  const [reloadTick, setReloadTick] = useState(0)

  const refetch = useCallback(() => {
    setReloadTick((t) => t + 1)
  }, [])

  useEffect(() => {
    let ignore = false

    const run = async () => {
      if (!token || !path) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const res = await api.get(path, token)
        if (!ignore) setData(res)
      } catch (e) {
        if (!ignore) setError(e.message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    run()

    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, path, reloadTick, ...deps])

  return { data, loading, error, refetch }
}

