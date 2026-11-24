/**
 * Temu section data → pill tabs. Each table names its tab after Temu's area (`tab: 'By product'`,
 * `'Price guide'`…); tables without one sit in a tab named after the section. Tiles without a tab
 * show on every tab; a tile whose tab has no table shows on the first.
 */
export function sectionTabs(data) {
  if (!data?.tables?.length) return []
  const byLabel = new Map()
  for (const table of data.tables) {
    const label = table.tab || data.label || 'Overview'
    if (!byLabel.has(label)) byLabel.set(label, [])
    byLabel.get(label).push(table)
  }
  const labels = [...byLabel.keys()]
  return labels.map((label, i) => ({
    id: `temu-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label,
    tables: byLabel.get(label),
    summary: (data.summary || []).filter((t) => !t.tab || t.tab === label || (i === 0 && !byLabel.has(t.tab))),
  }))
}

/**
 * `full`; `own-tabs-only` when Temu's API for this section isn't available but the page has its
 * own content to show; `unavailable`.
 */
export function pageMode(section, ownTabs = []) {
  if (section?.available !== false) return 'full'
  return ownTabs.length ? 'own-tabs-only' : 'unavailable'
}
