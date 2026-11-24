/** Temu's attributes for the chosen category: lists for fixed values (several when allowed), text with a unit otherwise. */
import { Input, Select } from '../../../../../components/ui/Input'
import { visibleAttributes } from './temuForm'

export default function TemplateFields({ template, form, setAttr, errors = {} }) {
  const shown = visibleAttributes(template, form)
  if (!shown.length) return null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {shown.map((a) => {
        const v = form.attributes[a.templatePid] || {}
        const err = errors[`attributes.${a.templatePid}`]
        const label = `${a.name}${a.required ? ' *' : ''}`
        let input
        if (a.values.length && a.multiple) {
          input = (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-gray-200 p-2 text-sm dark:border-slate-700">
              {a.values.map((o) => (
                <label key={o.vid} className="flex items-center gap-2">
                  <input type="checkbox" checked={(v.vids || []).includes(o.vid)}
                    onChange={(e) => setAttr(a.templatePid, { vids: e.target.checked ? [...(v.vids || []), o.vid] : (v.vids || []).filter((x) => x !== o.vid) })} />
                  {o.value}
                </label>
              ))}
            </div>
          )
        } else if (a.values.length) {
          input = <Select value={v.vids?.[0] != null ? String(v.vids[0]) : ''} options={a.values.map((o) => ({ value: String(o.vid), label: o.value }))} onChange={(e) => setAttr(a.templatePid, { vids: e.target.value ? [Number(e.target.value)] : [] })} />
        } else {
          input = (
            <div className="flex gap-2">
              <Input value={v.value || ''} onChange={(e) => setAttr(a.templatePid, { ...v, value: e.target.value })} />
              {a.units.length > 0 && <Select value={v.unitId != null ? String(v.unitId) : ''} options={a.units.map((u) => ({ value: String(u.id), label: u.name }))} onChange={(e) => setAttr(a.templatePid, { ...v, unitId: Number(e.target.value) })} />}
            </div>
          )
        }
        return (
          <div key={a.templatePid} className="text-sm">
            <span className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-slate-300">{label}</span>
            {input}
            {err && <span className="mt-1 block text-xs text-red-600">{err}</span>}
          </div>
        )
      })}
    </div>
  )
}
