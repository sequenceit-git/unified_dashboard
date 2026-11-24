/**
 * Temu US compliance: goods with certificates Temu wants, a goods' required certificates (Temu's
 * own status text), certificates on file with Temu's review result, Temu's checks, compliance
 * labels, and uploading a certificate (PDF, JPEG or PNG, up to 10 MB; never stored here).
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { useApi } from '../../../../hooks/useApi'
import { api } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import { Input, Select } from '../../../../components/ui/Input'
import Modal from '../../../../components/ui/Modal'
import { EmptyState, ErrorState, Spinner } from '../../../../components/ui/Feedback'

const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve({ name: file.name, dataUrl: r.result })
  r.onerror = () => reject(new Error(`Could not read ${file.name}`))
  r.readAsDataURL(file)
})

function Detail({ goodsId, title, token, onClose }) {
  const [tick, setTick] = useState(0)
  const res = useApi(`/api/temu/goods/${goodsId}/compliance`, [tick])
  const [certType, setCertType] = useState('')
  const [file, setFile] = useState(null)
  const [expiresOn, setExpiresOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState({ text: '', error: false })
  const d = res.data

  const upload = async () => {
    setBusy(true)
    setNote({ text: '', error: false })
    try {
      const r = await api.post(`/api/temu/goods/${goodsId}/certificates`, { certType: Number(certType), file, ...(expiresOn ? { expiresOn } : {}) }, token)
      setNote({ text: r.message, error: false })
      setFile(null)
      setTick((t) => t + 1)
    } catch (err) {
      setNote({ text: err.message, error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Compliance: ${title}`} wide onClose={onClose}>
      {res.loading && !d ? <Spinner /> : res.error ? <ErrorState message={res.error} /> : d && (
        <div className="space-y-4 text-sm">
          <section>
            <h3 className="mb-1 font-semibold">Certificates Temu asks for</h3>
            {d.required.length ? (
              <ul className="space-y-1">{d.required.map((c) => (
                <li key={c.certType}><span className="font-medium">{c.name}</span>{c.required ? ' (required)' : ''}: {c.status}{c.needs.length ? ` — needs ${c.needs.join(', ')}` : ''}</li>
              ))}</ul>
            ) : <p className="text-gray-500">None for this goods.</p>}
          </section>
          {d.onFile.length > 0 && (
            <section>
              <h3 className="mb-1 font-semibold">Sent to Temu</h3>
              <ul className="space-y-1">{d.onFile.map((c, i) => <li key={i}>{c.name}{c.rejectReason ? <span className="text-red-600"> — rejected: {c.rejectReason}</span> : ''}</li>)}</ul>
            </section>
          )}
          {d.checks.length > 0 && (
            <section>
              <h3 className="mb-1 font-semibold">Temu's checks</h3>
              <ul className="space-y-1">{d.checks.map((c, i) => <li key={i}>{c.name}: {c.result}{c.reason ? ` — ${c.reason}` : ''}</li>)}</ul>
            </section>
          )}
          {d.labels.length > 0 && (
            <section>
              <h3 className="mb-1 font-semibold">Compliance labels</h3>
              <div className="flex flex-wrap gap-2">{d.labels.flatMap((l) => l.images.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Label for SKU ${l.skuId}`} className="h-16 rounded border" /></a>))}</div>
            </section>
          )}
          {d.required.length > 0 && (
            <section className="space-y-2 rounded-lg border p-3">
              <h3 className="font-semibold">Upload a certificate</h3>
              <Select label="Certificate" value={certType} options={d.required.map((c) => ({ value: String(c.certType), label: c.name }))} onChange={(e) => setCertType(e.target.value)} />
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={async (e) => { const f = e.target.files?.[0]; setFile(f ? await readFile(f) : null) }} />
              <Input label="Expires on (if it has an expiry date)" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              {note.text && <p className={note.error ? 'text-red-600' : 'text-emerald-700'}>{note.text}</p>}
              <Button size="sm" disabled={busy || !certType || !file} onClick={upload}>{busy ? 'Sending…' : 'Send to Temu'}</Button>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function ComplianceTab() {
  const { token } = useAuth()
  const res = useApi(token ? '/api/temu/goods/compliance' : null)
  const [open, setOpen] = useState(null)
  if (res.loading && !res.data) return <Spinner />
  if (res.error) return <ErrorState message={res.error} onRetry={res.refetch} />
  const rows = res.data || []
  if (!rows.length) return <EmptyState message="Temu has no compliance items for your goods." />
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500"><th className="p-2">Goods</th><th className="p-2">Certificates</th><th className="p-2" /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.goodsId} className="border-t">
              <td className="p-2"><div className="flex items-center gap-2">{r.image && <img src={r.image} alt="" className="h-8 w-8 rounded object-cover" />}{r.title || r.goodsId}</div></td>
              <td className="p-2">{r.certificates}</td>
              <td className="p-2 text-right"><Button size="sm" variant="secondary" onClick={() => setOpen(r)}>Details</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <Detail goodsId={open.goodsId} title={open.title || open.goodsId} token={token} onClose={() => { setOpen(null); res.refetch() }} />}
    </div>
  )
}
