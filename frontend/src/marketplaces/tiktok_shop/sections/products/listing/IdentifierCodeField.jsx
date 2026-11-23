import { Input, Select } from '../../../../../components/ui/Input'
import { IDENTIFIER_HINTS, IDENTIFIER_TYPES, validateIdentifierCode } from './rules'

/** Regulated product identifier code input (GTIN / UPC / EAN / ISBN / JAN). */
export default function IdentifierCodeField({ value, onChange, label = 'Product identifier (GTIN / UPC / EAN)', compact = false }) {
  const type = String(value?.type || '').toUpperCase()
  const code = String(value?.code || '')
  const err = validateIdentifierCode({ type, code })

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {label && <span className="block text-xs font-semibold text-gray-600 dark:text-slate-300">{label}</span>}
      <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2">
        <Select
          aria-label="Identifier type"
          value={type}
          onChange={(e) => onChange({ type: e.target.value, code })}
          options={IDENTIFIER_TYPES}
        />
        <Input
          aria-label="Identifier code"
          value={code}
          onChange={(e) => onChange({ type, code: e.target.value })}
          placeholder={type ? IDENTIFIER_HINTS[type] || 'Enter code' : 'Optional barcode'}
          disabled={!type && !code}
        />
      </div>
      {err && <p className="text-[11px] font-medium text-red-600">{err}</p>}
    </div>
  )
}
