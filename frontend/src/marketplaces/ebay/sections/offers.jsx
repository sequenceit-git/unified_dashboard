import Button from '../../../components/ui/Button'

/** eBay Best offers: send a discount offer to buyers watching an eligible listing. */
export default {
  tableActions: {
    eligible: (row, { onAction }) => (
      <Button size="sm" onClick={() => onAction('offer', row)}>
        Send offer
      </Button>
    ),
  },
}
