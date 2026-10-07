export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap px-4 py-2 text-sm font-medium ${
            active === t.id
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
