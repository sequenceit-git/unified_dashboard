/**
 * Gap notes for every seller endpoint the dashboard doesn't call yet: where it belongs (an existing
 * section id of that shop, or "new: <name>"), how big the work is, how much it matters to the
 * seller, and what it gives them. First matching rule wins (tested against the endpoint id).
 * Each rule: [pattern, section, size, priority, value]. build-gaps.js writes docs/api-coverage/gaps/.
 */
const R = (pattern, section, size, priority, value) => ({ pattern, section, size, priority, value })

const ebay = [
  // Sell Analytics — listing-level and account-level insight
  R(/traffic_report$/, 'analytics', 'small', 'high', 'Listing-level traffic: impressions, page views, click-through rate, sales conversion rate and quantity sold per listing and per day (eBay Seller Hub "Traffic" report).'),
  R(/seller_standards_profile/, 'analytics', 'small', 'high', 'Seller level (Top Rated / Above Standard / Below Standard) with defect rate, late-shipment rate and cases closed without resolution, current and projected.'),
  R(/analytics\/v1\/customer_service_metric\//, 'analytics', 'small', 'medium', 'Item-not-received and not-as-described rates benchmarked against peer sellers in the same categories.'),
  // Finances
  R(/finances\/v1\/order_earnings/, 'payouts', 'small', 'high', 'Net earnings per order after eBay fees, ad fees, shipping labels and refunds — real profit per order and in total.'),
  R(/seller_funds_summary$/, 'payouts', 'small', 'high', 'Money not yet paid out: available, processing and on-hold funds right now.'),
  R(/billing_activity$/, 'payouts', 'small', 'medium', 'Itemised eBay bill: insertion fees, final value fees, ad fees, store subscription and other charges.'),
  R(/finances\/v1\/(payout\/|transfer\/|transaction_summary)/, 'payouts', 'small', 'medium', 'Payout and transaction details: a single payout or transfer, and totals by transaction type.'),
  // Fulfillment
  R(/payment_dispute/, 'returns-cases', 'medium', 'high', 'Payment disputes (chargebacks): list and open them, read evidence, accept, or contest with uploaded proof before the deadline.'),
  R(/sell\/logistics\//, 'orders', 'large', 'medium', 'Buy eBay shipping labels: live rate quotes, buy a label, download it, cancel a shipment (eBay Labels; limited marketplaces).'),
  R(/shipping_fulfillment\/\{\w+\}$/, 'orders', 'small', 'low', 'Read one shipment (tracking number, carrier, line items) of an order; the list call is already used.'),
  // Inventory API (SKU-based listing model; the dashboard lists through the Trading API)
  R(/offer\/get_listing_fees$/, 'listings', 'small', 'high', 'Show the listing fees eBay will charge before publishing an offer.'),
  R(/bulk_update_price_quantity$/, 'inventory', 'small', 'medium', 'Change price and quantity of up to 25 SKUs in one call (Inventory API listings only).'),
  R(/inventory\/v1\/location/, 'inventory', 'small', 'low', 'Warehouse and store locations: create, edit, enable/disable; needed for multi-warehouse stock and in-store pickup.'),
  R(/product_compatibility$|metadata\/v1\/compatibilities\//, 'listings', 'medium', 'medium', 'Parts fitment: which vehicles a part fits (compatibility lists on motors listings).'),
  R(/bulk_migrate_listing$/, 'listings', 'large', 'low', 'Move existing Trading API listings into the Inventory API (SKU-based) model.'),
  R(/sell\/inventory\/v1\/(inventory_item|offer|bulk_|listing\/)/, 'listings', 'medium', 'low', 'Inventory API (SKU-based) listing model: inventory items, item groups and offers. The dashboard lists through the Trading API, so this only matters when moving to the Inventory API.'),
  // Account (business policies, programs, settings)
  R(/account\/v1\/(fulfillment|payment|return|custom)_policy/, 'new: business policies', 'medium', 'medium', 'Create, edit and delete the shipping, payment, return and custom policies listings point to.'),
  R(/account\/v1\/kyc$/, 'new: account', 'small', 'medium', 'Outstanding identity-verification (KYC) checks that can hold payouts.'),
  R(/account\/v1\/(privilege|subscription|advertising_eligibility|program\/|payments_program)/, 'new: account', 'small', 'low', 'Account status: selling limits, store subscription, Promoted Listings eligibility and program opt-ins.'),
  R(/account\/v[12]\/(sales_tax|bulk_create_or_replace_sales_tax|rate_table|combined_shipping_rules|payout_settings|user_preferences)/, 'new: account', 'small', 'low', 'Account settings: sales tax tables, shipping rate tables, combined-shipping rules, payout split and selling preferences.'),
  // Feed
  R(/feed\/v1\/customer_service_metric_task/, 'analytics', 'medium', 'low', 'Download the customer-service metric report as a file.'),
  R(/sell\/feed\/v1\//, 'new: bulk feeds', 'large', 'medium', 'Bulk files: download order and active-inventory reports, upload bulk listing/price/stock files, and schedule recurring reports.'),
  // Marketing
  R(/marketing\/v1\/ad_report/, 'new: promoted listings', 'medium', 'high', 'Promoted Listings performance: impressions, clicks, sales and ad fees per campaign and per listing.'),
  R(/marketing\/v1\/(ad_campaign|bulk_.*negative_keyword|negative_keyword)/, 'new: promoted listings', 'large', 'high', 'Promoted Listings (eBay ads): create and run campaigns, add listings as ads, set ad rates and bids, keywords, budgets, suggested items and rates.'),
  R(/marketing\/v1\/promotion(_summary)?_report$/, 'promotions', 'small', 'high', 'Promotion results: sales, units, buyers and discount given per promotion.'),
  R(/marketing\/v1\/(item_price_markdown|item_promotion|promotion\/)/, 'promotions', 'medium', 'medium', 'Create, edit and delete markdown sales and order-discount promotions (listing is already used).'),
  R(/marketing\/v1\/email_campaign/, 'buyers', 'medium', 'low', 'Email campaigns to store followers: create, preview, send and see results.'),
  // Metadata
  R(/sell\/metadata\/v1\//, 'listings', 'small', 'low', 'Marketplace rules for listing: allowed item conditions, return/shipping options, regulatory and hazmat labels, handling times, carriers.'),
  // Recommendation, Stores
  R(/recommendation\/v1\/find$/, 'listings', 'small', 'high', "eBay's own per-listing recommendations (e.g. suggested Promoted Listings ad rate)."),
  R(/sell\/stores\/v1\//, 'new: store', 'medium', 'low', 'eBay Store details and store categories: add, rename, move and delete categories.'),
  // Commerce
  R(/commerce\/feedback\//, 'buyers', 'medium', 'high', 'Feedback: received and left feedback, rating summary, reply to feedback and leave feedback for buyers.'),
  R(/commerce\/catalog\//, 'listings', 'small', 'medium', 'Find an eBay catalog product (ePID) to pre-fill title, aspects and photos when listing.'),
  R(/commerce\/charity\//, 'listings', 'small', 'low', 'Charities a listing can donate to (eBay for Charity).'),
  R(/commerce\/identity\//, 'new: account', 'small', 'low', "The connected account's eBay user profile (username, account type, registration info)."),
  R(/commerce\/media\/v1_beta\/post_order\//, 'returns-cases', 'small', 'low', 'Upload and manage documents attached to returns and cases.'),
  R(/commerce\/media\//, 'listings', 'medium', 'medium', 'Upload listing images, videos and documents (manuals, certificates) to eBay.'),
  R(/commerce\/message\//, 'messages', 'small', 'medium', 'Mark conversations read or archived, one at a time or in bulk.'),
  R(/commerce\/notification\//, 'new: notifications', 'medium', 'medium', "Subscribe to eBay push notifications (topics, destinations, filters) instead of polling; only the public key check is used today."),
  R(/commerce\/taxonomy\//, 'listings', 'small', 'medium', 'Category tree, required/recommended item specifics, compatibility properties and expired categories.'),
  R(/commerce\/translation\//, 'listings', 'small', 'low', 'Translate listing titles and descriptions for other eBay sites.'),
  // Post-Order
  R(/post-order\/v2\/casemanagement/, 'returns-cases', 'medium', 'high', 'eBay Money Back Guarantee cases: view case details and appeal decisions.'),
  R(/post-order\/v2\/inquiry/, 'returns-cases', 'medium', 'high', 'Item-not-received inquiries: list, view, provide tracking, refund or message the buyer before they become cases.'),
  R(/post-order\/v2\/return\/preference$/, 'returns-cases', 'small', 'low', 'Read and set return preferences (automatic return rules).'),
  R(/^POST \/post-order\/v2\/return$/, 'returns-cases', 'small', 'low', 'Opens a return on the buyer side; sellers normally never call it.'),
  R(/post-order\/v2\/return\//, 'returns-cases', 'medium', 'high', 'Return details and actions: files, tracking, shipping label, mark received, refund, escalate and message the buyer.'),
  R(/post-order\/v2\/cancellation\/\{cancelId\}$/, 'orders', 'small', 'low', 'Read one cancellation request (search and actions are already used).'),
  // Trading API (XML)
  R(/^Trading:(GetMyMessages|ReviseMyMessages|ReviseMyMessagesFolders|DeleteMyMessages|AddMemberMessage\w*|GetMemberMessages|GetMessagePreferences|SetMessagePreferences)$/, 'messages', 'small', 'medium', 'Trading API messaging: eBay inbox folders, reading/flagging/deleting messages, answering listing questions, Ask-a-Question subjects.'),
  R(/^Trading:(GetFeedback|LeaveFeedback|RespondToFeedback|GetItemsAwaitingFeedback)$/, 'buyers', 'small', 'medium', 'Feedback through the Trading API (the REST Feedback API covers the same).'),
  R(/^Trading:(GetBestOffers|RespondToBestOffer)$/, 'offers', 'small', 'high', 'Best Offers buyers sent on listings: see them and accept, decline or counter.'),
  R(/^Trading:(GetAllBidders|AddSecondChanceItem|VerifyAddSecondChanceItem)$/, 'offers', 'small', 'low', 'Auctions: bidders on a listing and Second Chance Offers to non-winning bidders.'),
  R(/^Trading:GetAccount$/, 'payouts', 'small', 'low', 'Legacy eBay invoice/account statement (the Finances API covers fees better).'),
  R(/^Trading:(GetOrders|GetItemTransactions|GetSellerTransactions|CompleteSale|SendInvoice|AddOrder)$/, 'orders', 'small', 'low', 'Trading API order calls (combine orders, send invoices, mark shipped); the REST Fulfillment API already covers orders.'),
  R(/^Trading:(GetStore|SetStoreCategories|GetStoreCategoryUpdateStatus)$/, 'new: store', 'small', 'low', 'eBay Store and its categories through the Trading API.'),
  R(/^Trading:(AddItems?|ReviseItem|RelistItem|EndItems?|VerifyAddItem|VerifyRelistItem|AddToItemDescription|GetSellerList|GetSellerEvents|GetDescriptionTemplates|GeteBayDetails|GetItemShipping)$/, 'listings', 'small', 'low', 'Non-fixed-price and bulk listing calls (auctions, up to 5/10 at once, listing change events, site details); fixed-price listing calls are already used.'),
  R(/^Trading:(GetTaxTable|SetTaxTable|GetShippingDiscountProfiles|SetShippingDiscountProfiles|GetUserPreferences|SetUserPreferences|GetNotificationPreferences|GetNotificationsUsage)$/, 'new: account', 'small', 'low', 'Account settings through the Trading API: tax table, shipping discounts, preferences, platform notification settings.'),
  R(/^Trading:(FetchToken|GetSessionID|ConfirmIdentity|GetTokenStatus|RevokeToken)$/, 'new: account', 'small', 'low', "Legacy Auth'n'Auth tokens; the dashboard already uses OAuth, so not needed."),
]

const tiktok_shop = [
  // Analytics
  R(/\/analytics\/\d+\/shop_(products|skus)/, 'analytics', 'small', 'high', 'Per-product and per-SKU performance: views, clicks, click-through and conversion rates, buyers and GMV, split by traffic source.'),
  R(/\/analytics\/\d+\/(shop_videos|videos)/, 'videos-live', 'small', 'high', 'Per-video performance: views, product clicks, orders and GMV from each shoppable video.'),
  R(/\/analytics\/\d+\/(live_rooms|shop_lives|shop\/\{live_id\})/, 'videos-live', 'small', 'medium', 'LIVE session stats: viewers, traffic sources, GMV and viewer trends per minute, product stats and audience profile.'),
  R(/\/analytics\/\d+\/(shop_performances|shop\/performance)/, 'analytics', 'small', 'high', 'Shop health: performance metrics with diagnosis, problem details and top items, benefits tier, hourly performance.'),
  R(/\/analytics\/\d+\/\w+\/bestselling$/, 'analytics', 'small', 'medium', 'Market best sellers: top products, videos, LIVEs and creators in your categories.'),
  R(/\/analytics\/\d+\/acc\//, 'analytics', 'medium', 'low', 'Audience insight: customer preferences, brands, penetration and LIVE/product preference factors.'),
  R(/\/analytics\/\d+\/off_site\//, 'analytics', 'small', 'low', 'Off-site traffic (ads and pixels) overview and details.'),
  R(/\/analytics\/\d+\/ai_report\//, 'analytics', 'medium', 'low', 'Custom AI report builder: query configurable dimensions and metrics.'),
  // Products
  R(/\/product\/\d+\/products\/(diagnoses|suggestions|seo_words|diagnose_optimize)$/, 'products', 'small', 'high', 'Listing quality: diagnosis of each product, fix suggestions and SEO keywords buyers search for.'),
  R(/\/product\/\d+\/inventory\/search$/, 'inventory', 'small', 'high', 'Stock per SKU and per warehouse for many products at once (check that stock sync is right).'),
  R(/\/product\/\d+\/compliance\//, 'products', 'medium', 'medium', 'Product safety compliance (EU GPSR): manufacturers and responsible persons, and compliance audits.'),
  R(/\/product\/\d+\/(global_|categories\/\{category_id\}\/global_)/, 'new: global products', 'large', 'low', 'Global (cross-border) products: one product published to several regional shops.'),
  R(/\/product\/\d+\/products\/listing_check$/, 'products', 'small', 'medium', 'Pre-check a listing for problems before publishing it.'),
  R(/\/product\/\d+\/opportunities/, 'products', 'medium', 'medium', 'Product opportunities: items buyers search for that the shop could list, and submit products for them.'),
  R(/\/product\/\d+\/search_videos/, 'videos-live', 'medium', 'low', 'Search videos: link products, keywords and comments to search-result videos.'),
  R(/^PUT \/product\/\d+\/products\/\{product_id\}$/, 'products', 'medium', 'medium', 'Full product edit (the partial edit is already used).'),
  R(/\/product\/\d+\/products\/\{product_id\}\/strikethrough_price/, 'promotions', 'small', 'medium', 'Set a strikethrough (was) price on a product.'),
  R(/\/product\/\d+\//, 'products', 'small', 'low', 'Product helpers: brands, size charts, image tools, attributes and categories, package estimates, appeals and task-based listing.'),
  // Promotion
  R(/\/promotion\/\d+\/(campaign_groups|campaigns|livestream_campaigns|product_campaigns|registered_campaigns|shop_campaigns|short_video_campaigns)/, 'promotions', 'medium', 'medium', 'TikTok platform campaigns: browse campaigns and see registrations.'),
  R(/\/promotion\/\d+\//, 'promotions', 'small', 'medium', 'Promotion details and edits: read one activity or coupon, update, republish and remove products.'),
  // Seller and authorization
  R(/\/seller\/\d+\/(permissions|shops|shop_groups)$/, 'new: account', 'small', 'low', 'Seller account: permissions, shop list and shop groups.'),
  R(/\/seller\/\d+\//, 'new: shop materials', 'small', 'low', 'Shop materials: upload and manage shop images and carousel content.'),
  R(/\/authorization\/\d+\/category_assets$/, 'products', 'small', 'low', 'Categories the shop is authorised to sell in.'),
  // Customer service and engagement
  R(/\/customer_service\/\d+\/performance$/, 'analytics', 'small', 'medium', 'Customer-service performance: response rate and response time.'),
  R(/\/customer_service\/\d+\//, 'customer-service', 'small', 'medium', 'Customer service: open a conversation, agent settings, images, sessions.'),
  R(/\/customer_engagement\/\d+\//, 'customers', 'medium', 'medium', 'Customer engagement: send messages and engagement tasks to customers from templates, and see their results.'),
  // Fulfilled by TikTok
  R(/\/fbt\/\d+\//, 'new: fulfilled by TikTok', 'large', 'medium', 'Fulfilled by TikTok: warehouses, inbound shipments, FBT stock and multi-channel outbound orders.'),
  // Finance
  R(/\/finance\/\d+\//, 'finance', 'small', 'high', 'Money detail: transactions per order and per statement, unsettled orders, account balances and balance history.'),
  // Fulfillment and logistics
  R(/\/fulfillment\/\d+\/packages\/(ship|deliver|combine|\{package_id\}\/uncombine)$|\/fulfillment\/\d+\/orders\/\{order_id\}\/split$|\/fulfillment\/\d+\/combinable_packages/, 'packages', 'medium', 'high', 'Ship from the dashboard: ship packages, mark delivered, combine/uncombine and split packages.'),
  R(/\/fulfillment\/\d+\/(orders\/\{order_id\}\/tracking|packages\/\{package_id\}(\/handover_time_slots)?)$/, 'packages', 'small', 'medium', 'Package detail, handover time slots and order tracking.'),
  R(/\/fulfillment\/\d+\//, 'packages', 'small', 'low', 'Other fulfillment: file/image/invoice upload, customs info, bundles, proof of delivery, shipping info updates.'),
  R(/\/logistics\/\d+\//, 'packages', 'small', 'low', 'Logistics: global warehouses, shipping templates and order tracking.'),
  R(/\/supply_chain\/\d+\//, 'packages', 'small', 'low', 'Sync package status from a third-party warehouse system.'),
  // Orders
  R(/\/order\/\d+\/orders\/\{order_id\}\/price_detail$/, 'orders', 'small', 'high', 'Order price breakdown: seller and platform discounts, shipping fee, taxes.'),
  R(/\/order\/\d+\//, 'orders', 'small', 'low', 'External orders link, proof-of-delivery and blind-box results.'),
  // Return and refund
  R(/\/return_refund\/\d+\//, 'returns-cancellations', 'small', 'medium', 'Returns and refunds: reject reasons, return records, eligibility, refund calculation, return shipping documents, after-sales review.'),
  // Affiliate seller
  R(/\/affiliate_seller\/\d+\/orders\/search$/, 'creators', 'small', 'high', 'Affiliate orders: which creator sold what, and the commission owed.'),
  R(/\/affiliate_seller\/\d+\/(open_collaboration|target_collaboration)/, 'creators', 'medium', 'high', 'Affiliate collaborations: open plans (any creator) and targeted plans with chosen creators — create, edit, search and settings.'),
  R(/\/affiliate_seller\/\d+\/sample_applications/, 'creators', 'medium', 'medium', 'Free samples: creators’ sample applications, approve or reject, and sample shipments.'),
  R(/\/affiliate_seller\/\d+\/(conversation|conversations|conversatons)/, 'creators', 'medium', 'medium', 'Chat with creators: conversations, messages, read state.'),
  R(/\/affiliate_seller\/\d+\//, 'creators', 'medium', 'low', 'Creator outreach and partner campaigns: creator detail, outreach quota and records, campaigns, media upload, offline report tasks.'),
  // Other
  R(/\/event\/\d+\/webhooks$/, 'new: notifications', 'small', 'low', 'Remove a webhook subscription (create and list are used).'),
  R(/\/open\/\d+\/|\/tools\/\d+\//, 'new: account', 'small', 'low', 'Developer tools endpoint (file upload initialisation).'),
]

const temu = [
  // Ads
  R(/^temu\.searchrec\.ad\.reports\.goods\.query$/, 'ads', 'small', 'high', 'Per-product ad report: spend, impressions, clicks, orders and ROAS for each advertised item.'),
  R(/^temu\.searchrec\.ad\./, 'ads', 'medium', 'medium', 'Run ads from the dashboard: create and edit ads, find eligible goods, ad details and change log, ROAS prediction.'),
  // Goods
  R(/^(bg\.local\.goods\.(add|update|partial\.update)|temu\.local\.goods\.(v[23]\.add|delete|attributes\.edit))$/, 'goods', 'large', 'high', 'Create, edit and delete Temu listings from the dashboard (today goods are only read and their stock/price/status changed).'),
  R(/^(bg\.local\.goods\.(detail\.query|sku\.list\.query)|temu\.local\.(goods\.list\.retrieve|sku\.list\.retrieve))$/, 'goods', 'small', 'high', 'Full goods detail and SKU list (attributes, images, variations) and the newer list calls.'),
  R(/^temu\.local\.goods\.sku\.stock\.query$/, 'inventory', 'small', 'high', 'Read the current stock Temu holds per SKU (to check stock sync).'),
  R(/^temu\.local\.goods\.(recommendedprice\.query|baseprice\.recommend)$|^bg\.local\.goods\.sku\.list\.price\.query$/, 'price-reviews', 'small', 'high', "Temu's recommended and current supplier price per SKU, to price competitively before a price review."),
  R(/^bg\.local\.goods\.(out\.sn|sku\.out\.sn)\./, 'goods', 'small', 'medium', "Set and check the seller's own goods/SKU codes on Temu (match Temu items to dashboard SKUs)."),
  R(/^bg\.local\.goods\.publish\.status\.get$/, 'goods', 'small', 'medium', 'Publication status of goods (live, under review, rejected).'),
  R(/compliance|^bg\.arbok\.|^bg\.goods\.compliancelabel/, 'goods', 'medium', 'medium', 'Product compliance: required certificates and qualification info, upload certificates, compliance labels.'),
  R(/^bg\.local\.goods\.|^temu\.local\.goods\.|^temu\.local\.product\./, 'goods', 'medium', 'low', 'Listing helpers: categories and rules, attribute templates, size charts, specs, image upload, brands, tax codes, wording check, pre-sale switch.'),
  R(/^bg\.flash\./, 'goods', 'small', 'low', 'Upload real product photos (real-shot images).'),
  // Orders
  R(/^bg\.order\.detail\.v2\.get$/, 'orders', 'small', 'high', 'Full order detail (items, prices, status) in one call.'),
  R(/^bg\.order\.decryptshippinginfo\.get$/, 'orders', 'small', 'medium', "Buyer's full shipping address when it is masked in the order."),
  R(/^temu\.order\.amount\.v2\.query$/, 'orders', 'small', 'medium', 'Newer order amount breakdown (the older amount call is used).'),
  R(/^temu\.order\.cancel\./, 'orders', 'small', 'medium', 'Cancellation follow-up: result of out-of-stock cancellations and cancellation appeals.'),
  R(/^bg\.order\.(combinedshipment\.list\.get|unshipped\.package\.get)$/, 'shipping', 'small', 'medium', 'Orders that can ship together and unshipped packages.'),
  R(/^bg\.order\.customization\.get$|^temu\.local\.order\.verification/, 'orders', 'small', 'low', 'Order customisation details and order verification uploads.'),
  // Promotions
  R(/^bg\.promotion\.activity\.(candidate\.goods|goods)\./, 'promotions', 'medium', 'high', 'Join Temu activities: eligible goods, enrol them, see and edit enrolled goods and enrolment results.'),
  // After-sales
  R(/^(bg\.aftersales\.aftersales\.list\.get|temu\.aftersales\.parentaftersales\.detail\.get)$/, 'after-sales', 'small', 'high', 'After-sales detail: each return/refund line and its full record.'),
  R(/aftersales|returnorder/, 'after-sales', 'medium', 'medium', 'Return logistics: return label, return address, carriers, reverse-shipment info.'),
  // Shipping
  R(/^bg\.logistics\.(shipment\.(create|result\.get|document\.get|update|shippingtype\.update)|shippingservices\.get)$/, 'shipping', 'large', 'high', 'Buy Temu shipping labels: available services, buy, print the label, retry and change shipping type.'),
  R(/^(bg\.logistics\.shipment\.v2\.get|bg\.logistics\.shipment\.sub\.confirm|bg\.logistics\.shipped\.package\.confirm|temu\.track\.trackinginfo\.get)$/, 'shipping', 'small', 'medium', 'Shipment information, extra tracking numbers, confirm shipped packages, tracking events.'),
  R(/^temu\.logistics\./, 'shipping', 'small', 'low', 'Carrier pickup reservations, label list and shipping logistics types.'),
  R(/^bg\.cooperativewarehouse\./, 'new: cooperative warehouse', 'large', 'low', "Fulfilment by Temu's partner warehouses: providers, authorise, submit and cancel fulfilment."),
  R(/^temu\.local\.mall\.tags\.get$/, 'new: account', 'small', 'low', 'Store tags (store type and programs).'),
]

module.exports = { ebay, tiktok_shop, temu }
