/**
 * Temu variants: pick values of Temu's variant types (and custom values where Temu allows them),
 * then one row per combination with its price, stock, US weight (lb) and size (in), code and photo.
 */
import { useState } from 'react'
import { api } from '../../../../../lib/api'
import Button from '../../../../../components/ui/Button'
import { Input, Select } from '../../../../../components/ui/Input'

export default function TemuVariants({ token, catId, template, form, setGroups, setSku, errors = {} }) {
  const types = [
    ...(template?.variants || []).map((t) => ({ parentSpecId: t.parentSpecId, name: t.name, values: t.values.map((v) => ({ parentSpecId: t.parentSpecId, specId: v.specId, vid: v.vid, value: v.value })), custom: false })),
    ...(template?.customVariants || []).map((t) => ({ parentSpecId: t.parentSpecId, name: t.name, values: [], custom: true })),
  ]
  const [custom, setCustom] = useState({})
  const [note, setNote] = useState('')
  const chosen = (pid) => form.variantGroups.find((g) => g.parentSpecId === pid)?.values || []
  const toggle = (type, val) => {
    const now = chosen(type.parentSpecId)
    const next = now.some((x) => x.specId === val.specId) ? now.filter((x) => x.specId !== val.specId) : [...now, val]
    // Groups stay in the template's order, so SKU rows keep what was typed for them.
    const order = types.map((t) => t.parentSpecId)
    setGroups([...form.variantGroups.filter((g) => g.parentSpecId !== type.parentSpecId), { parentSpecId: type.parentSpecId, values: next }]
      .filter((g) => g.values.length)
      .sort((a, b) => order.indexOf(a.parentSpecId) - order.indexOf(b.parentSpecId)))
  }
  const addCustom = async (type) => {
    const name = String(custom[type.parentSpecId] || '').trim()
    if (!name) return
    setNote('')
    try {
      const { specId } = await api.post('/api/temu/goods/helpers/spec', { catId, parentSpecId: type.parentSpecId, name }, token)
      toggle(type, { parentSpecId: type.parentSpecId, specId, value: name })
      setCustom({ ...custom, [type.parentSpecId]: '' })
    } catch (err) {
      setNote(err.message)
    }
  }
  const photos = form.images.map((url, i) => ({ value: url, label: `Photo ${i + 1}` }))

  return (
    <div className="space-y-3">
      {types.map((t) => (
        <div key={t.parentSpecId} className="rounded-lg border border-gray-200 p-3 text-sm dark:border-slate-700">
          <p className="mb-2 text-xs font-semibold">{t.name}</p>
          <div className="flex flex-wrap gap-2">
            {[...t.values, ...chosen(t.parentSpecId).filter((c) => !t.values.some((v) => v.specId === c.specId))].map((v) => (
              <label key={v.specId} className="flex items-center gap-1">
                <input type="checkbox" checked={chosen(t.parentSpecId).some((c) => c.specId === v.specId)} onChange={() => toggle(t, v)} />{v.value}
              </label>
            ))}
          </div>
          {(t.custom || template?.maxVariantTypes) && (
            <div className="mt-2 flex gap-2">
              <Input placeholder={`Add a ${t.name.toLowerCase()} value`} value={custom[t.parentSpecId] || ''} onChange={(e) => setCustom({ ...custom, [t.parentSpecId]: e.target.value })} />
              <Button type="button" size="sm" variant="secondary" onClick={() => addCustom(t)}>Add</Button>
            </div>
          )}
        </div>
      ))}
      {note && <p className="text-xs text-red-600">{note}</p>}
      {errors.variants && <p className="text-xs text-red-600">{errors.variants}</p>}
      {form.variants.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead><tr className="text-left text-gray-500"><th className="p-1">SKU</th><th className="p-1">Price $</th><th className="p-1">List price $</th><th className="p-1">Stock</th><th className="p-1">Weight lb</th><th className="p-1">L × W × H in</th><th className="p-1">Photo</th></tr></thead>
            <tbody>
              {form.variants.map((s, i) => {
                const err = ['basePrice', 'listPrice', 'quantity', 'weight', 'size', 'images'].map((f) => errors[`variants.${i}.${f}`]).filter(Boolean).join(' ')
                const cell = (f, w = 'w-20') => <input className={`${w} rounded border px-1 py-1 dark:bg-slate-900`} value={s[f] ?? ''} onChange={(e) => setSku(i, { [f]: e.target.value })} />
                return (
                  <tr key={s.specs.map((x) => x.specId).join(',')} className="border-t align-top">
                    <td className="p-1 font-medium">{s.specs.map((x) => x.value).join(' / ')}{err && <span className="block font-normal text-red-600">{err}</span>}</td>
                    <td className="p-1">{cell('basePrice')}</td>
                    <td className="p-1">{cell('listPrice')}</td>
                    <td className="p-1">{cell('quantity', 'w-16')}</td>
                    <td className="p-1">{cell('weight', 'w-16')}</td>
                    <td className="p-1 whitespace-nowrap">{cell('length', 'w-12')} {cell('width', 'w-12')} {cell('height', 'w-12')}</td>
                    <td className="p-1 w-32"><Select value={s.images?.[0] || ''} options={photos} onChange={(e) => setSku(i, { images: e.target.value ? [e.target.value] : [] })} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
