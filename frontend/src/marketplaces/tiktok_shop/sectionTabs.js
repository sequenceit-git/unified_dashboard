/**
 * TikTok Shop section data → tabs. A loader names each table's tab after TikTok's API area
 * (`tab: 'Shop health'`, `'Unsettled orders'`…); tables without one share a tab named after the
 * section. Tiles: no `tab` → every tab; a tab no table uses → the first tab.
 */
export function sectionTabs(data) {
  const tables = data?.tables || []
  const order = []
  const groups = {}
  for (const table of tables) {
    const label = table.tab || data.label || 'Overview'
    if (!groups[label]) {
      groups[label] = { id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, summary: [], tables: [] }
      order.push(label)
    }
    groups[label].tables.push(table)
  }
  const tiles = data?.summary || []
  return order.map((label, index) => ({
    ...groups[label],
    summary: tiles.filter((tile) => !tile.tab || tile.tab === label || (index === 0 && !groups[tile.tab])),
  }))
}
