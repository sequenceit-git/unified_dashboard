import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { useLiveEvents } from './useLiveEvents'

export function useNotifications() {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    try {
      const data = await api.get('/api/notifications', token)
      setItems(data.items || [])
      setUnread(data.unread || 0)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  useLiveEvents((event) => {
    if (event.type === 'notification' || (event.type === 'sync' && (event.newMessages || !event.ok))) {
      load()
    }
  })

  const markRead = useCallback(async (id) => {
    if (!token || !id) return
    setItems((rows) => rows.map((row) => (row._id === id ? { ...row, isRead: true } : row)))
    setUnread((count) => Math.max(0, count - 1))
    try {
      await api.patch(`/api/notifications/${id}/read`, {}, token)
    } catch {
      load()
    }
  }, [token, load])

  const markAllRead = useCallback(async () => {
    if (!token) return
    setItems((rows) => rows.map((row) => ({ ...row, isRead: true })))
    setUnread(0)
    try {
      await api.post('/api/notifications/read-all', {}, token)
    } catch {
      load()
    }
  }, [token, load])

  return { items, unread, error, load, markRead, markAllRead }
}
