import { Input } from '../ui/Input'

export function certificationNeeded(rule, aspects, schema) {
  if (!rule) return false
  if (rule.required) return true
  return (rule.conditions || []).some((condition) => {
    const attr = (schema || []).find((item) => item.id === condition.attributeId)
    const chosen = aspects?.[condition.attributeId]
    return attr && chosen && attr.valueIds?.[chosen] === condition.valueId
  })
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

/** Image or PDF uploads for certifications TikTok requires on this category. */
export default function CertificationFields({ rules, aspects, schema, files, onChange }) {
  const needed = (rules || []).filter((rule) => certificationNeeded(rule, aspects, schema))
  if (!needed.length) return null
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div>
        <p className="text-xs font-semibold text-gray-800">Certifications required by TikTok</p>
        <p className="text-[11px] text-gray-600">Upload a JPG, PNG, WEBP, or PDF for each document. TikTok rejects the listing without them.</p>
      </div>
      {needed.map((rule) => {
        const file = files?.[rule.id]
        return (
          <label key={rule.id} className="block text-xs text-gray-700">
            <span className="font-semibold">{rule.name} *</span>
            {rule.documentDetails && <span className="mt-0.5 block text-[11px] text-gray-500">{rule.documentDetails}</span>}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="mt-1 block w-full text-xs"
              onChange={async (event) => {
                const picked = event.target.files?.[0]
                if (!picked) return
                onChange(rule.id, { ...(file || {}), name: picked.name, file: await readFile(picked) })
              }}
            />
            {file?.name && <span className="mt-1 block text-[11px] text-emerald-700">{file.name} ready</span>}
            {rule.sampleImageUrl && (
              <a href={rule.sampleImageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-semibold text-indigo-600 hover:underline">
                View a sample
              </a>
            )}
            {rule.expirationRequired && (
              <Input
                label="Expiration date"
                type="date"
                value={file?.expirationDate || ''}
                onChange={(event) => onChange(rule.id, { ...(file || {}), expirationDate: event.target.value })}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}

export function certificationPayload(rules, aspects, schema, files) {
  return (rules || [])
    .filter((rule) => certificationNeeded(rule, aspects, schema))
    .filter((rule) => files?.[rule.id]?.file)
    .map((rule) => ({
      id: rule.id,
      name: files[rule.id].name || rule.name,
      file: files[rule.id].file,
      ...(files[rule.id].expirationDate ? { expirationDate: files[rule.id].expirationDate } : {}),
    }))
}
