import { getShop } from '../../marketplaces'

function MarketplaceText({ id, label }) {
  const Wordmark = getShop(id)?.Wordmark
  return Wordmark ? <Wordmark /> : label
}

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => {
        const isMarketplace = Boolean(getShop(t.id)?.Wordmark)
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
