import { useSearchParams } from 'react-router-dom'
import { shopSectionFromId } from '../lib/shops'

export function useShopSection() {
  const [params] = useSearchParams()
  return shopSectionFromId(params.get('shop'))
}
