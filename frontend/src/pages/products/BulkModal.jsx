import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

// Paste a JSON array of products, e.g. [{ "sku": "X-1", "title": "Name", "basePrice": 9.99 }]
export default function BulkModal({ onClose, onSaved }) {
  const { token } = useAuth()
  const [text, setText] = useState('')
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    setBusy(true)
    setError('')
    setResult('')
    try {
      const products = JSON.parse(text)
      const res = await api.post('/api/products/bulk', { products }, token)
      setResult(`Created ${res.created} products`)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Bulk upload" onClose={onClose} wide>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder='[{ "sku": "X-1", "title": "Name", "basePrice": 9.99 }]'
        className="w-full rounded-lg border border-gray-300 p-3 font-mono text-xs focus:border-indigo-500 focus:outline-none"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && <p className="mt-2 text-sm text-green-700">{result}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={upload} disabled={busy || !text}> {busy ? 'Uploading…' : 'Upload'} </Button>
      </div>
    </Modal>
  )
}
