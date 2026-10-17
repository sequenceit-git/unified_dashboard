import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import { canonicalShopMarketplace } from '../../lib/shops'
import { Spinner } from '../../components/ui/Feedback'

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const [error, setError] = useState('')

  const { marketplace: marketplaceParam } = useParams()
  const code = searchParams.get('code')
  const marketplace = canonicalShopMarketplace(marketplaceParam)

  useEffect(() => {
    async function exchange() {
      if (!code) {
        setError('No authorization code was returned by the marketplace.')
        return
      }

      try {
        await api.post(`/api/shops/oauth/callback/${marketplace}`, { code }, token)
        navigate(`/settings?connected=${marketplace}`, { replace: true })
      } catch (err) {
        setError(err.message || 'Failed to exchange authorization code')
      }
    }

    exchange()
  }, [code, marketplace, navigate, token])

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-md">
          <h2 className="text-lg font-bold text-red-800">Connection Failed</h2>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <button
            onClick={() => navigate('/settings')}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner />
      <p className="text-sm font-medium text-gray-600">Connecting your marketplace store…</p>
    </div>
  )
}
