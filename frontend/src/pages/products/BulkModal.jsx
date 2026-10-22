import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

const REQUIRED = ['sku', 'title']
const NUMERIC = ['basePrice', 'costPrice', 'stock', 'lowStockThreshold', 'weight']

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (const char of text.replace(/^\uFEFF/, '')) {
    if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (cell || row.length) { row.push(cell.trim()); rows.push(row); row = []; cell = '' }
    } else cell += char
  }
  if (quoted) throw new Error('CSV contains an unclosed quote')
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  if (rows.length < 2) throw new Error('CSV must include a header row and at least one product row')
  const headers = rows[0].map((header) => header.toLowerCase())
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

export default function BulkModal({ onClose, onSaved }) {
  const { token } = useAuth()
  const [products, setProducts] = useState([])
  const [fileName, setFileName] = useState('')
  const [validation, setValidation] = useState([])
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    setBusy(true)
    setError('')
    setResult('')
    try {
      const res = await api.post('/api/products/bulk', { products }, token)
      setResult(`Created ${res.created} products`)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const loadFile = (file) => {
    if (!file) return
    setError('')
    setResult('')
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result))
        const seen = new Set()
        const errors = []
        const normalized = parsed.map((item, index) => {
          const rowNumber = index + 2
          const rowErrors = REQUIRED.filter((key) => !item[key]).map((key) => `${key} is required`)
          NUMERIC.forEach((key) => {
            if (item[key] !== '' && !Number.isFinite(Number(item[key]))) rowErrors.push(`${key} must be numeric`)
          })
          if (item.sku && seen.has(item.sku)) rowErrors.push('duplicate SKU')
          if (item.sku) seen.add(item.sku)
          if (rowErrors.length) errors.push(`Row ${rowNumber}: ${rowErrors.join(', ')}`)
          return {
            ...item,
            ...Object.fromEntries(NUMERIC.filter((key) => item[key] !== '').map((key) => [key, Number(item[key])])),
          }
        })
        setProducts(normalized)
        setValidation(errors)
        if (errors.length) setError(`${errors.length} row(s) need correction before upload`)
      } catch (err) {
        setProducts([])
        setValidation([])
        setError(err.message)
      }
    }
    reader.readAsText(file)
  }

  return (
    <Modal title="Bulk upload" onClose={onClose} wide>
      <input type="file" accept=".csv,text/csv" onChange={(e) => loadFile(e.target.files?.[0])} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
      <p className="mt-2 text-xs text-gray-500">CSV columns: sku, title, description, category, brand, basePrice, costPrice, stock, lowStockThreshold, status, images, weight. costPrice is the base price. Profit is basePrice minus costPrice.</p>
      {fileName && <p className="mt-2 text-sm">Selected: <strong>{fileName}</strong> · {products.length} rows</p>}
      {validation.length > 0 && <ul className="mt-2 max-h-32 overflow-y-auto rounded bg-red-50 p-2 text-xs text-red-700">{validation.slice(0, 20).map((item) => <li key={item}>{item}</li>)}</ul>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && <p className="mt-2 text-sm text-green-700">{result}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={upload} disabled={busy || !products.length || validation.length > 0}> {busy ? 'Uploading…' : 'Upload'} </Button>
      </div>
    </Modal>
  )
}
