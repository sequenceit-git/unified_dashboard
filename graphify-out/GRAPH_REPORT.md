# Graph Report - unified_dashboard  (2026-11-22)

## Corpus Check
- Large corpus: 295 files · ~540,546 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1430 nodes · 3556 edges · 61 communities (57 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 192 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Frontend App & Auth
- AI Product Discovery Agent
- Unified Marketplace Manager
- Agent Marketplace API Skills
- TikTok Shop Service
- Frontend Dashboard Layout
- Project Architecture & Specs
- Temu Marketplace & Sections
- AI Settings & Encryption
- TikTok Onboarding & Glossary
- Auth & RBAC Middleware
- Product Catalog & Research
- Backend Package Dependencies
- Shop Events & Seeding
- eBay REST Service
- Audit, Inbox & Inventory Models
- DB Config & eBay Scripts
- Frontend Package Dependencies
- Backend Express API Routers
- eBay Trading XML Service
- User Access & Auth Routes
- Analytics & Customer Stats
- Customer PII & Encryption
- Orders & eBay Account Deletion
- System Dashboard & Cache
- eBay Webhook Notifications
- Marketplace Section Profiles
- Root Workspace Scripts
- Docker Worker Service
- Direct Listing Hook
- Docker Networks & Volumes
- App Favicon Graphics
- Listing & Product Access
- Cursor eBay MCP Config
- Docker Backend Service
- Docker MongoDB Service
- Frontend SVG Icon Sprite
- Docker Healthcheck Config
- Docker Redis Service
- Docker Frontend Service
- Frontend Oxlint Config
- Agents TTS Onboarding YAML
- Agents TTS Glossary YAML
- Agents TTS FAQ YAML
- Agents TTS OpenAPI YAML
- Agents TTS Sandbox YAML
- Agents Seller Univ YAML
- eBay Inbox Messaging Helpers
- Cursor TTS Onboarding YAML
- Cursor TTS Glossary YAML
- Cursor TTS FAQ YAML
- Cursor TTS OpenAPI YAML
- Cursor TTS Sandbox YAML
- Cursor Seller Univ YAML
- Docker Build Contexts
- Backend Retry Utility
- Hero Illustration Asset
- Vite Logo Asset
- Backend Vercel Rewrites
- React Logo Asset
- Frontend Vercel Rewrites

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 83 edges
2. `UnifiedMarketplaceManager` - 45 edges
3. `react` - 45 edges
4. `Button()` - 43 edges
5. `EbayService` - 41 edges
6. `TikTokShopService` - 37 edges
7. `Card()` - 32 edges
8. `mongoose` - 29 edges
9. `Select` - 29 edges
10. `api` - 27 edges

## Surprising Connections (you probably didn't know these)
- `eBay Dashboard Write & OAuth Sync` --references--> `orderSchema`  [EXTRACTED]
  .cursor/skills/ebay-shop-api/SKILL.md → backend/models/Order.js
- `Temu Dashboard Connector & Order State Mapping` --references--> `ORDER_STATUS`  [INFERRED]
  .cursor/skills/temu-shop-api/SKILL.md → backend/services/marketplace/temu.js
- `eBay Dashboard Write & OAuth Sync` --references--> `shopSchema`  [EXTRACTED]
  .cursor/skills/ebay-shop-api/SKILL.md → backend/models/Shop.js
- `TikTok Shop Dashboard Connector Spec` --references--> `shopSchema`  [EXTRACTED]
  .cursor/skills/tiktok-shop-api/SKILL.md → backend/models/Shop.js
- `eBay Dashboard Write & OAuth Sync` --references--> `marketplaceServices`  [EXTRACTED]
  .cursor/skills/ebay-shop-api/SKILL.md → backend/services/marketplace/index.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Unified Dashboard Marketplace Service Contract (eBay / Temu / TikTok Shop)** — agents_skills_ebay_shop_api_skill_ebay_service_contract, agents_skills_ebay_shop_api_skill_ebay_marketplace_service, agents_skills_temu_shop_api_skill_temu_marketplace_service, agents_skills_tiktok_shop_api_skill_tiktok_marketplace_service [EXTRACTED 1.00]
- **TikTok Shop Open Toolkit Skill Suite** — agents_skills_tiktok_shop_api_skill_tiktok_shop_api, agents_skills_tts_developer_onboarding_guide_skill_tts_developer_onboarding_guide, agents_skills_tts_openapi_guide_skill_tts_openapi_guide, agents_skills_tts_openapi_faq_index_skill_tts_openapi_faq_index, agents_skills_tts_openapi_sandbox_materials_skill_tts_openapi_sandbox_materials, agents_skills_tts_open_toolkit_skill_tts_open_toolkit, agents_skills_tts_open_platform_glossary_skill_tts_open_platform_glossary [EXTRACTED 1.00]
- **BSO v3 Sandbox Order Material Preparation Workflow** — agents_skills_tts_open_toolkit_references_cli_usage_bso_v3_sandbox_commands, agents_skills_tts_openapi_sandbox_materials_skill_tts_openapi_sandbox_materials, agents_skills_tts_openapi_sandbox_materials_skill_sandbox_canonical_states, agents_skills_tts_openapi_sandbox_materials_references_order_material_recipes_state_advancement_recipe [EXTRACTED 1.00]
- **Unified US Marketplace Connector Architecture** — cursor_skills_ebay_shop_api_skill_ebay_dashboard_write_sync, cursor_skills_temu_shop_api_skill_temu_dashboard_connector, cursor_skills_tiktok_shop_api_skill_tiktok_dashboard_connector, backend_services_marketplace_index_marketplaceservices [EXTRACTED 1.00]
- **TikTok Shop Open Platform Skill Suite** — cursor_skills_tiktok_shop_api_skill_tiktok_shop_api, cursor_skills_tts_open_toolkit_skill_tts_open_toolkit, cursor_skills_tts_developer_onboarding_guide_skill_tts_developer_onboarding_guide, cursor_skills_tts_openapi_guide_skill_tts_openapi_guide, cursor_skills_tts_openapi_faq_index_skill_tts_openapi_faq_index, cursor_skills_tts_openapi_sandbox_materials_skill_tts_openapi_sandbox_materials, cursor_skills_tts_open_platform_glossary_skill_tts_open_platform_glossary, cursor_skills_tts_seller_university_basic_knowledge_index_skill_tts_seller_university_basic_knowledge_index [INFERRED 0.95]
- **BSO v3 Sandbox Order Material Pipeline** — cursor_skills_tts_open_toolkit_references_cli_usage_typed_bso_v3_sandbox_workflow, cursor_skills_tts_openapi_sandbox_materials_skill_sandbox_order_construction_protocol, cursor_skills_tts_openapi_sandbox_materials_skill_canonical_sandbox_order_states, cursor_skills_tts_openapi_sandbox_materials_references_order_material_recipes_incremental_order_transition_recipe [EXTRACTED 1.00]
- **Product Discovery 2 4-Skill Agentic Loop** — backend_agent_discovery_skills_readme_product_discovery_2_skills, backend_agent_discovery_skills_product_discovery_search_skill_product_discovery_search, backend_agent_discovery_skills_cross_market_validation_skill_cross_market_validation, backend_agent_discovery_skills_sourcing_and_unit_economics_skill_sourcing_and_unit_economics, backend_agent_discovery_skills_opportunity_scoring_rubric_skill_opportunity_scoring_rubric [EXTRACTED 1.00]
- **US Product Discovery Verification & Ranking Pipeline** — discovery_agent_architecture_product_discovery_agent, discovery_agent_architecture_us_marketplace_scope, discovery_agent_architecture_evidence_memory, discovery_agent_architecture_us_listing_verification, discovery_agent_architecture_economics_scoring, discovery_agent_architecture_incremental_persistence [EXTRACTED 1.00]
- **Unified Dashboard Scope, ERP Design System & Section Pages Alignment** — all_feature_project_development_agreement, design_modern_enterprise_direction, design_application_shell_navigation, design_tables_forms_components, frontend_src_pages_readme_section_pages_architecture, frontend_src_pages_readme_shared_frontend_layer [INFERRED 0.85]
- **Pilot Supersonic Delta Wing Emblem Layers** — frontend_public_favicon_main_pilot_wings, frontend_public_favicon_inner_speed_core, frontend_public_favicon_forward_navigation_line, frontend_public_favicon_pilot_beacon [EXTRACTED 1.00]
- **Ecom Indigo-Violet-Sky Gradient Palette** — frontend_public_favicon_ecombg, frontend_public_favicon_ecomwing, frontend_public_favicon_ecomglow [INFERRED 0.85]
- **Solid Social and Developer Brand Icons (#08060d)** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_github_icon, frontend_public_icons_x_icon [INFERRED 0.95]
- **icons.svg Exported Symbol Set** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_documentation_icon, frontend_public_icons_github_icon, frontend_public_icons_social_icon, frontend_public_icons_x_icon [EXTRACTED 1.00]

## Communities (61 total, 4 thin omitted)

### Community 0 - "Frontend App & Auth"
Cohesion: 0.05
Nodes (144): AdminOnly(), App(), PublicOnly(), RouteAccess(), AuthContext, AuthProvider(), QUICK_ACCOUNTS, useAuth() (+136 more)

### Community 1 - "AI Product Discovery Agent"
Cohesion: 0.06
Nodes (52): callWebSearch(), delay(), discoverCandidates(), generateAiNotes(), getOpenAIClient(), linkOf(), marketplaceLabel(), normalizeCategories() (+44 more)

### Community 2 - "Unified Marketplace Manager"
Cohesion: 0.07
Nodes (20): ignoreTokens(), listingAliases(), productKey(), UnifiedMarketplaceManager, FAILED_RAW, fromSync(), listingAlertReason(), listingAlertTitle() (+12 more)

### Community 3 - "Agent Marketplace API Skills"
Cohesion: 0.05
Nodes (51): eBay Marketplace Service (backend/services/marketplace/ebay.js), eBay OAuth2 Authorization & Token Flow, Official eBay MCP Server (@ebay/npm-public-api-mcp), eBay Marketplace Service Method Contract, eBay Shop API Skill, Shop.auth Token Storage & Order Enum Mapping, Temu Marketplace Service (backend/services/marketplace/temu.js), Temu US Local-Seller OAuth Flow (+43 more)

### Community 4 - "TikTok Shop Service"
Cohesion: 0.07
Nodes (23): amountOf(), attributeMap(), auditReason(), categoryPath(), certificationBytes(), certificationRequired(), chatMessage(), crypto (+15 more)

### Community 5 - "Frontend Dashboard Layout"
Cohesion: 0.07
Nodes (48): DashboardLayout(), NotificationBell(), timeAgo(), TONE, DEFAULT_SECTIONS, itemClass(), ItemLabel(), NavItem() (+40 more)

### Community 6 - "Project Architecture & Specs"
Cohesion: 0.06
Nodes (45): AI Market Research Bot Module, Automation & AI Scope, Commercial & Legal Terms (BDT 30,000 / 20 Days), Dashboard & Analytics Scope, Inventory Management Scope, Kazi Rana / MasudRana LLC (Client), Marketplace Integration Scope (eBay, Temu, TikTok Shop), Order Management Scope (+37 more)

### Community 7 - "Temu Marketplace & Sections"
Cohesion: 0.06
Nodes (21): shopSchema, marketplaceServices, AFTERSALES_GROUP, EBAY, hasLoader(), load(), LOADERS, tables() (+13 more)

### Community 8 - "AI Settings & Encryption"
Cohesion: 0.08
Nodes (45): appSettingSchema, mongoose, cache, checkModelName(), crypto, decrypt(), encrypt(), getAiConfig() (+37 more)

### Community 9 - "TikTok Onboarding & Glossary"
Cohesion: 0.06
Nodes (38): TikTok Shop API Skill, ISV App Onboarding Path, Seller Developer Custom App Path, TikTok Shop Developer Onboarding Guide, TTS Developer Onboarding Guide Skill, 3PL and 4PL Logistics Models, Developer Shop, CB, Local Shop, and Bundle Terms, TTS Open Platform Glossary (+30 more)

### Community 10 - "Auth & RBAC Middleware"
Cohesion: 0.13
Nodes (29): accessCache, canAccessShop(), canUseSection(), jwt, limitToSection(), loadAccess(), requireAuth(), requireMainRoute() (+21 more)

### Community 11 - "Product Catalog & Research"
Cohesion: 0.08
Nodes (30): MARKETPLACE_CONFIG, ignoredListingSchema, mongoose, mongoose, productSchema, variantSchema, ACTIVE_LISTING, express (+22 more)

### Community 12 - "Backend Package Dependencies"
Cohesion: 0.06
Nodes (41): author, dependencies, bcryptjs@^3.0.3, bullmq@^6.3.12, cors@^2.8.6, dotenv@^18.0.6, exceljs@^4.4.0, express@^5.2.1 (+33 more)

### Community 13 - "Shop Events & Seeding"
Cohesion: 0.09
Nodes (32): connectShop(), main(), { EventEmitter }, local, publish(), subscribe(), describe(), createConnection() (+24 more)

### Community 14 - "eBay REST Service"
Cohesion: 0.09
Nodes (3): ebayItemId(), EbayService, eBay Dashboard Write & OAuth Sync

### Community 15 - "Audit, Inbox & Inventory Models"
Cohesion: 0.07
Nodes (25): auditLogSchema, mongoose, conversationSchema, mongoose, inventoryLogSchema, mongoose, messageSchema, mongoose (+17 more)

### Community 16 - "DB Config & eBay Scripts"
Cohesion: 0.09
Nodes (22): connectDB(), mongoose, apply, main(), mongoose, path, root, main() (+14 more)

### Community 17 - "Frontend Package Dependencies"
Cohesion: 0.08
Nodes (32): dependencies, react@^19.2.8, react-dom@^19.2.8, react-icons@^5.7.0, react-router-dom@^7.18.4, recharts@^3.10.1, tailwindcss@^4.3.3, @tailwindcss/vite@^4.3.3 (+24 more)

### Community 18 - "Backend Express API Routers"
Cohesion: 0.08
Nodes (22): router, router, router, router, router, express, router, express (+14 more)

### Community 19 - "eBay Trading XML Service"
Cohesion: 0.17
Nodes (26): addListing(), call(), cdata(), CONDITION_IDS, endListing(), escapeXml(), getActiveItemIds(), getActiveListings() (+18 more)

### Community 20 - "User Access & Auth Routes"
Cohesion: 0.09
Nodes (11): MAIN_ROUTES, clearUserAccessCache(), signToken(), mongoose, userShopAccessSchema, bcrypt, express, loginFails (+3 more)

### Community 21 - "Analytics & Customer Stats"
Cohesion: 0.17
Nodes (17): dates(), express, intervalSales(), marketplaceFilter(), match(), money(), mongoose, router (+9 more)

### Community 22 - "Customer PII & Encryption"
Cohesion: 0.20
Nodes (15): addressSchema, customerSchema, identitySchema, mongoose, encryptAddress(), encryptPlain(), migrate(), mongoose (+7 more)

### Community 23 - "Orders & eBay Account Deletion"
Cohesion: 0.15
Nodes (13): mongoose, orderItemSchema, orderSchema, returnSchema, shippingAddressSchema, crypto, express, router (+5 more)

### Community 24 - "System Dashboard & Cache"
Cohesion: 0.19
Nodes (14): express, resources, router, cachedResponse(), claim(), crypto, get(), inflight (+6 more)

### Community 25 - "eBay Webhook Notifications"
Cohesion: 0.21
Nodes (15): crypto, enable(), escapeRegex(), eventNames(), expectedSignature(), findShop(), handle(), JOB_FOR_EVENT (+7 more)

### Community 26 - "Marketplace Section Profiles"
Cohesion: 0.14
Nodes (8): ebayListings(), ebayOrders(), ebayRest(), ebayTrading(), probeSections(), PROFILES, ttOrders, ttProducts

### Community 27 - "Root Workspace Scripts"
Cohesion: 0.14
Nodes (14): description, devDependencies, concurrently@^9.1.2, name, private, scripts, build, dev (+6 more)

### Community 28 - "Docker Worker Service"
Cohesion: 0.17
Nodes (13): depends_on, mongo, redis, condition, condition, worker, command, container_name (+5 more)

### Community 29 - "Direct Listing Hook"
Cohesion: 0.29
Nodes (12): clearDirectListing(), emit(), emptySession(), fetches, hasDirectListingWork(), listeners, patch(), peekDirectListing() (+4 more)

### Community 30 - "Docker Networks & Volumes"
Cohesion: 0.17
Nodes (11): driver, networks, internal-net, traefik-net, services, external, name, volumes (+3 more)

### Community 31 - "App Favicon Graphics"
Cohesion: 0.20
Nodes (12): Pilot Supersonic Delta Wing / Navigation Emblem, ecomBg Diagonal Indigo-Violet Gradient, ecomGlow Sky-Indigo Gradient, ecomWing White-Periwinkle Gradient, Forward Vector Navigation Line, Inner Cockpit / Speed Core, Main Aerodynamic Pilot Wings, Pilot App Favicon (64x64 SVG) (+4 more)

### Community 32 - "Listing & Product Access"
Cohesion: 0.28
Nodes (7): listingSchema, mongoose, scopedIds(), isMine(), ownDrafts(), productAccess(), requireProductAccess()

### Community 33 - "Cursor eBay MCP Config"
Cohesion: 0.28
Nodes (6): ebay-api, eBay Shop API Skill, EBAY_API_ENV, EBAY_TOKEN_TYPE, npx, @ebay/npm-public-api-mcp

### Community 34 - "Docker Backend Service"
Cohesion: 0.25
Nodes (8): container_name, env_file, environment, labels, networks, restart, volumes, backend

### Community 35 - "Docker MongoDB Service"
Cohesion: 0.25
Nodes (8): container_name, environment, image, networks, ports, restart, volumes, mongo

### Community 36 - "Frontend SVG Icon Sprite"
Cohesion: 0.29
Nodes (8): Bluesky Icon ClipPath (bluesky-clip), Bluesky Icon Symbol (bluesky-icon), Discord Icon Symbol (discord-icon), Documentation Icon Symbol (documentation-icon), GitHub Icon Symbol (github-icon), Social Icon Symbol (social-icon), SVG Icon Sprite (icons.svg), X Icon Symbol (x-icon)

### Community 37 - "Docker Healthcheck Config"
Cohesion: 0.43
Nodes (7): interval, retries, start_period, test, timeout, healthcheck, healthcheck

### Community 38 - "Docker Redis Service"
Cohesion: 0.29
Nodes (7): command, container_name, image, networks, restart, volumes, redis

### Community 39 - "Docker Frontend Service"
Cohesion: 0.33
Nodes (6): container_name, depends_on, labels, networks, restart, frontend

### Community 40 - "Frontend Oxlint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 41 - "Agents TTS Onboarding YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 42 - "Agents TTS Glossary YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 43 - "Agents TTS FAQ YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 44 - "Agents TTS OpenAPI YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 45 - "Agents TTS Sandbox YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 46 - "Agents Seller Univ YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 48 - "Cursor TTS Onboarding YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 49 - "Cursor TTS Glossary YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 50 - "Cursor TTS FAQ YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 51 - "Cursor TTS OpenAPI YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 52 - "Cursor TTS Sandbox YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 53 - "Cursor Seller Univ YAML"
Cohesion: 0.40
Nodes (4): interface, default_prompt, display_name, short_description

### Community 54 - "Docker Build Contexts"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, build, build

### Community 55 - "Backend Retry Utility"
Cohesion: 0.67
Nodes (3): DEFAULT_OPTIONS, sleep(), withRetry()

### Community 56 - "Hero Illustration Asset"
Cohesion: 0.67
Nodes (3): Hero Stacked Layers Illustration, Lower Textured Violet Rounded-Square Layer, Upper Wireframe Rounded-Square Layer

### Community 57 - "Vite Logo Asset"
Cohesion: 0.67
Nodes (3): Dark Mode Adaptive Parenthesis Styling, Vite, Vite Logo

## Ambiguous Edges - Review These
- `Sourcing & Unit Economics Skill` → `Product Discovery Agent Pipeline (discoveryAgent.js)`  [AMBIGUOUS]
  discovery_agent_architecture.md · relation: conceptually_related_to

## Knowledge Gaps
- **42 isolated node(s):** `npx`, `EBAY_API_ENV`, `TikTok Shop Partner Center Docs (partner.tiktokshop.com/doc/home)`, `Bundle / combined_skus Product Concept`, `CLI Update Channel Policy (beta / rc / stable)` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 453 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Frontend App & Auth` to `Frontend Package Dependencies`, `Direct Listing Hook`, `Frontend Dashboard Layout`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **What connects `npx`, `EBAY_API_ENV`, `TikTok Shop Partner Center Docs (partner.tiktokshop.com/doc/home)` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend App & Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.051290551740468864 - nodes in this community are weakly interconnected._
- **Why does `TikTok Shop Dashboard Connector Spec` connect `TikTok Shop Service` to `Unified Marketplace Manager`, `Temu Marketplace & Sections`, `TikTok Onboarding & Glossary`, `eBay REST Service`, `DB Config & eBay Scripts`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Should `AI Product Discovery Agent` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Why does `@vitejs/plugin-react` connect `Frontend Package Dependencies` to `DB Config & eBay Scripts`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Sourcing & Unit Economics Skill` and `Product Discovery Agent Pipeline (discoveryAgent.js)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._