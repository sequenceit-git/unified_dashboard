import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'

// GET helper with loading/error/refetch. Deps array re-triggers the fetch.
export function useApi(path, deps = []) {
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    if (!token || !path) return
    setLoading(true)
    setError('')
    try {
      setData(await api.get(path, token))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, path])

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, ...deps])

  return { data, loading, error, refetch: fetchData }
}
