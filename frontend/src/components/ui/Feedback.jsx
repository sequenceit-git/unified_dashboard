export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-100 border-t-indigo-600" />
    </div>
  )
}

export function EmptyState({ message = 'No records found' }) {
  return <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 py-12 text-center text-sm text-gray-500">{message}</p>
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/60 py-8 text-center">
      <p className="text-sm font-medium text-red-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-sm font-medium text-indigo-600 hover:underline">
          Retry
        </button>
      )}
    </div>
  )
}
