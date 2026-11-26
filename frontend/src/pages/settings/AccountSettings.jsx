import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { api } from '../../lib/api'

const MIN_PASSWORD = 8

/** The signed-in user's own sign-in email and password. */
export default function AccountSettings() {
  const { token, user, setCurrentUser } = useAuth()
  const currentEmail = user?.email || user?.username || ''
  const [email, setEmail] = useState(currentEmail)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(false)

  useEffect(() => { setEmail(currentEmail) }, [currentEmail])

  const fail = (text) => {
    setMessage(text)
    setMessageError(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextEmail = email.trim().toLowerCase()
    const emailChanged = nextEmail !== currentEmail.toLowerCase()
    if (!nextEmail) return fail('Enter an email.')
    if (!emailChanged && !newPassword) return fail('Change the email or enter a new password.')
    if (newPassword && newPassword.length < MIN_PASSWORD) return fail(`New password must be at least ${MIN_PASSWORD} characters.`)
    if (newPassword !== confirmPassword) return fail('The new passwords do not match.')
    if (!currentPassword) return fail('Enter your current password to confirm.')

    setSaving(true)
    setMessage('')
    try {
      const updated = await api.patch('/api/auth/me', {
        currentPassword,
        ...(emailChanged ? { email: nextEmail } : {}),
        ...(newPassword ? { newPassword } : {}),
      }, token)
      setCurrentUser(updated)
      setNewPassword('')
      setConfirmPassword('')
      setCurrentPassword('')
      setMessage(emailChanged && newPassword
        ? 'Email and password updated.'
        : emailChanged ? 'Email updated. Use it next time you sign in.' : 'Password updated.')
      setMessageError(false)
    } catch (err) {
      fail(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Account</h2>
          <p className="mt-1 text-sm text-gray-500">Change the email and password you sign in with.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Sign-in email"
            type="text"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <div className="hidden md:block" />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Leave blank to keep the current one"
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Required to save changes"
          />
        </div>

        {message && (
          <p className={`text-sm font-semibold ${messageError ? 'text-red-600' : 'text-emerald-700'}`}>{message}</p>
        )}

        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save account'}</Button>
      </form>
    </Card>
  )
}
