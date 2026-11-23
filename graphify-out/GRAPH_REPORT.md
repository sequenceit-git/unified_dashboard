# Graph Report - unified_dashboard  (2026-11-23)

## Corpus Check
- 65 files · ~565,506 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1577 nodes · 3799 edges · 80 communities (74 shown, 6 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 211 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Auth Context & Listing Forms
- eBay Integration Specs
- Shop Events & Seeding
- Project Scope & Contract
- AI Product Discovery Agent
- Unified Marketplace Manager
- Catalog & Inventory Routes
- Discovery Listing Images
- Shop Model & Temu Smoke
- Frontend Package Dependencies
- Backend Package Dependencies
- TikTok Shop Service
- DB Config & Core Models
- UI Modal & Marketplace Labels
- eBay Trading XML Service
- User Access & Auth Routes
- Marketplace Config & TikTok Smoke
- UI Badges & Tables
- eBay REST Service
- TikTok Listing Helpers
- Dashboard Layout & Sidebar
- Auth & RBAC Middleware
- Order & Customer Models
- Shop Routes & Response Cache
- Marketplace Section Loaders
- Audit, Inbox & Notification Models
- Product & Variant Model
- Shop Section Gating UI
- Cards, Pagination & Analytics
- Live Events Hook
- Market Research Routes
- eBay Webhook Notifications
- Search & Access Map
- Ignored Listings & Customer Stats
- Inbox AI Bot
- Root Workspace Scripts
- eBay Shop Model & Smoke
- AI Settings & Encryption
- Analytics Routes
- eBay Account Deletion API
- eBay Listing Action Helpers
- Temu API Signing & Orders
- TikTok Webhook Notifications
- App Favicon Graphics
- Backend npm Scripts
- Docker Frontend Service
- Cursor eBay MCP Config
- Image Upload Route
- Docker Backend Service
- Docker MongoDB Service
- Frontend SVG Icon Sprite
- eBay Inbox Messaging
- Docker Healthcheck Config
- Docker Redis Service
- Docker Compose Root
- Docker Networks
- Oxlint Config
- Community 57
- Community 58
- Agents TTS Skill Config
- Agents TTS Skill Config
- Agents TTS Skill Config
- Agents TTS Skill Config
- Agents TTS Skill Config
- Agents TTS Skill Config
- Product Draft Access
- Cursor TTS Skill Config
- Cursor TTS Skill Config
- Cursor TTS Skill Config
- Cursor TTS Skill Config
- Cursor TTS Skill Config
- Cursor TTS Skill Config
- Docker Service Dependencies
- Performance Date Helpers
- Retry Utility
- Hero Illustration
- Vite Logo
- Backend Vercel Config
- React Logo
- Frontend Vercel Config

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 86 edges
2. `react` - 49 edges
3. `UnifiedMarketplaceManager` - 48 edges
4. `TikTokShopService` - 46 edges
5. `EbayService` - 42 edges
6. `DirectListModal()` - 35 edges
7. `mongoose` - 32 edges
8. `api` - 30 edges
9. `ListModal()` - 30 edges
10. `Select` - 25 edges

## Surprising Connections (you probably didn't know these)
- `eBay Dashboard Write & OAuth Sync` --references--> `orderSchema`  [EXTRACTED]
  .cursor/skills/ebay-shop-api/SKILL.md → backend/models/Order.js
- `Temu Dashboard Connector & Order State Mapping` --references--> `ORDER_STATUS`  [INFERRED]
  .cursor/skills/temu-shop-api/SKILL.md → backend/services/marketplace/temu.js
- `eBay Dashboard Write & OAuth Sync` --references--> `shopSchema`  [EXTRACTED]
  .cursor/skills/ebay-shop-api/SKILL.md → backend/models/Shop.js
- `eBay Dashboard Write & OAuth Sync` --references--> `marketplaceServices`  [EXTRACTED]
  .cursor/skills/ebay-shop-api/SKILL.md → backend/services/marketplace/index.js
- `Temu Dashboard Connector & Order State Mapping` --references--> `marketplaceServices`  [INFERRED]
  .cursor/skills/temu-shop-api/SKILL.md → backend/services/marketplace/index.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **BSO v3 Sandbox Order Material Preparation Workflow** — agents_skills_tts_open_toolkit_references_cli_usage_bso_v3_sandbox_commands, agents_skills_tts_openapi_sandbox_materials_skill_tts_openapi_sandbox_materials, agents_skills_tts_openapi_sandbox_materials_skill_sandbox_canonical_states, agents_skills_tts_openapi_sandbox_materials_references_order_material_recipes_state_advancement_recipe [EXTRACTED 1.00]
- **BSO v3 Sandbox Order Material Pipeline** — cursor_skills_tts_open_toolkit_references_cli_usage_typed_bso_v3_sandbox_workflow, cursor_skills_tts_openapi_sandbox_materials_skill_sandbox_order_construction_protocol, cursor_skills_tts_openapi_sandbox_materials_skill_canonical_sandbox_order_states, cursor_skills_tts_openapi_sandbox_materials_references_order_material_recipes_incremental_order_transition_recipe [EXTRACTED 1.00]
- **US Product Discovery Verification & Ranking Pipeline** — discovery_agent_architecture_product_discovery_agent, discovery_agent_architecture_us_marketplace_scope, discovery_agent_architecture_evidence_memory, discovery_agent_architecture_us_listing_verification, discovery_agent_architecture_economics_scoring, discovery_agent_architecture_incremental_persistence [EXTRACTED 1.00]
- **Pilot Supersonic Delta Wing Emblem Layers** — frontend_public_favicon_main_pilot_wings, frontend_public_favicon_inner_speed_core, frontend_public_favicon_forward_navigation_line, frontend_public_favicon_pilot_beacon [EXTRACTED 1.00]
- **icons.svg Exported Symbol Set** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_documentation_icon, frontend_public_icons_github_icon, frontend_public_icons_social_icon, frontend_public_icons_x_icon [EXTRACTED 1.00]
- **Product Discovery 2 4-Skill Agentic Loop** — backend_agent_discovery_skills_readme_product_discovery_2_skills, backend_agent_discovery_skills_product_discovery_search_skill_product_discovery_search, backend_agent_discovery_skills_cross_market_validation_skill_cross_market_validation, backend_agent_discovery_skills_sourcing_and_unit_economics_skill_sourcing_and_unit_economics, backend_agent_discovery_skills_opportunity_scoring_rubric_skill_opportunity_scoring_rubric [EXTRACTED 1.00]
- **TikTok Shop Open Toolkit Skill Suite** — agents_skills_tiktok_shop_api_skill_tiktok_shop_api, agents_skills_tts_developer_onboarding_guide_skill_tts_developer_onboarding_guide, agents_skills_tts_openapi_guide_skill_tts_openapi_guide, agents_skills_tts_openapi_faq_index_skill_tts_openapi_faq_index, agents_skills_tts_openapi_sandbox_materials_skill_tts_openapi_sandbox_materials, agents_skills_tts_open_toolkit_skill_tts_open_toolkit, agents_skills_tts_open_platform_glossary_skill_tts_open_platform_glossary [EXTRACTED 1.00]
- **Unified Dashboard Marketplace Service Contract (eBay / Temu / TikTok Shop)** — agents_skills_ebay_shop_api_skill_ebay_service_contract, agents_skills_ebay_shop_api_skill_ebay_marketplace_service, agents_skills_temu_shop_api_skill_temu_marketplace_service, agents_skills_tiktok_shop_api_skill_tiktok_marketplace_service [EXTRACTED 1.00]
- **Unified US Marketplace Connector Architecture** — cursor_skills_ebay_shop_api_skill_ebay_dashboard_write_sync, cursor_skills_temu_shop_api_skill_temu_dashboard_connector, cursor_skills_tiktok_shop_api_skill_tiktok_dashboard_connector, backend_services_marketplace_index_marketplaceservices [EXTRACTED 1.00]
- **Unified Dashboard Scope, ERP Design System & Section Pages Alignment** — all_feature_project_development_agreement, design_modern_enterprise_direction, design_application_shell_navigation, design_tables_forms_components, frontend_src_pages_readme_section_pages_architecture, frontend_src_pages_readme_shared_frontend_layer [INFERRED 0.85]
- **Ecom Indigo-Violet-Sky Gradient Palette** — frontend_public_favicon_ecombg, frontend_public_favicon_ecomwing, frontend_public_favicon_ecomglow [INFERRED 0.85]
- **Solid Social and Developer Brand Icons (#08060d)** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_github_icon, frontend_public_icons_x_icon [INFERRED 0.95]
- **TikTok Shop Open Platform Skill Suite** — cursor_skills_tiktok_shop_api_skill_tiktok_shop_api, cursor_skills_tts_open_toolkit_skill_tts_open_toolkit, cursor_skills_tts_developer_onboarding_guide_skill_tts_developer_onboarding_guide, cursor_skills_tts_openapi_guide_skill_tts_openapi_guide, cursor_skills_tts_openapi_faq_index_skill_tts_openapi_faq_index, cursor_skills_tts_openapi_sandbox_materials_skill_tts_openapi_sandbox_materials, cursor_skills_tts_open_platform_glossary_skill_tts_open_platform_glossary, cursor_skills_tts_seller_university_basic_knowledge_index_skill_tts_seller_university_basic_knowledge_index [INFERRED 0.95]

## Communities (80 total, 6 thin omitted)

### Community 0 - "Auth Context & Listing Forms"
Cohesion: 0.06
Nodes (102): AuthContext, QUICK_ACCOUNTS, ALIASES, aliasKey(), AttributeField(), matchAspects(), pickAllowed(), tokens() (+94 more)

### Community 1 - "eBay Integration Specs"
Cohesion: 0.05
Nodes (51): eBay Marketplace Service (backend/services/marketplace/ebay.js), eBay OAuth2 Authorization & Token Flow, Official eBay MCP Server (@ebay/npm-public-api-mcp), eBay Marketplace Service Method Contract, eBay Shop API Skill, Shop.auth Token Storage & Order Enum Mapping, Temu Marketplace Service (backend/services/marketplace/temu.js), Temu US Local-Seller OAuth Flow (+43 more)

### Community 2 - "Shop Events & Seeding"
Cohesion: 0.06
Nodes (48): connectShop(), main(), { EventEmitter }, local, publish(), subscribe(), describe(), FAILED_RAW (+40 more)

### Community 3 - "Project Scope & Contract"
Cohesion: 0.06
Nodes (45): AI Market Research Bot Module, Automation & AI Scope, Commercial & Legal Terms (BDT 30,000 / 20 Days), Dashboard & Analytics Scope, Inventory Management Scope, Kazi Rana / MasudRana LLC (Client), Marketplace Integration Scope (eBay, Temu, TikTok Shop), Order Management Scope (+37 more)

### Community 4 - "AI Product Discovery Agent"
Cohesion: 0.07
Nodes (43): callWebSearch(), delay(), discoverCandidates(), generateAiNotes(), getOpenAIClient(), linkOf(), marketplaceLabel(), normalizeCategories() (+35 more)

### Community 5 - "Unified Marketplace Manager"
Cohesion: 0.10
Nodes (5): escapeRegex(), ignoreTokens(), listingAliases(), productKey(), UnifiedMarketplaceManager

### Community 6 - "Catalog & Inventory Routes"
Cohesion: 0.09
Nodes (26): express, router, express, router, SORTABLE, express, router, express (+18 more)

### Community 7 - "Discovery Listing Images"
Cohesion: 0.06
Nodes (38): TikTok Shop API Skill, ISV App Onboarding Path, Seller Developer Custom App Path, TikTok Shop Developer Onboarding Guide, TTS Developer Onboarding Guide Skill, 3PL and 4PL Logistics Models, Developer Shop, CB, Local Shop, and Bundle Terms, TTS Open Platform Glossary (+30 more)

### Community 8 - "Shop Model & Temu Smoke"
Cohesion: 0.10
Nodes (38): decodeHtml(), ebayImages(), ebayItemId(), ebayToken(), imagesFromListing(), imageUrlsFromHtml(), isDirectImage(), productImages() (+30 more)

### Community 9 - "Frontend Package Dependencies"
Cohesion: 0.09
Nodes (20): shopSchema, check(), main(), mongoose, path, results, root, WRITE_SCOPE_AUDIT (+12 more)

### Community 10 - "Backend Package Dependencies"
Cohesion: 0.07
Nodes (33): dependencies, react@^19.2.8, react-dom@^19.2.8, react-icons@^5.7.0, react-router-dom@^7.18.4, recharts@^3.10.1, tailwindcss@^4.3.3, @tailwindcss/vite@^4.3.3 (+25 more)

### Community 11 - "TikTok Shop Service"
Cohesion: 0.08
Nodes (33): author, dependencies, bcryptjs@^3.0.3, bullmq@^6.3.12, cors@^2.8.6, dotenv@^18.0.6, exceljs@^4.4.0, fast-xml-parser@^4.5.7 (+25 more)

### Community 12 - "DB Config & Core Models"
Cohesion: 0.13
Nodes (3): assertNoBatchErrors(), chatMessage(), TikTokShopService

### Community 13 - "UI Modal & Marketplace Labels"
Cohesion: 0.09
Nodes (25): connectDB(), mongoose, inventoryLogSchema, mongoose, listingSchema, mongoose, mongoose, templateSchema (+17 more)

### Community 14 - "eBay Trading XML Service"
Cohesion: 0.16
Nodes (24): Button(), Modal(), EVIDENCE_LABELS, EXTRA_LABELS, marketplaceBadgeColor(), marketplaceLabel(), MARKETPLACES, AgentProgressBar() (+16 more)

### Community 15 - "User Access & Auth Routes"
Cohesion: 0.13
Nodes (25): addListing(), bestOfferXml(), CONDITION_IDS, CORE_NOTIFICATION_EVENTS, EBAY_IDENTIFIER_PATTERNS, escapeXml(), getActiveItemIds(), getActiveListings() (+17 more)

### Community 16 - "Marketplace Config & TikTok Smoke"
Cohesion: 0.07
Nodes (15): MAIN_ROUTES, clearUserAccessCache(), signToken(), mongoose, userSchema, mongoose, userShopAccessSchema, bcrypt (+7 more)

### Community 17 - "UI Badges & Tables"
Cohesion: 0.08
Nodes (15): MARKETPLACE_CONFIG, check(), main(), mongoose, path, results, root, ebayListings() (+7 more)

### Community 18 - "eBay REST Service"
Cohesion: 0.23
Nodes (18): Badge(), COLORS, statusColor(), DataTable(), EmptyState(), ErrorState(), Spinner(), useApi() (+10 more)

### Community 20 - "Dashboard Layout & Sidebar"
Cohesion: 0.10
Nodes (23): amountOf(), attributeMap(), auditReason(), CARRIER_ALIASES, categoryPath(), certificationRequired(), crypto, fs (+15 more)

### Community 21 - "Auth & RBAC Middleware"
Cohesion: 0.13
Nodes (23): DashboardLayout(), NotificationBell(), timeAgo(), TONE, itemClass(), ItemLabel(), NavItem(), readOpen() (+15 more)

### Community 22 - "Order & Customer Models"
Cohesion: 0.12
Nodes (15): accessCache, canUseSection(), jwt, limitToSection(), loadAccess(), requireAuth(), requireRole(), express@^5.2.1 (+7 more)

### Community 23 - "Shop Routes & Response Cache"
Cohesion: 0.14
Nodes (20): addressSchema, customerSchema, identitySchema, mongoose, mongoose, orderItemSchema, orderSchema, returnSchema (+12 more)

### Community 24 - "Marketplace Section Loaders"
Cohesion: 0.21
Nodes (17): AdminOnly(), App(), PublicOnly(), RouteAccess(), useAuth(), ProtectedRoute(), ShopSectionGate(), ImageDropzone() (+9 more)

### Community 25 - "Audit, Inbox & Notification Models"
Cohesion: 0.13
Nodes (15): notifyOrderChanged(), express, router, cachedResponse(), claim(), crypto, del(), get() (+7 more)

### Community 26 - "Product & Variant Model"
Cohesion: 0.09
Nodes (10): AFTERSALES_GROUP, EBAY, hasLoader(), load(), LOADERS, tables(), TEMU, temuAmount() (+2 more)

### Community 27 - "Shop Section Gating UI"
Cohesion: 0.09
Nodes (16): auditLogSchema, mongoose, conversationSchema, mongoose, mongoose, notificationSchema, TYPES, mongoose (+8 more)

### Community 28 - "Cards, Pagination & Analytics"
Cohesion: 0.14
Nodes (15): identifierCodeSchema, mongoose, productSchema, variantSchema, APPLY, itemIdOf(), main(), mongoose (+7 more)

### Community 29 - "Live Events Hook"
Cohesion: 0.20
Nodes (14): RequireShopSection(), MarketplaceText(), Tabs(), allowedShopSections(), fallbackShopId(), useShopSection(), SHOP_SECTIONS, shopSectionFromId() (+6 more)

### Community 30 - "Market Research Routes"
Cohesion: 0.24
Nodes (13): Card(), StatCard(), Pagination(), queryString(), AnalyticsPage(), rangeParams(), RANGES, MarketplaceChart() (+5 more)

### Community 31 - "eBay Webhook Notifications"
Cohesion: 0.18
Nodes (16): BASE, connect(), listeners, useLiveEvents(), useSyncReload(), StockTab(), CONNECTABLE, SettingsPage() (+8 more)

### Community 32 - "Search & Access Map"
Cohesion: 0.14
Nodes (13): requireMainRoute(), ACTIVE_LISTING, express, mongoose, RELISTABLE, router, SHOP_LABELS, buildExportRow() (+5 more)

### Community 33 - "Ignored Listings & Customer Stats"
Cohesion: 0.19
Nodes (16): crypto, enable(), escapeRegex(), eventNames(), expectedSignature(), findShop(), handle(), JOB_FOR_EVENT (+8 more)

### Community 34 - "Inbox AI Bot"
Cohesion: 0.19
Nodes (13): MARKETPLACE_SUBSECTIONS, PLATFORM_ROUTES, ROUTE_LABELS, SHOP_ROUTES, SUBSECTION_LABELS, AccessPill(), choiceCardClass(), EditAccessModal() (+5 more)

### Community 35 - "Root Workspace Scripts"
Cohesion: 0.20
Nodes (10): ignoredListingSchema, mongoose, buyerKeys(), customerMatchesOrder(), findCustomerOrders(), orderAmount(), orderMatch(), saveCustomerStats() (+2 more)

### Community 36 - "eBay Shop Model & Smoke"
Cohesion: 0.21
Nodes (12): messageSchema, mongoose, failConversation(), instructions(), MARKETPLACE_LABEL, OpenAI, productList(), refreshThread() (+4 more)

### Community 37 - "AI Settings & Encryption"
Cohesion: 0.14
Nodes (14): description, devDependencies, concurrently@^9.1.2, name, private, scripts, build, dev (+6 more)

### Community 38 - "Analytics Routes"
Cohesion: 0.19
Nodes (8): mongoose, check(), main(), mongoose, path, results, root, ebayFetch()

### Community 39 - "eBay Account Deletion API"
Cohesion: 0.25
Nodes (12): appSettingSchema, mongoose, cache, checkModelName(), crypto, decrypt(), encrypt(), getAiConfig() (+4 more)

### Community 40 - "eBay Listing Action Helpers"
Cohesion: 0.22
Nodes (10): dates(), express, intervalSales(), marketplaceFilter(), match(), money(), mongoose, orderProfitAndStatus() (+2 more)

### Community 41 - "Temu API Signing & Orders"
Cohesion: 0.23
Nodes (8): crypto, express, router, crypto, keyCache, publicKey(), purgeUser(), verifySignature()

### Community 42 - "TikTok Webhook Notifications"
Cohesion: 0.29
Nodes (7): ebayItemId(), call(), cdata(), endListing(), relistListing(), reviseInventoryStatus(), reviseListing()

### Community 43 - "App Favicon Graphics"
Cohesion: 0.18
Nodes (5): extractDistrict(), normalizeOrder(), signRequest(), TikTok Shop Dashboard Connector Spec, TikTok Shop HMAC-SHA256 Signing

### Community 44 - "Backend npm Scripts"
Cohesion: 0.27
Nodes (10): crypto, enable(), EVENTS, expectedSignature(), findShop(), handle(), notifyUrl(), resolveKind() (+2 more)

### Community 45 - "Docker Frontend Service"
Cohesion: 0.20
Nodes (12): Pilot Supersonic Delta Wing / Navigation Emblem, ecomBg Diagonal Indigo-Violet Gradient, ecomGlow Sky-Indigo Gradient, ecomWing White-Periwinkle Gradient, Forward Vector Navigation Line, Inner Cockpit / Speed Core, Main Aerodynamic Pilot Wings, Pilot App Favicon (64x64 SVG) (+4 more)

### Community 46 - "Cursor eBay MCP Config"
Cohesion: 0.20
Nodes (10): scripts, cleanup:ebay, cleanup:temu, dev, encrypt-recipient-pii, seed, smoke:ebay, smoke:temu (+2 more)

### Community 47 - "Image Upload Route"
Cohesion: 0.22
Nodes (10): build, context, dockerfile, build, container_name, depends_on, labels, networks (+2 more)

### Community 48 - "Docker Backend Service"
Cohesion: 0.28
Nodes (6): ebay-api, eBay Shop API Skill, EBAY_API_ENV, EBAY_TOKEN_TYPE, npx, @ebay/npm-public-api-mcp

### Community 49 - "Docker MongoDB Service"
Cohesion: 0.25
Nodes (6): crypto, express, fs, path, router, UPLOADS_DIR

### Community 50 - "Frontend SVG Icon Sprite"
Cohesion: 0.25
Nodes (8): container_name, env_file, environment, labels, networks, restart, volumes, backend

### Community 51 - "eBay Inbox Messaging"
Cohesion: 0.25
Nodes (8): container_name, environment, image, networks, ports, restart, volumes, mongo

### Community 52 - "Docker Healthcheck Config"
Cohesion: 0.29
Nodes (8): Bluesky Icon ClipPath (bluesky-clip), Bluesky Icon Symbol (bluesky-icon), Discord Icon Symbol (discord-icon), Documentation Icon Symbol (documentation-icon), GitHub Icon Symbol (github-icon), Social Icon Symbol (social-icon), SVG Icon Sprite (icons.svg), X Icon Symbol (x-icon)

### Community 54 - "Docker Compose Root"
Cohesion: 0.43
Nodes (7): interval, retries, start_period, test, timeout, healthcheck, healthcheck

### Community 55 - "Docker Networks"
Cohesion: 0.29
Nodes (7): command, container_name, image, networks, restart, volumes, redis

### Community 56 - "Oxlint Config"
Cohesion: 0.33
Nodes (5): services, volumes, backend-uploads, mongodb-data, redis-data

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (6): driver, networks, internal-net, traefik-net, external, name

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 59 - "Agents TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 60 - "Agents TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 61 - "Agents TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 62 - "Agents TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 63 - "Agents TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 64 - "Agents TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 65 - "Product Draft Access"
Cohesion: 0.60
Nodes (3): isMine(), productAccess(), requireProductAccess()

### Community 66 - "Cursor TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 67 - "Cursor TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 68 - "Cursor TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 69 - "Cursor TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 70 - "Cursor TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 71 - "Cursor TTS Skill Config"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 72 - "Docker Service Dependencies"
Cohesion: 0.40
Nodes (5): depends_on, mongo, redis, condition, condition

### Community 74 - "Retry Utility"
Cohesion: 0.67
Nodes (3): DEFAULT_OPTIONS, sleep(), withRetry()

### Community 75 - "Hero Illustration"
Cohesion: 0.67
Nodes (3): Hero Stacked Layers Illustration, Lower Textured Violet Rounded-Square Layer, Upper Wireframe Rounded-Square Layer

### Community 76 - "Vite Logo"
Cohesion: 0.67
Nodes (3): Dark Mode Adaptive Parenthesis Styling, Vite, Vite Logo

## Ambiguous Edges - Review These
- `Sourcing & Unit Economics Skill` → `Product Discovery Agent Pipeline (discoveryAgent.js)`  [AMBIGUOUS]
  discovery_agent_architecture.md · relation: conceptually_related_to

## Knowledge Gaps
- **42 isolated node(s):** `EBAY_API_ENV`, `npx`, `ISV App Onboarding Path`, `3PL and 4PL Logistics Models`, `Developer Shop, CB, Local Shop, and Bundle Terms` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 507 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Auth Context & Listing Forms` to `Inbox AI Bot`, `Backend Package Dependencies`, `eBay Trading XML Service`, `eBay REST Service`, `Auth & RBAC Middleware`, `Marketplace Section Loaders`, `Live Events Hook`, `Market Research Routes`, `eBay Webhook Notifications`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **What connects `EBAY_API_ENV`, `npx`, `ISV App Onboarding Path` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth Context & Listing Forms` be split into smaller, more focused modules?**
  _Cohesion score 0.05696058327637275 - nodes in this community are weakly interconnected._
- **Should `eBay Integration Specs` be split into smaller, more focused modules?**
  _Cohesion score 0.05182443151771549 - nodes in this community are weakly interconnected._
- **Should `Shop Events & Seeding` be split into smaller, more focused modules?**
  _Cohesion score 0.061016949152542375 - nodes in this community are weakly interconnected._
- **Should `Project Scope & Contract` be split into smaller, more focused modules?**
  _Cohesion score 0.05584415584415584 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Sourcing & Unit Economics Skill` and `Product Discovery Agent Pipeline (discoveryAgent.js)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._