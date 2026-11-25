/** A step's own problems, shown at the top of that step. */
export default function StepProblems({ problems, step }) {
  const mine = (problems || []).filter((p) => p.step === step)
  if (!mine.length) return null
  return (
    <ul className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
      {mine.map((p) => <li key={`${p.field}:${p.message}`}>{p.message}</li>)}
    </ul>
  )
}
