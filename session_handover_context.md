# Project Context & Session Handover Summary

This document contains the exact state, architectural decisions, and current progress of the **US Client Automation Dashboard** for seamless continuation in a new chat session.

---

## 1. Project Overview & Tech Stack

- **Project**: Multi-Marketplace E-Commerce Automation Platform & AI Dashboard (eBay, TikTok Shop, Temu).
- **Backend**: Node.js / Express, MongoDB (Mongoose), OpenAI API (`gpt-5-mini` via Responses API with `web_search`), nodemon.
- **Frontend**: React (Vite / TailwindCSS), React Router v6, Lucide/Feather icons.
- **Agent Integrations**:
  1. **Product Discovery Agent** (`/market-research`): Scans US retail/e-commerce marketplaces, validates live demand, sources wholesale units, calculates deterministic unit economics, and generates opportunity cards.
  2. **Customer Support AI Agent** (`/support/chat-sandbox`, `/support/settings`): Planned support agent using approved FAQ/Policies, read-only product and order access, deterministic spam gate, and SLA response tracking.

---

## 2. Recent Architectural Decisions & Work Completed

### A. Product Discovery Pipeline Cleaned & Standardized

1. **Naming & Directory Standardization**:
   - Discarded legacy discovery v1 files (`backend/agent/discoveryAgent.js` [old], `marketAnalyzer.js`, `frontend/src/pages/discovery` [old]).
   - Standardized Discovery 2 paths by dropping the "2" suffix:
     - Frontend: [`frontend/src/pages/discovery/`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/frontend/src/pages/discovery/) ([`ProductDiscoveryPage.jsx`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/frontend/src/pages/discovery/ProductDiscoveryPage.jsx), [`OpportunityCard.jsx`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/frontend/src/pages/discovery/OpportunityCard.jsx), [`DiscoveryOverview.jsx`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/frontend/src/pages/discovery/DiscoveryOverview.jsx), [`DiscoverySidebar.jsx`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/frontend/src/pages/discovery/DiscoverySidebar.jsx)).
     - Backend: [`backend/agent/discovery/`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/agent/discovery/) ([`discoveryAgent.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/agent/discovery/discoveryAgent.js), [`economics.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/agent/discovery/economics.js)).
     - Exported runner: `runDiscoveryAgent` (with `runDiscoveryAgentTwo` kept as backwards-compatible alias).
2. **Discarded Unnecessary / Speculative Fields**:
   - Per client instructions, discarded: `sourcing.estimatedDeliveryDays`, `sourcing.shipFromCountry`, `sourcing.supplierName`, `metrics.landedCost`, `metrics.channelFee`. Sourcing is strictly `unitCostUsd` and verified `buyUrl`.
   - Discarded `validation.highDefectRisk` and `defectComplaints` across prompts, scoring, and UI cards to avoid LLM hallucinations and keep data verifiable.
3. **CSV Export Functional & Formatted**:
   - Clicking **Download CSV** on the discovery page exports columns structured to match [`backend/models/Product.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/Product.js) (`sku`, `title`, `description`, `category`, `brand`, `basePrice`, `currency`, `stock: 0`, `status: draft`, `source: research_bot`) plus `sourceUrl` (supplier buy link), `listingUrl` (live marketplace link), `otherUrl`, `estimatedMarginPercent`, and `opportunityScore`.
   - Formulas sanitized against spreadsheet injection (`='`, `+'`, `-'`, `@'`).
4. **Resilience & State Management**:
   - Sequential deep-dive loop saves each evaluated product to MongoDB incrementally (`$set: { opportunities }`) so server restarts/crashes don't lose data.
   - Startup sweeper in [`backend/server.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/server.js) sweeps orphaned `running`/`queued` runs to `failed` upon reboot.
   - Fixed `Sidebar.jsx` reference error (`TOP_LINKS` vs `LINKS`).

### B. Antigravity & MCP Configuration

- Created workspace-scoped [`.agents/`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/.agents) root.
- Migrated skills (`ebay-shop-api`, `tiktok-shop-api`, `temu-shop-api`, etc.) to [`.agents/skills/`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/.agents/skills/).
- Created project-scoped plugin manifest and MCP config: [`.agents/plugins/marketplace-plugin/mcp_config.json`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/.agents/plugins/marketplace-plugin/mcp_config.json) configuring the official `@ebay/npm-public-api-mcp` server.

### C. Customer Support AI Agent Planning

- Documented complete architecture in [`Customer_Support_AI_Agent.md`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/Customer_Support_AI_Agent.md) and [`customer_support_schema_recommendations.md`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/customer_support_schema_recommendations.md).
- Analyzed chat schemas for TikTok Shop (24h SLA, product/order cards), eBay (post-order dispute topics, strict contact filter), and Temu.
- Outlined schema additions for `Conversation` (handling mode, primary intent, SLA due date) and `Message` (`aiMetadata` trace, rich card payloads, `draft` status).

---

## 3. Immediate Next Steps / Pending Tasks

1. **Customer Support AI Agent Backend Implementation**:
   - Apply schema updates to `Conversation.js` and `Message.js`.
   - Implement `backend/agent/CustomerSupportAgent/` with read-only tools (`searchProducts`, `getOrderDetails`, `searchKnowledgeBase`).
   - Wire the frontend [`frontend/src/pages/support/ChatSandboxPage.jsx`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/frontend/src/pages/support/ChatSandboxPage.jsx) to live sandbox endpoints.
