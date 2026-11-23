import Button from '../../../components/ui/Button'
import { Input, Select } from '../../../components/ui/Input'
import { EBAY_IDENTIFIER_TYPES, EBAY_ID_HINTS, validateEbayIdentifierCode } from './rules'

/** eBay product identifier (UPC / EAN / ISBN) with "Does not apply" quick helper. */
export default function EbayIdentifierField({
  value,
  onChange,
  label = 'Product identifier (UPC / EAN / ISBN)',
  required = false,
  compact = false,
}) {
  const type = String(value?.type || '').toUpperCase()
  const code = String(value?.code || '')
  const err = validateEbayIdentifierCode({ type, code })

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {label && (
        <span className="block text-xs font-semibold text-gray-600 dark:text-slate-300">
          {label}{required ? ' *' : ''}
        </span>
      )}
      <div className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-2">
        <Select
          aria-label="eBay identifier type"
          value={type}
          onChange={(e) => onChange({ type: e.target.value, code })}
          options={EBAY_IDENTIFIER_TYPES}
        />
        <Input
          aria-label="eBay identifier code"
          value={code}
          onChange={(e) => onChange({ type, code: e.target.value })}
          placeholder={type ? EBAY_ID_HINTS[type] || 'Enter code' : 'Optional barcode'}
          disabled={!type && !code}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange({ type: type || 'UPC', code: 'Does not apply' })}
        >
          Does not apply
        </Button>
      </div>
      {err && <p className="text-[11px] font-medium text-red-600">{err}</p>}
    </div>
  )
}
