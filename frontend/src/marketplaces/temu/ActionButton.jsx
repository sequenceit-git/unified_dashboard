/**
 * A Temu row or table action from the section loader: `{ id, label, confirm?, input?, detail? }`.
 * `detail` opens a read-only view; others post to Temu through the dashboard. Confirm/input steps
 * open the app Modal; when the request fails the dialog stays open with what was entered, and the
 * error shows inside it.
 */
import { useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { actionState } from './actionState'

const inFlight = actionState()

function InputField({ id, field, value, onChange }) {
  if (field.options && field.multiple) {
    const chosen = new Set(value || [])
    return (
      <fieldset className="text-sm">
        <legend className="mb-1 font-medium">{field.label}</legend>
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
          {field.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input type="checkbox" checked={chosen.has(o.value)} onChange={(e) => {
                const next = new Set(chosen)
                if (e.target.checked) next.add(o.value)
                else next.delete(o.value)
                onChange([...next])
              }} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="mb-1 block font-medium">{field.label}</span>
      {field.options ? (
        <select id={id} className="w-full rounded-md border px-2 py-1.5" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input id={id} className="w-full rounded-md border px-2 py-1.5" type={field.type || 'text'} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

export default function ActionButton({ action, rowId = '', onRun, onDetail }) {
  const key = `${rowId}:${action.id}`
  const fields = action.input ? (action.input.fields || [{ name: 'value', ...action.input }]) : []
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState({})
  const [failure, setFailure] = useState('')

  const go = async () => {
    if (!inFlight.start(key)) return
    setBusy(true)
    setFailure('')
    try {
      if (action.detail) {
        await onDetail(action, rowId)
        return
      }
      const value = action.input ? (action.input.fields ? values : values.value) : undefined
      const result = await onRun(action, rowId, value)
      if (result?.error) {
        setFailure(result.error)
        if (!open) setOpen(true)
        return
      }
      setOpen(false)
      setValues({})
    } finally {
      inFlight.done(key)
      setBusy(false)
    }
  }

  const filled = fields.every((f) => (Array.isArray(values[f.name]) ? values[f.name].length > 0 : String(values[f.name] || '').trim() !== ''))
  return (
    <>
      <Button size="sm" variant={action.detail ? 'secondary' : undefined} disabled={busy} onClick={() => (action.confirm || fields.length ? setOpen(true) : go())}>
        {busy ? '…' : action.label}
      </Button>
      {open && (
        <Modal title={action.label} onClose={() => !busy && setOpen(false)}>
          <div className="space-y-3">
            {action.confirm && <p className="text-sm">{action.confirm === true ? `${action.label}?` : action.confirm}</p>}
            {fields.map((f) => <InputField key={f.name} id={`temu-${key}-${f.name}`} field={f} value={values[f.name]} onChange={(v) => setValues({ ...values, [f.name]: v })} />)}
            {failure && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{failure}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={busy || !filled} onClick={go}>{busy ? 'Working…' : action.label}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
