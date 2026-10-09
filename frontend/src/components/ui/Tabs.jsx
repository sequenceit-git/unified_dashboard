function MarketplaceText({ id, label }) {
  if (id === 'ebay')
    return (
      <span className="text-lg font-bold tracking-tight">
        <span className="text-[#E53238]">e</span>
        <span className="text-[#0064D2]">B</span>
        <span className="text-[#F5AF02]">a</span>
        <span className="text-[#86B817]">y</span>
      </span>
    )
  if (id === 'temu') return <span className="text-lg font-bold tracking-tight text-[#FB7701]">{label}</span>
  if (id === 'tiktok_shop') return <span className="text-lg font-bold tracking-tight text-[#010101]">{label}</span>
  return label
}

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => {
        const isMarketplace = t.id === 'ebay' || t.id === 'temu' || t.id === 'tiktok_shop'
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`whitespace-nowrap px-4 py-2 ${
              isMarketplace
                ? `text-lg font-bold ${isActive ? 'border-b-2 border-indigo-600' : 'opacity-80 hover:opacity-100'}`
                : `text-sm font-medium ${
                    isActive
                      ? 'border-b-2 border-indigo-600 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-800'
                  }`
            }`}
          >
            {isMarketplace ? <MarketplaceText id={t.id} label={t.label} /> : t.label}
          </button>
        )
      })}
    </div>
  )
}
