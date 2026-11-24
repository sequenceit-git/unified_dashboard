/** Opens a Temu label through the dashboard (the request carries the sign-in; the file is never stored). */
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

export async function openLabel(orderId, packageSn, token) {
  const res = await fetch(`${BASE}/api/temu/orders/${orderId}/label?packageSn=${encodeURIComponent(packageSn)}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Label not available (${res.status})`)
  const url = URL.createObjectURL(await res.blob())
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
