/** Temu category: walk Temu's tree level by level, or take Temu's suggestion for the title. Only sellable leaves can be chosen. */
import { useEffect, useState } from 'react'
import { api, queryString } from '../../../../../lib/api'
import Button from '../../../../../components/ui/Button'

export default function CategoryPicker({ token, title, value, path, onChange, error }) {
  const [trail, setTrail] = useState([]) // [{ id, name }] chosen parents
  const [level, setLevel] = useState([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const parentId = trail.at(-1)?.id

  useEffect(() => {
    let stop = false
    api.get(`/api/temu/goods/helpers/categories${queryString({ parentId })}`, token)
      .then((rows) => { if (!stop) setLevel(rows) })
      .catch((err) => { if (!stop) setNote(err.message) })
    return () => { stop = true }
  }, [parentId, token])

  const pick = (cat) => {
    if (!cat.available) return
    if (cat.leaf) onChange(cat.id, [...trail.map((t) => t.name), cat.name].join(' › '))
    else setTrail([...trail, { id: cat.id, name: cat.name }])
  }
  const suggest = async () => {
    setBusy(true)
    setNote('')
    try {
      const ids = await api.get(`/api/temu/goods/helpers/categories/recommend${queryString({ title })}`, token)
      if (ids[0]) onChange(ids[0], `Suggested by Temu (category ${ids[0]})`)
      else setNote('Temu has no suggestion for this title. Pick a category below.')
    } catch (err) {
      setNote(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">Temu category</span>
        <Button type="button" size="sm" variant="secondary" disabled={busy || !title?.trim()} onClick={suggest}>{busy ? 'Asking Temu…' : 'Suggest from title'}</Button>
      </div>
      {value ? <p className="text-sm text-orange-700 dark:text-orange-300">Chosen: {path || value}</p> : <p className="text-xs text-gray-500">Not chosen yet.</p>}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button type="button" className="underline" onClick={() => setTrail([])}>All categories</button>
        {trail.map((t, i) => (
          <span key={t.id}> › <button type="button" className="underline" onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</button></span>
        ))}
      </div>
      <div className="max-h-48 overflow-y-auto rounded border border-gray-100 dark:border-slate-800">
        {level.map((c) => (
          <button key={c.id} type="button" disabled={!c.available} onClick={() => pick(c)}
            className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-gray-400 dark:hover:bg-slate-800 ${value === c.id ? 'font-semibold text-orange-700' : ''}`}>
            {c.name}{c.leaf ? '' : ' ›'}{c.available ? '' : ' (not sellable)'}
          </button>
        ))}
      </div>
      {(error || note) && <p className="text-xs text-red-600">{error || note}</p>}
    </div>
  )
}
