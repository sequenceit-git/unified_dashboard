import { cancellationActions, returnActions } from '../../shared/actions'

/** eBay returns: approve or decline returns, approve or reject cancellations. */
export default {
  tableActions: {
    returns: returnActions(),
    cancellations: cancellationActions(),
  },
}
