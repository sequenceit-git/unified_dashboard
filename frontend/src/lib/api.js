const BASE = import.meta.env.VITE_API_URL || ''

function headers(token, isJson = true) {
  return {
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function request(path, { token, ...options } = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(token), ...options })
  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:expired'))
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API ${res.status}`)
  }
  return res.json()
}

export function queryString(params = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') q.set(k, v)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const api = {
  get: (path, token) => request(path, { token }),
  post: (path, body, token) =>
    request(path, { method: 'POST', body: JSON.stringify(body), token }),
  patch: (path, body, token) =>
    request(path, { method: 'PATCH', body: JSON.stringify(body), token }),
  del: (path, token) => request(path, { method: 'DELETE', token }),
}
