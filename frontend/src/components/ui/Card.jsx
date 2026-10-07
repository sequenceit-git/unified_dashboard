export default function Card({ className = '', children }) {
  return <div className={`rounded-xl bg-white p-4 shadow-sm sm:p-5 ${className}`}>{children}</div>
}

export function StatCard({ label, value, sub }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </Card>
  )
}
