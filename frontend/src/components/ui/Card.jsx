export default function Card({ className = '', children }) {
  return <div className={`app-card min-w-0 max-w-full p-4 sm:p-5 ${className}`}>{children}</div>
}

export function StatCard({ label, value, sub, className = 'app-card-hover' }) {
  return (
    <Card className={`h-full ${className}`}>
      <div className="mb-3 sm:mb-4 h-1.5 w-8 rounded-full bg-indigo-500" />
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 truncate">{label}</p>
      <p className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 truncate">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 line-clamp-2">{sub}</p>}
    </Card>
  )
}
