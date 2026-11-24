/**
 * eBay step panel for long forms: steps on the left (on top on phones), one step's fields at a
 * time (every step stays mounted, so nothing typed is lost), Back / Next and the save buttons.
 */
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'

export function Step({ id, active, children }) {
  return <section hidden={id !== active} aria-label={id} className="space-y-4">{children}</section>
}

export default function StepPanel({ title, steps, active, onStep, problemSteps, onClose, actions, children }) {
  const index = Math.max(0, steps.findIndex((s) => s.id === active))
  const prev = steps[index - 1]
  const next = steps[index + 1]
  return (
    <Modal title={title} onClose={onClose} size="5xl" closeOnBackdrop={false}>
      <div className="flex min-h-0 flex-col gap-4 md:flex-row">
        <nav aria-label="Steps" className="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 md:mx-0 md:w-48 md:flex-col md:overflow-visible md:px-0">
          {steps.map((s, i) => {
            const on = s.id === active
            const bad = problemSteps?.has(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onStep(s.id)}
                aria-current={on ? 'step' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  on ? 'bg-indigo-600 font-semibold text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${on ? 'bg-white/20' : bad ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200' : 'bg-gray-100 dark:bg-slate-800'}`}>
                  {bad ? '!' : i + 1}
                </span>
                {s.label}
              </button>
            )
          })}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-slate-800">
        <div className="flex gap-2">
          {prev && <Button type="button" variant="secondary" onClick={() => onStep(prev.id)}>← Back</Button>}
          {next && <Button type="button" variant="secondary" onClick={() => onStep(next.id)}>Next →</Button>}
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
    </Modal>
  )
}
