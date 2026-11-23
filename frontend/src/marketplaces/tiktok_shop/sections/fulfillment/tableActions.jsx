import Button from '../../../../components/ui/Button'

/** TikTok Shop packages: ship a package that is ready, or download its label. */
export default {
  tableActions: {
    packages: (row, { onAction }) => {
      const canShip = /awaiting_shipment|processing|packed/i.test(String(row.rawStatus || row.status || ''))
      return (
        <div className="flex items-center gap-1.5">
          {canShip && (
            <Button size="sm" onClick={() => onAction('fulfillment-ship', row)}>
              Ship package
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => onAction('fulfillment-label', row)}>
            Get label
          </Button>
        </div>
      )
    },
  },
}
