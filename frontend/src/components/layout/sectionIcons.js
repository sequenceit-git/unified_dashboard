/** Sidebar icon per shop section id (each shop names its sections after its own API). */
import { FiBarChart2, FiDollarSign, FiInbox, FiLayers, FiMessageCircle, FiPackage, FiPercent, FiRotateCcw, FiShoppingCart, FiStar, FiTrendingUp, FiTruck, FiUsers, FiVideo } from 'react-icons/fi'

export const SECTION_ICONS = {
  analytics: FiBarChart2,
  inventory: FiLayers,
  orders: FiShoppingCart,
  promotions: FiPercent,
  offers: FiMessageCircle,
  creators: FiStar,
  ads: FiTrendingUp,
  // Products: eBay listings, TikTok Shop products, Temu goods
  listings: FiPackage,
  products: FiPackage,
  goods: FiPackage,
  // Buyers and messages
  buyers: FiUsers,
  customers: FiUsers,
  messages: FiInbox,
  'customer-service': FiInbox,
  // Shipping
  packages: FiTruck,
  shipping: FiTruck,
  // Returns
  'returns-cases': FiRotateCcw,
  'returns-cancellations': FiRotateCcw,
  'after-sales': FiRotateCcw,
  // Money
  payouts: FiDollarSign,
  finance: FiDollarSign,
  'price-reviews': FiDollarSign,
  'videos-live': FiVideo,
}
