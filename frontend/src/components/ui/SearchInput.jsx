export default function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:max-w-xs ${className}`}
    />
  )
}
