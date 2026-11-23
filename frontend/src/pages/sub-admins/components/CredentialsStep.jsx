/** Step 2 of the sub-admin form: name, email, username and password. */
import Card from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'

export default function CredentialsStep({ ctx }) {
  const { editing, name, password, setName, setPassword, setStatus, setUsername, status, username } = ctx
  return (
    <>
      <Card>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Step 2
            </p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Account Credentials</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Login identity and account activation state.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Jenkins"
              required
            />
            <Input
              label="Username / Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. sarah.jenkins@company.com or sjenkins"
              autoComplete="off"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={editing ? 'Password (leave blank to keep current)' : 'Password'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editing ? '••••••••' : 'Min 8 characters'}
              autoComplete="new-password"
              required={!editing}
            />

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Account Status
              </label>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStatus('active')}
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                    status === 'active'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-600 dark:text-emerald-300'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-400'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Active (Allowed login)
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('disabled')}
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                    status === 'disabled'
                      ? 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:border-rose-600 dark:text-rose-300'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-400'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Suspended (Blocked)
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}
