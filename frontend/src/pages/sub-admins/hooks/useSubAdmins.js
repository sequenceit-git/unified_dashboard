/** Sub-admin list state: loading, filters, counts, suspend and delete (moved from SubAdminManagementPage). */
import { useState, useMemo } from 'react'
import { KEYS } from '../../../marketplaces'
import { useAuth } from '../../../auth/AuthContext'
import { api } from '../../../lib/api'
import { useApi } from '../../../hooks/useApi'
import { marketsOf } from '../subAdminShared'

export function useSubAdmins() {
  const { token } = useAuth()
  const usersRes = useApi(token ? '/api/auth/users' : null)
  const users = useMemo(() => (Array.isArray(usersRes.data) ? usersRes.data : []), [usersRes.data])

  const [search, setSearch] = useState('')
  const [shopFilter, setShopFilter] = useState('all') // 'all' | 'ebay' | 'tiktok_shop' | 'temu'
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'active' | 'disabled'
  const [editingAccessUser, setEditingAccessUser] = useState(null)
  const [deletingUser, setDeletingUser] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [successBanner, setSuccessBanner] = useState('')
  const [togglingId, setTogglingId] = useState(null)

  const handleConfirmDelete = async () => {
    if (!deletingUser) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.del(`/api/auth/users/${deletingUser._id}`, token)
      const name = deletingUser.name
      setDeletingUser(null)
      setSuccessBanner(`Sub-admin "${name}" has been permanently deleted.`)
      setTimeout(() => setSuccessBanner(''), 5000)
      await usersRes.refetch()
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete sub-admin')
    } finally {
      setDeleteBusy(false)
    }
  }

  // Status toggle handler
  const handleToggleStatus = async (user) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    setTogglingId(user._id)
    try {
      await api.patch(`/api/auth/users/${user._id}`, { status: nextStatus }, token)
      usersRes.refetch()
    } catch (err) {
      alert(`Could not update status: ${err.message}`)
    } finally {
      setTogglingId(null)
    }
  }

  // Filter & search computation
  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return []
    return users.filter((u) => {
      if (!u) return false

      // 1. Shop filter (supports multi-shop sub-admins)
      if (shopFilter !== 'all' && !marketsOf(u).includes(shopFilter)) {
        return false
      }

      // 2. Status filter
      if (statusFilter !== 'all' && (u.status || 'active') !== statusFilter) {
        return false
      }

      // 3. Search query
      if (search && search.trim()) {
        const q = search.trim().toLowerCase()
        const nameMatch = u.name?.toLowerCase().includes(q)
        const usernameMatch = u.username?.toLowerCase().includes(q)
        const emailMatch = u.email?.toLowerCase().includes(q)
        if (!nameMatch && !usernameMatch && !emailMatch) return false
      }
      return true
    })
  }, [users, search, shopFilter, statusFilter])

  // Aggregate counts per shop & status
  const counts = useMemo(() => {
    const byShop = Object.fromEntries(KEYS.map((key) => [key, 0]))
    if (!Array.isArray(users)) return { total: 0, active: 0, suspended: 0, byShop }
    let active = 0
    let suspended = 0

    users.forEach((u) => {
      const isAct = (u?.status || 'active') === 'active'
      if (isAct) active += 1
      else suspended += 1

      for (const market of marketsOf(u)) {
        if (market in byShop) byShop[market] += 1
      }
    })

    return { total: users.length, active, suspended, byShop }
  }, [users])

  return {
    token,
    usersRes,
    users,
    search,
    setSearch,
    shopFilter,
    setShopFilter,
    statusFilter,
    setStatusFilter,
    editingAccessUser,
    setEditingAccessUser,
    deletingUser,
    setDeletingUser,
    deleteBusy,
    setDeleteBusy,
    deleteError,
    setDeleteError,
    successBanner,
    setSuccessBanner,
    togglingId,
    setTogglingId,
    handleConfirmDelete,
    handleToggleStatus,
    filteredUsers,
    counts,
  }
}
