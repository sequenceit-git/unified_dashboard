import BuyerChatPage from './BuyerChatPage'

/**
 * Second fixed sandbox buyer. Kept as its own page so Jane and John each own
 * an isolated chat history (separate localStorage keys and persona-scoped
 * conversations on the backend).
 */
export default function BuyerChat2Page() {
  return <BuyerChatPage persona="john_dutch" buyerName="John Dutch" pageTitle="Buyer Chat 2" />
}
