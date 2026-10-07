export default function Pagination({ page, pages, total, onPage }) {
  if (!total) return null
  return (
    <div className="flex flex-col items-center justify-between gap-2 py-3 sm:flex-row">
      <p className="text-xs text-gray-500">
        Page {page} of {pages} · {total} total
      </p>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Prev
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
