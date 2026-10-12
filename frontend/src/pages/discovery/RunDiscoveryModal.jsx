import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'

const CATEGORIES = [
  { value: 'All', label: 'All Categories' },
  { value: 'Home & Kitchen', label: 'Home & Kitchen' },
  { value: 'Electronics', label: 'Electronics' },
  { value: 'Sports & Fitness', label: 'Sports & Fitness' },
  { value: 'Beauty & Personal Care', label: 'Beauty & Personal Care' },
  { value: 'Accessories', label: 'Accessories' },
  { value: 'Pet Supplies', label: 'Pet Supplies' },
]

export default function RunDiscoveryModal({ isOpen, onClose, onRun, running }) {
  const [category, setCategory] = useState('All')
  const [keywords, setKeywords] = useState('')
  const [marketplaces, setMarketplaces] = useState({
    ebay: true,
  })

  if (!isOpen) return null

  const toggleMarket = (key) => {
    setMarketplaces((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const selectedMarkets = Object.keys(marketplaces).filter((k) => marketplaces[k])
    if (selectedMarkets.length === 0) return
    onRun({
      category,
      keywords: keywords ? keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
      marketplaces: selectedMarkets,
    })
  }

  return (
    <Modal title="Launch AI Product Discovery Agent" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          The agent scans high-velocity sales trends, calculate margins, analyzes competitor density, and identifies top product opportunities across eBay.
        </p>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Target Category</label>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={CATEGORIES}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Target Marketplace</label>
          <div className="flex flex-wrap gap-3">
            {[
              { id: 'ebay', label: 'eBay' },
            ].map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  marketplaces[m.id]
                    ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={marketplaces[m.id]}
                  onChange={() => toggleMarket(m.id)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Keywords (Optional, comma separated)</label>
          <Input
            placeholder="e.g. magnetic, wireless, silicone, portable"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} type="button" disabled={running}>
            Cancel
          </Button>
          <Button type="submit" disabled={running}>
            {running ? 'Agent Scanning Markets…' : 'Run Agent Analysis'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
