/**
 * A row action of an eBay section table: `{ id, label, confirm?, input? }` from the section
 * loader. Posts `/api/ebay/sections/<sectionId>/<id>` with `{ id: row.id, value }`. Confirm and
 * input steps use the dashboard Modal (no browser dialogs); a running action can't be sent twice.
 */
import { useState } from 'react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

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

export default function ActionButton({ action, row, run }) {
  const key = `${row.id}:${action.id}`
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const needsStep = Boolean(action.confirm || action.input)

  const send = async () => {
    if (!running.start(key)) return
    setBusy(true)
    try {
      await run(action, row, action.input ? value : undefined)
      setOpen(false)
      setValue('')
    } finally {
      running.done(key)
      setBusy(false)
    }
  }

  const input = action.input
  const valid = !input || String(value).trim() !== ''
  return (
    <>
      <Button size="sm" variant={action.danger ? 'secondary' : undefined} disabled={busy} onClick={() => (needsStep ? setOpen(true) : send())}>
        {busy ? '…' : action.label}
      </Button>
      {open && (
        <Modal title={action.label} onClose={() => !busy && setOpen(false)}>
          <div className="space-y-3">
            {action.confirm && <p className="text-sm">{typeof action.confirm === 'string' ? action.confirm : `${action.label}?`}</p>}
            {input && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{input.label}</span>
                {input.options ? (
                  <select id={`action-${key}`} className="w-full rounded-md border px-2 py-1.5" value={value} onChange={(e) => setValue(e.target.value)}>
                    <option value="">Choose…</option>
                    {input.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input id={`action-${key}`} className="w-full rounded-md border px-2 py-1.5" type={input.type || 'text'} maxLength={input.maxLength} step={input.type === 'number' ? '0.01' : undefined} value={value} onChange={(e) => setValue(e.target.value)} />
                )}
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={busy || !valid} onClick={send}>{busy ? 'Working…' : action.label}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
