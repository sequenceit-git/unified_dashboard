export function Input({ label, className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>}
      <input
        className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${className}`}
        {...props}
      />
    </label>
  )
}

export function Select({ label, options = [], className = '', ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>}
      <select
        className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${className}`}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
