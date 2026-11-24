/** eBay row actions: one main button for what to do next, everything else in the ⋯ menu. */
import Button from '../../../components/ui/Button'
import RowMenu from '../../../components/ui/RowMenu'

export default function RowActions({ main, menu = [] }) {
  return (
    <span className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {main && (
        <Button size="sm" variant={main.primary ? 'primary' : 'secondary'} disabled={main.busy} onClick={main.onClick}>
          {main.busy ? '…' : main.label}
        </Button>
      )}
      {menu.length > 0 && <RowMenu items={menu} />}
    </span>
  )
}
