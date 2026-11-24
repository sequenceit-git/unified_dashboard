/**
 * An action of an eBay section table: `{ id, label, confirm?, detail?, input? }` from the section
 * loader. Posts `/api/ebay/sections/<sectionId>/<id>` with `{ id: row.id, value }`; `detail: true`
 * opens a read-only view instead. Inputs are `input.fields` ([{ name, label, type?, options?,
 * multiple?, optional?, accept? }]) or one `input` value. Confirm and input steps use the dashboard
 * Modal (no browser dialogs); a running action can't be sent twice, and a failed one keeps its
 * dialog open with what was typed and the error.
 */
import { useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { dialogAfter, fileValue, isFilled, toggleOption } from './actionFields'

/** Which actions are running, so a double click sends one request. */
export function actionState() {
  const busy = new Set()
  return {
    start: (key) => (busy.has(key) ? false : (busy.add(key), true)),
    done: (key) => { busy.delete(key) },
    isBusy: (key) => busy.has(key),
  }
}

const running = actionState()
const box = 'w-full rounded-md border px-2 py-1.5 dark:bg-gray-900'

function Field({ field, id, value, onChange }) {
  if (field.multiple) {
    const chosen = Array.isArray(value) ? value : []
    const all = field.options.map((o) => o.value)
    return (
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input type="checkbox" checked={chosen.length === all.length && all.length > 0} onChange={(e) => onChange(e.target.checked ? all : [])} />
          Select all ({all.length})
        </label>
        {field.options.map((o) => (
          <label key={o.value} className="flex items-center gap-2">
            <input type="checkbox" checked={chosen.includes(o.value)} onChange={() => onChange(toggleOption(chosen, o.value))} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    )
  }
  if (field.options) {
    return (
      <select id={id} className={box} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  if (field.type === 'file') {
    return (
      <>
        <input id={id} className="block w-full text-sm" type="file" accept={field.accept} onChange={async (e) => { const file = e.target.files?.[0]; onChange(file ? await fileValue(file) : undefined) }} />
        {value?.name && <span className="mt-1 block text-xs text-gray-500">{value.name} ({Math.ceil(value.size / 1024)} KB)</span>}
      </>
    )
  }
  if (field.type === 'textarea') {
    return <textarea id={id} className={box} rows={4} maxLength={field.maxLength} value={value || ''} onChange={(e) => onChange(e.target.value)} />
  }
  return <input id={id} className={box} type={field.type || 'text'} maxLength={field.maxLength} step={field.type === 'number' ? '0.01' : undefined} value={value || ''} onChange={(e) => onChange(e.target.value)} />
}

export default function ActionButton({ action, row, run, onDetail }) {
  const key = `${row.id}:${action.id}`
  const input = action.input
  const fields = input?.fields || (input ? [{ ...input, name: 'value' }] : [])
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const needsStep = Boolean(action.confirm || input)

  const send = async () => {
    if (!running.start(key)) return
    setBusy(true)
    setFailure('')
    try {
      if (action.detail) {
        await onDetail?.(action, row)
        return
      }
      const sent = input ? (input.fields ? value : value.value) : undefined
      const next = dialogAfter(await run(action, row, sent))
      setFailure(next.error)
      setOpen(next.open)
      if (!next.open) setValue({})
    } finally {
      running.done(key)
      setBusy(false)
    }
  }
  const close = () => { if (!busy) { setOpen(false); setFailure('') } }
  const valid = fields.every((f) => isFilled(f, value[f.name]))

  return (
    <>
      <Button size="sm" variant={action.danger || action.detail ? 'secondary' : undefined} disabled={busy} onClick={() => (needsStep && !action.detail ? setOpen(true) : send())}>
        {busy && !open ? '…' : action.label}
      </Button>
      {open && (
        <Modal title={action.label} onClose={close}>
          <div className="space-y-3">
            {action.confirm && <p className="text-sm">{typeof action.confirm === 'string' ? action.confirm : `${action.label}?`}</p>}
            {fields.map((f) => (
              <label key={f.name} className="block text-sm">
                <span className="mb-1 block font-medium">{f.label}{f.optional ? <span className="font-normal text-gray-500"> (optional)</span> : null}</span>
                <Field field={f} id={`action-${key}-${f.name}`} value={value[f.name]} onChange={(v) => setValue((old) => ({ ...old, [f.name]: v }))} />
                {f.hint && <span className="mt-1 block text-xs text-gray-500">{f.hint}</span>}
              </label>
            ))}
            {failure && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{failure}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={close}>Cancel</Button>
              <Button size="sm" disabled={busy || !valid} onClick={send}>{busy ? 'Working…' : action.label}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
