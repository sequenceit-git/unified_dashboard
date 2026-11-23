import { cancellationActions, returnActions } from './rowActions'

/** TikTok Shop returns and cancellations: approve or decline / reject. */
export default {
  tableActions: {
    returns: returnActions(),
    cancellations: cancellationActions(),
  },
}
