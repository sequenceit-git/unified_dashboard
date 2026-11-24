/** What the Stock tab's Temu check shows: nothing when Temu agrees with the dashboard. */
export function stockCheck(rows) {
  const list = Array.isArray(rows) ? rows : []
  const differ = list.filter((r) => r.mismatch)
  const onlyOnTemu = list.filter((r) => r.dashboardStock == null).length
  return { show: differ.length > 0 || onlyOnTemu > 0, differ, onlyOnTemu }
}
