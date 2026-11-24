import { cancellationActions, returnActions } from './rowActions'

/**
 * TikTok Shop returns and cancellations. Returns: Approve here; Reject comes from the section
 * loader with TikTok's own reasons for that return. Cancellations: approve or reject.
 */
export default {
  tableActions: {
    returns: returnActions({ canDecline: false }),
    cancellations: cancellationActions(),
  },
}
