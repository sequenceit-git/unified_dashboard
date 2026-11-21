# Graph Report - unified_dashboard  (2026-11-22)

## Corpus Check
- 24 files · ~541,940 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1451 nodes · 3412 edges · 71 communities (65 shown, 6 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 192 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- AI Product Discovery Agent
- Shop Events & Seeding
- Agent Marketplace API Skills
- TikTok Shop Service
- Frontend Dashboard Layout
- Project Architecture & Specs
- AI Settings & Encryption
- Audit, Inbox & Inventory Models
- Frontend Package Dependencies
- Unified Marketplace Manager
- Auth & RBAC Middleware
- TikTok Onboarding & Glossary
- Listing Attributes & Modals
- Backend Package Dependencies
- Analytics & Customer Stats
- Product & Listing Models
- UI Table & Card Components
- Frontend App Routing
- eBay REST Service
- Shop Profiles & Gate UI
- eBay Trading XML Service
- Auth Context & Live Events
- User Access & Auth Routes
- Marketplace Section Loaders
- Access Control & API Hooks
- Backend Express API Routers
- Market Research API Routes
- Order Schema & Models
- Marketplace Section Profiles
- Temu Marketplace Service
- eBay Webhook Notifications
- Root Workspace Scripts
- UI Badges & Marketplace Tabs
- Direct Listing Hook
- App Favicon Graphics
- DB Config & eBay Scripts
- eBay Account Deletion Webhook
- Temu API Signing & Config
- Docker Frontend Service
- Cursor eBay MCP Config
- eBay Inbox Messaging Helpers
- Listing & Product Access
- eBay Listing Action Helpers
- Docker Backend Service
- Docker MongoDB Service
- Frontend SVG Icon Sprite
- Docker Healthcheck Config
- Docker Redis Service
- Shop Section Promotions UI
- Docker Volumes Config
- Docker Networks Config
- Frontend Oxlint Config
- Agents TTS Onboarding YAML
- Agents TTS Glossary YAML
- Agents TTS FAQ YAML
- Agents TTS OpenAPI YAML
- Agents TTS Sandbox YAML
- Agents Seller Univ YAML
- Cursor TTS Onboarding YAML
- Cursor TTS Glossary YAML
- Cursor TTS FAQ YAML
- Cursor TTS OpenAPI YAML
- Cursor TTS Sandbox YAML
- Cursor Seller Univ YAML
- Docker Worker Service
- Backend Retry Utility
- Hero Illustration Asset
- Vite Logo Asset
- Backend Vercel Rewrites
- React Logo Asset
- Frontend Vercel Rewrites

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 76 edges
2. `react` - 45 edges
3. `UnifiedMarketplaceManager` - 45 edges
4. `EbayService` - 41 edges
5. `TikTokShopService` - 37 edges
6. `Button()` - 30 edges
7. `mongoose` - 29 edges
8. `api` - 27 edges
9. `Card()` - 26 edges
10. `Select` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Temu Dashboard Connector & Order State Mapping` --references--> `ORDER_STATUS`  [INFERRED]
  .cursor/skills/temu-shop-api/SKILL.md → backend/services/marketplace/temu.js
- `eBay Dashboard Write & OAuth Sync` --references--> `orderSchema`  [EXTRACTED]
  .cursor/skills/ebay-shop-api/SKILL.md → backend/models/Order.js
- `Temu Dashboard Connector & Order State Mapping` --references--> `marketplaceServices`  [INFERRED]
  .cursor/skills/temu-shop-api/SKILL.md → backend/services/marketplace/index.js
- `TikTok Shop HMAC-SHA256 Signing` --references--> `signRequest()`  [INFERRED]
  .cursor/skills/tiktok-shop-api/SKILL.md → backend/services/marketplace/tiktok.js
- `Temu Router & MD5 Request Signing` --references--> `sign()`  [INFERRED]
  .cursor/skills/temu-shop-api/SKILL.md → backend/services/marketplace/temu.js

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

## Communities (71 total, 6 thin omitted)

### Community 0 - "AI Product Discovery Agent"
Cohesion: 0.06
Nodes (54): callWebSearch(), delay(), discoverCandidates(), generateAiNotes(), getOpenAIClient(), linkOf(), marketplaceLabel(), normalizeCategories() (+46 more)

### Community 1 - "Shop Events & Seeding"
Cohesion: 0.05
Nodes (55): cachedResponse(), claim(), crypto, get(), inflight, invalidate(), memory, memoryGet() (+47 more)

### Community 2 - "Agent Marketplace API Skills"
Cohesion: 0.05
Nodes (51): eBay Marketplace Service (backend/services/marketplace/ebay.js), eBay OAuth2 Authorization & Token Flow, Official eBay MCP Server (@ebay/npm-public-api-mcp), eBay Marketplace Service Method Contract, eBay Shop API Skill, Shop.auth Token Storage & Order Enum Mapping, Temu Marketplace Service (backend/services/marketplace/temu.js), Temu US Local-Seller OAuth Flow (+43 more)

### Community 3 - "TikTok Shop Service"
Cohesion: 0.07
Nodes (23): amountOf(), attributeMap(), auditReason(), categoryPath(), certificationBytes(), certificationRequired(), chatMessage(), crypto (+15 more)

### Community 4 - "Frontend Dashboard Layout"
Cohesion: 0.08
Nodes (46): DashboardLayout(), NotificationBell(), timeAgo(), TONE, DEFAULT_SECTIONS, itemClass(), ItemLabel(), NavItem() (+38 more)

### Community 5 - "Project Architecture & Specs"
Cohesion: 0.06
Nodes (45): AI Market Research Bot Module, Automation & AI Scope, Commercial & Legal Terms (BDT 30,000 / 20 Days), Dashboard & Analytics Scope, Inventory Management Scope, Kazi Rana / MasudRana LLC (Client), Marketplace Integration Scope (eBay, Temu, TikTok Shop), Order Management Scope (+37 more)

### Community 6 - "AI Settings & Encryption"
Cohesion: 0.08
Nodes (45): appSettingSchema, mongoose, cache, checkModelName(), crypto, decrypt(), encrypt(), getAiConfig() (+37 more)

### Community 7 - "Audit, Inbox & Inventory Models"
Cohesion: 0.05
Nodes (32): auditLogSchema, mongoose, conversationSchema, mongoose, addressSchema, customerSchema, identitySchema, mongoose (+24 more)

### Community 8 - "Frontend Package Dependencies"
Cohesion: 0.06
Nodes (43): encryptAddress(), encryptPlain(), migrate(), mongoose, path, root, crypto, decrypt() (+35 more)

### Community 9 - "Unified Marketplace Manager"
Cohesion: 0.10
Nodes (4): ignoreTokens(), listingAliases(), productKey(), UnifiedMarketplaceManager

### Community 10 - "Auth & RBAC Middleware"
Cohesion: 0.07
Nodes (31): accessCache, canUseSection(), clearUserAccessCache(), jwt, limitToSection(), loadAccess(), requireAuth(), requireMainRoute() (+23 more)

### Community 11 - "TikTok Onboarding & Glossary"
Cohesion: 0.06
Nodes (38): TikTok Shop API Skill, ISV App Onboarding Path, Seller Developer Custom App Path, TikTok Shop Developer Onboarding Guide, TTS Developer Onboarding Guide Skill, 3PL and 4PL Logistics Models, Developer Shop, CB, Local Shop, and Bundle Terms, TTS Open Platform Glossary (+30 more)

### Community 12 - "Listing Attributes & Modals"
Cohesion: 0.14
Nodes (31): ALIASES, aliasKey(), AttributeField(), matchAspects(), pickAllowed(), tokens(), CertificationFields(), certificationNeeded() (+23 more)

### Community 13 - "Backend Package Dependencies"
Cohesion: 0.06
Nodes (41): author, dependencies, bcryptjs@^3.0.3, bullmq@^6.3.12, cors@^2.8.6, dotenv@^18.0.6, exceljs@^4.4.0, express@^5.2.1 (+33 more)

### Community 14 - "Analytics & Customer Stats"
Cohesion: 0.09
Nodes (15): express, router, express, SORTABLE, express, router, express, router (+7 more)

### Community 15 - "Product & Listing Models"
Cohesion: 0.08
Nodes (29): connectDB(), mongoose, mongoose, productSchema, variantSchema, mongoose, shopSchema, apply (+21 more)

### Community 16 - "UI Table & Card Components"
Cohesion: 0.17
Nodes (22): RequireShopSection(), Card(), StatCard(), DataTable(), EmptyState(), Pagination(), SearchInput(), fallbackShopId() (+14 more)

### Community 17 - "Frontend App Routing"
Cohesion: 0.18
Nodes (24): AdminOnly(), App(), PublicOnly(), RouteAccess(), useAuth(), ProtectedRoute(), ErrorState(), Spinner() (+16 more)

### Community 19 - "Shop Profiles & Gate UI"
Cohesion: 0.17
Nodes (20): ShopSectionGate(), RowMenu(), DIRECT_DEFAULTS, listeners, listingActionsFor(), listingBadge(), listingFilters(), useShopProfile() (+12 more)

### Community 20 - "eBay Trading XML Service"
Cohesion: 0.15
Nodes (20): addListing(), call(), CONDITION_IDS, CORE_NOTIFICATION_EVENTS, escapeXml(), getActiveItemIds(), getActiveListings(), getActiveSummaries() (+12 more)

### Community 21 - "Auth Context & Live Events"
Cohesion: 0.14
Nodes (19): AuthContext, AuthProvider(), QUICK_ACCOUNTS, BASE, connect(), listeners, useLiveEvents(), useSyncReload() (+11 more)

### Community 22 - "User Access & Auth Routes"
Cohesion: 0.09
Nodes (11): MAIN_ROUTES, mongoose, userShopAccessSchema, bcrypt, express, loginFails, parseMarkets(), router (+3 more)

### Community 23 - "Marketplace Section Loaders"
Cohesion: 0.10
Nodes (9): AFTERSALES_GROUP, EBAY, load(), LOADERS, tables(), TEMU, temuAmount(), temuGoodsRows() (+1 more)

### Community 24 - "Access Control & API Hooks"
Cohesion: 0.18
Nodes (16): MARKETPLACE_SUBSECTIONS, PLATFORM_ROUTES, ROUTE_LABELS, SHOP_ROUTES, SUBSECTION_LABELS, api, SHOP_SECTIONS, shopSectionFromMarketplace() (+8 more)

### Community 25 - "Backend Express API Routers"
Cohesion: 0.11
Nodes (11): router, connectShop(), express, router, app, CLIENT_URLS, cors, express (+3 more)

### Community 26 - "Market Research API Routes"
Cohesion: 0.14
Nodes (13): ACTIVE_LISTING, express, mongoose, RELISTABLE, router, SHOP_LABELS, buildExportRow(), COLUMNS (+5 more)

### Community 27 - "Order Schema & Models"
Cohesion: 0.12
Nodes (13): mongoose, orderItemSchema, orderSchema, returnSchema, shippingAddressSchema, dates(), express, intervalSales() (+5 more)

### Community 28 - "Marketplace Section Profiles"
Cohesion: 0.12
Nodes (8): describe(), ebayListings(), ebayOrders(), ebayRest(), ebayTrading(), probeSections(), ttOrders, ttProducts

### Community 30 - "eBay Webhook Notifications"
Cohesion: 0.19
Nodes (16): crypto, enable(), escapeRegex(), eventNames(), expectedSignature(), findShop(), handle(), JOB_FOR_EVENT (+8 more)

### Community 31 - "Root Workspace Scripts"
Cohesion: 0.14
Nodes (14): description, devDependencies, concurrently@^9.1.2, name, private, scripts, build, dev (+6 more)

### Community 32 - "UI Badges & Marketplace Tabs"
Cohesion: 0.26
Nodes (9): Badge(), COLORS, statusColor(), MarketplaceText(), Tabs(), ConversationList(), SENDER_LABEL, ThreadView() (+1 more)

### Community 33 - "Direct Listing Hook"
Cohesion: 0.29
Nodes (12): clearDirectListing(), emit(), emptySession(), fetches, hasDirectListingWork(), listeners, patch(), peekDirectListing() (+4 more)

### Community 34 - "App Favicon Graphics"
Cohesion: 0.20
Nodes (12): Pilot Supersonic Delta Wing / Navigation Emblem, ecomBg Diagonal Indigo-Violet Gradient, ecomGlow Sky-Indigo Gradient, ecomWing White-Periwinkle Gradient, Forward Vector Navigation Line, Inner Cockpit / Speed Core, Main Aerodynamic Pilot Wings, Pilot App Favicon (64x64 SVG) (+4 more)

### Community 35 - "DB Config & eBay Scripts"
Cohesion: 0.25
Nodes (8): check(), main(), mongoose, path, results, root, ebayFetch(), PROFILES

### Community 36 - "eBay Account Deletion Webhook"
Cohesion: 0.25
Nodes (8): crypto, express, router, crypto, keyCache, publicKey(), purgeUser(), verifySignature()

### Community 37 - "Temu API Signing & Config"
Cohesion: 0.22
Nodes (7): crypto, ORDER_STATUS, sign(), stringify(), Temu Local-Seller OAuth & Token Exchange, Temu Router & MD5 Request Signing, Temu Shop API Skill

### Community 38 - "Docker Frontend Service"
Cohesion: 0.22
Nodes (10): build, context, dockerfile, build, container_name, depends_on, labels, networks (+2 more)

### Community 39 - "Cursor eBay MCP Config"
Cohesion: 0.28
Nodes (6): ebay-api, eBay Shop API Skill, EBAY_API_ENV, EBAY_TOKEN_TYPE, npx, @ebay/npm-public-api-mcp

### Community 41 - "Listing & Product Access"
Cohesion: 0.32
Nodes (5): listingSchema, mongoose, isMine(), productAccess(), requireProductAccess()

### Community 42 - "eBay Listing Action Helpers"
Cohesion: 0.36
Nodes (5): ebayItemId(), cdata(), endListing(), relistListing(), reviseListing()

### Community 43 - "Docker Backend Service"
Cohesion: 0.25
Nodes (8): container_name, env_file, environment, labels, networks, restart, volumes, backend

### Community 44 - "Docker MongoDB Service"
Cohesion: 0.25
Nodes (8): container_name, environment, image, networks, ports, restart, volumes, mongo

### Community 45 - "Frontend SVG Icon Sprite"
Cohesion: 0.29
Nodes (8): Bluesky Icon ClipPath (bluesky-clip), Bluesky Icon Symbol (bluesky-icon), Discord Icon Symbol (discord-icon), Documentation Icon Symbol (documentation-icon), GitHub Icon Symbol (github-icon), Social Icon Symbol (social-icon), SVG Icon Sprite (icons.svg), X Icon Symbol (x-icon)

### Community 46 - "Docker Healthcheck Config"
Cohesion: 0.43
Nodes (7): interval, retries, start_period, test, timeout, healthcheck, healthcheck

### Community 47 - "Docker Redis Service"
Cohesion: 0.29
Nodes (7): command, container_name, image, networks, restart, volumes, redis

### Community 48 - "Shop Section Promotions UI"
Cohesion: 0.57
Nodes (6): formatCell(), formatMoney(), OfferModal(), PromotionModal(), SectionTable(), ShopSectionPage()

### Community 49 - "Docker Volumes Config"
Cohesion: 0.33
Nodes (5): services, volumes, backend-uploads, mongodb-data, redis-data

### Community 50 - "Docker Networks Config"
Cohesion: 0.33
Nodes (6): driver, networks, internal-net, traefik-net, external, name

### Community 51 - "Frontend Oxlint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 52 - "Agents TTS Onboarding YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 53 - "Agents TTS Glossary YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 54 - "Agents TTS FAQ YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 55 - "Agents TTS OpenAPI YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 56 - "Agents TTS Sandbox YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 57 - "Agents Seller Univ YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 58 - "Cursor TTS Onboarding YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 59 - "Cursor TTS Glossary YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 60 - "Cursor TTS FAQ YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 61 - "Cursor TTS OpenAPI YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 62 - "Cursor TTS Sandbox YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 63 - "Cursor Seller Univ YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 64 - "Docker Worker Service"
Cohesion: 0.40
Nodes (5): depends_on, mongo, redis, condition, condition

### Community 65 - "Backend Retry Utility"
Cohesion: 0.67
Nodes (3): DEFAULT_OPTIONS, sleep(), withRetry()

### Community 66 - "Hero Illustration Asset"
Cohesion: 0.67
Nodes (3): Hero Stacked Layers Illustration, Lower Textured Violet Rounded-Square Layer, Upper Wireframe Rounded-Square Layer

### Community 67 - "Vite Logo Asset"
Cohesion: 0.67
Nodes (3): Dark Mode Adaptive Parenthesis Styling, Vite, Vite Logo

## Ambiguous Edges - Review These
- `Sourcing & Unit Economics Skill` → `Product Discovery Agent Pipeline (discoveryAgent.js)`  [AMBIGUOUS]
  discovery_agent_architecture.md · relation: conceptually_related_to

## Knowledge Gaps
- **42 isolated node(s):** `EBAY_API_ENV`, `npx`, `Bundle / combined_skus Product Concept`, `CLI Layered Configuration & Cache Precedence`, `CLI Skill, Host Hook & Local History Management` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 484 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Listing Attributes & Modals` to `UI Badges & Marketplace Tabs`, `Direct Listing Hook`, `Frontend Dashboard Layout`, `Frontend Package Dependencies`, `UI Table & Card Components`, `Frontend App Routing`, `Shop Section Promotions UI`, `Shop Profiles & Gate UI`, `Auth Context & Live Events`, `Access Control & API Hooks`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **What connects `EBAY_API_ENV`, `npx`, `Bundle / combined_skus Product Concept` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Product Discovery Agent` be split into smaller, more focused modules?**
  _Cohesion score 0.057971014492753624 - nodes in this community are weakly interconnected._
- **Should `Shop Events & Seeding` be split into smaller, more focused modules?**
  _Cohesion score 0.05311676909569798 - nodes in this community are weakly interconnected._
- **Should `Agent Marketplace API Skills` be split into smaller, more focused modules?**
  _Cohesion score 0.05182443151771549 - nodes in this community are weakly interconnected._
- **Should `TikTok Shop Service` be split into smaller, more focused modules?**
  _Cohesion score 0.07401129943502825 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Sourcing & Unit Economics Skill` and `Product Discovery Agent Pipeline (discoveryAgent.js)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._