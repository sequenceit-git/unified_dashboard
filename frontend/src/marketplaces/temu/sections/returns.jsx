import { cancellationActions, returnActions } from '../../shared/actions'

/** Temu's API can approve (full refund) but not decline returns or reject cancellations. */
export default {
  tableActions: {
    returns: returnActions({ approveLabel: 'Approve & refund', canDecline: false, reviewingLabel: 'Temu reviewing' }),
    cancellations: cancellationActions({ canReject: false }),
  },
}
