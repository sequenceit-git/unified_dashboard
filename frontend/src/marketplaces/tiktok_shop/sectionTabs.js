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

/**
 * What a section page can show: `full`; `own-tabs-only` when TikTok's API for it isn't available but
 * the page has its own tabs (Analytics' sales charts come from the dashboard's orders); `unavailable`.
 */
export function pageMode(section, extraTabs = []) {
  if (section?.available !== false) return 'full'
  return extraTabs.length ? 'own-tabs-only' : 'unavailable'
}
