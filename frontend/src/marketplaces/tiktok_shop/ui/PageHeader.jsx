/** TikTok Shop page header: title, one-line summary with counts, main actions on the right. */
export default function PageHeader({ title, summary, actions }) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {summary && <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{summary}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
