/**
 * Groups an eBay section's tables into tabs, in the order the loader lists them. Tables without
 * a `tab` share one tab named after the section; summary tiles without a `tab` show on every tab.
 * A tile whose tab has no table shows on the first tab. One tab means the page shows no tab bar.
 */
export function sectionTabs(data) {
  if (!data) return []
  const tabs = []
  const byLabel = new Map()
  for (const table of data.tables || []) {
    const label = table.tab || data.label || 'Overview'
    const id = table.tab ? table.tab.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'main'
    if (!byLabel.has(label)) {
      const tab = { id, label, summary: [], tables: [] }
      byLabel.set(label, tab)
      tabs.push(tab)
    }
    byLabel.get(label).tables.push(table)
  }
  const labels = new Set(tabs.map((t) => t.label))
  tabs.forEach((tab, i) => {
    tab.summary = (data.summary || []).filter((tile) => !tile.tab || tile.tab === tab.label || (i === 0 && !labels.has(tile.tab)))
  })
  return tabs
}
