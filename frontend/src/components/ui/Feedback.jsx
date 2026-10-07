export function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
    </div>
  )
}

export function EmptyState({ message = 'No records found' }) {
  return <p className="py-8 text-center text-sm text-gray-500">{message}</p>
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-red-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-sm font-medium text-indigo-600 hover:underline">
          Retry
        </button>
      )}
    </div>
  )
}
