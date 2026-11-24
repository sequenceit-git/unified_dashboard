/**
 * A TikTok Shop row or table action sent by the section loader:
 * `{ id, label, confirm?, input?, detail?, danger? }`. `detail` actions open a read-only view;
 * the others post to TikTok through the dashboard. Confirm and input steps use the app Modal.
 */
import { useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { actionState } from './actionState'

const running = actionState()

function Field({ id, field, value, onChange }) {
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="mb-1 block font-medium">{field.label}</span>
      {field.options ? (
        <select id={id} className="w-full rounded-md border px-2 py-1.5" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input id={id} className="w-full rounded-md border px-2 py-1.5" type={field.type || 'text'} maxLength={field.maxLength} value={value || ''} onChange={(e) => onChange(e.target.value)} />
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

  const go = async () => {
    if (!running.start(key)) return
    setBusy(true)
    try {
      if (action.detail) await onDetail(action, rowId)
      else {
        const value = action.input ? (action.input.fields ? values : values.value) : undefined
        const ok = await onRun(action, rowId, value)
        if (ok === false) return // keep the dialog and what was typed
      }
      setOpen(false)
      setValues({})
    } finally {
      running.done(key)
      setBusy(false)
    }
  }

  const ready = fields.every((f) => String(values[f.name] || '').trim() !== '')
  return (
    <>
      <Button size="sm" variant={action.detail || action.danger ? 'secondary' : undefined} disabled={busy} onClick={() => (action.confirm || fields.length ? setOpen(true) : go())}>
        {busy ? '…' : action.label}
      </Button>
      {open && (
        <Modal title={action.label} onClose={() => !busy && setOpen(false)}>
          <div className="space-y-3">
            {action.confirm && <p className="text-sm">{action.confirm === true ? `${action.label}?` : action.confirm}</p>}
            {fields.map((f) => <Field key={f.name} id={`tt-${key}-${f.name}`} field={f} value={values[f.name]} onChange={(v) => setValues({ ...values, [f.name]: v })} />)}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={busy || !ready} onClick={go}>{busy ? 'Working…' : action.label}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
