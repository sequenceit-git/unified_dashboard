const COLORS = {
  gray: 'bg-gray-100 text-gray-700',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  indigo: 'bg-indigo-100 text-indigo-800',
}

export default function Badge({ color = 'gray', children }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[color]}`}>
      {children}
    </span>
  )
}

export function statusColor(status) {
  const map = {
    active: 'green', live: 'green', delivered: 'green', success: 'green', connected: 'green',
    open: 'blue', paid: 'blue', shipped: 'blue', processing: 'blue',
    pending: 'yellow', queued: 'yellow', running: 'blue',
    low_stock: 'yellow', sync_failed: 'red', failed: 'red', error: 'red',
    cancelled: 'red', disconnected: 'red', disabled: 'red',
    draft: 'gray', archived: 'gray', closed: 'gray', paused: 'gray', ended: 'gray',
  }
  return map[status] || 'gray'
}
