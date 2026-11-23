import { useEffect, useState } from 'react'
import { useAuth } from '../../../../../auth/AuthContext'
import { api } from '../../../../../lib/api'
import { Select } from '../../../../../components/ui/Input'
import { readFileAsDataUrl } from './rules'

/** TikTok Shop size chart picker (saved template or image upload) when supported/required by category. */
export default function SizeChartField({ shopId, rules, value, onChange }) {
  const { token } = useAuth()
  const [templates, setTemplates] = useState([])
  const [error, setError] = useState('')
  const supported = Boolean(rules?.sizeChart?.supported || rules?.sizeChart?.required)
  const required = Boolean(rules?.sizeChart?.required)

  useEffect(() => {
    if (!shopId || !supported) return undefined
    let cancelled = false
    api.get(`/api/tiktok/shops/${shopId}/size-charts`, token)
      .then((list) => {
        if (!cancelled) setTemplates(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setTemplates([])
      })
    return () => { cancelled = true }
  }, [shopId, supported, token])

  if (!supported) return null

  const templateId = String(value?.templateId || '')
  const image = String(value?.image || '')

  const handleImage = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      onChange({ templateId: '', image: dataUrl })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-800 dark:text-slate-100">
            Size chart{required ? ' *' : ' (optional)'}
          </p>
          <p className="text-[11px] text-gray-600 dark:text-slate-400">
            Select a Seller Center size chart template or upload a size chart image (min 1024px on shorter side recommended).
          </p>
        </div>
        {(templateId || image) && (
          <button
            type="button"
            onClick={() => onChange({ templateId: '', image: '' })}
            className="text-[11px] font-medium text-red-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {templates.length > 0 && (
        <Select
          label="Seller Center size chart template"
          value={templateId}
          onChange={(e) => onChange({ templateId: e.target.value, image: e.target.value ? '' : image })}
          options={[
            { value: '', label: 'Use uploaded image instead…' },
            ...templates.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
      )}

      {!templateId && (
        <div className="space-y-1.5">
          <label className="block text-xs text-gray-700 dark:text-slate-300">
            <span className="font-semibold">Upload size chart image</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImage}
              className="mt-1 block w-full text-xs text-gray-600 dark:text-slate-300"
            />
          </label>
          {image && (
            <img
              src={image}
              alt="Size chart preview"
              className="max-h-32 rounded-md border border-gray-200 bg-white object-contain p-1 dark:border-slate-700"
            />
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
