/**
 * Live TikTok Product Optimization panel inside ProductModal for listed products:
 * shows title suggestions from TikTok and runs live diagnose_optimize checks on title & description.
 */
import { useState } from 'react'
import { useAuth } from '../../../../../auth/AuthContext'
import { api, queryString } from '../../../../../lib/api'
import Button from '../../../../../components/ui/Button'

export default function TikTokOptimizePanel({ productId, title, description, onApplyTitle }) {
  const { token } = useAuth()
  const [busy, setBusy] = useState(false)
  const [diag, setDiag] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [err, setErr] = useState('')

  if (!productId) return null

  const runCheck = async () => {
    setBusy(true)
    setErr('')
    try {
      const [detailRes, draftRes] = await Promise.all([
        api.get(`/api/tiktok/sections/products/diagnosis${queryString({ id: productId })}`, token).catch(() => null),
        api.post('/api/tiktok/sections/products/diagnose-draft', {
          id: productId,
          value: { title, description },
        }, token),
      ])
      setSuggestions(detailRes?.suggestedTitles || [])
      setDiag(draftRes)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 text-xs space-y-2 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-indigo-900 dark:text-indigo-200">TikTok Listing Optimization</span>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={runCheck}>
          {busy ? 'Checking…' : 'Diagnose & suggest'}
        </Button>
      </div>
      {err && <p className="text-rose-600">{err}</p>}
      {diag && (
        <div className="space-y-1.5">
          <p className="font-medium text-gray-700 dark:text-slate-200">{diag.message}</p>
          {diag.diagnoses?.map((d, idx) => (
            <div key={idx} className="text-amber-800 dark:text-amber-300">
              <span className="font-semibold">{d.field}:</span> {d.issues?.join('; ')}
            </div>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="space-y-1">
          <p className="font-semibold text-gray-600 dark:text-slate-300">TikTok title suggestions (click to apply):</p>
          <div className="flex flex-col gap-1">
            {suggestions.map((text, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onApplyTitle?.(text)}
                className="rounded border border-indigo-200 bg-white px-2 py-1 text-left text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
