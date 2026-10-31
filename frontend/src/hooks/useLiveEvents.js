import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const listeners = new Set()
let connection = null

/**
 * One shared stream from GET /api/events for the whole tab. It uses fetch rather than
 * EventSource because the API needs the Authorization header. Reconnects after drops.
 */
function connect(token) {
  const controller = new AbortController()
  let stopped = false

  const run = async () => {
    while (!stopped) {
      try {
        const res = await fetch(`${BASE}/api/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
          cache: 'no-store',
        })
        if (res.status === 401) return
        if (!res.ok || !res.body) throw new Error(`events ${res.status}`)
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          let end
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
            if (!data) continue
            try {
              const event = JSON.parse(data)
              listeners.forEach((listener) => listener(event))
            } catch {
              // Ignore malformed events.
            }
          }
        }
      } catch {
        if (stopped) return
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
  run()
  return { token, stop: () => { stopped = true; controller.abort() } }
}

/** Calls `handler(event)` for every live event, e.g. { type: 'sync', kind: 'inbox', marketplace }. */
export function useLiveEvents(handler) {
  const { token } = useAuth()
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!token) return undefined
    if (connection && connection.token !== token) {
      connection.stop()
      connection = null
    }
    if (!connection) connection = connect(token)
    const listener = (event) => ref.current(event)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (!listeners.size && connection) {
        connection.stop()
        connection = null
      }
    }
  }, [token])
}

/** Runs `reload` when the worker has loaded new `kind` data ('inbox', 'orders', 'listings') for `marketplace`. */
export function useSyncReload(kinds, marketplace, reload) {
  const list = Array.isArray(kinds) ? kinds : [kinds]
  useLiveEvents((event) => {
    if (event.type !== 'sync' || !event.ok) return
    if (!list.includes(event.kind) && !(event.kind === 'full' && list.some((kind) => kind !== 'inbox'))) return
    if (marketplace && event.marketplace !== marketplace) return
    reload(event)
  })
}
