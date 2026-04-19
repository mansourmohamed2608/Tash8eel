# Tash8eel Full System Business Summary

## What Tash8eel Actually Has Today

This summary is codebase-truth only. It is not a live-environment promise.

## 1. Core Product Buckets

### Sell And Converse

- Omnichannel customer conversations across WhatsApp, Messenger, and Instagram
- AI-assisted chat commerce for answering product questions, taking orders, and handling follow-ups
- Voice notes transcription
- Merchant conversation inbox and customer history
- Quote requests and follow-up flows

### Operate Daily

- Order management
- Delivery and driver workflows
- Cashier / POS
- Suspended sales, register sessions, branches, shifts, and table-aware restaurant flows
- Inventory, catalog, suppliers, OCR review, and stock insights

### Get Paid And Reconcile

- Payments surface
- Payment proof review
- COD reconciliation
- Refund/reporting paths

### Manage Customers

- CRM / customers
- Segmentation
- Loyalty
- Campaign surfaces and notifications

### Analyze And Improve

- Dashboard
- Reports
- CFO view
- KPI dashboard
- Analytics
- Cash-flow, tax, accountant, discount-impact, refund-analysis reports
- Forecasting and recommendation surfaces

### Administer The Platform

- Admin dashboard
- Admin analytics
- Merchant administration
- Entitlements/offers
- Audit logs
- DLQ / failed-event operations

## 2. AI In The Product Today

### Customer-Facing AI

- Customer chat commerce AI
- Product/order assistance in WhatsApp-style conversations
- Voice note transcription
- Voice call AI handling

### Merchant-Facing AI

- Merchant assistant
- Copilot command parsing and execution previews
- AI decision audit views
- AI/agent activity views

### Background AI And Intelligence

- Inventory AI
- Finance AI
- Ops AI
- Forecasting jobs
- Vision/OCR
- Embeddings + retrieval
- Memory compression and summarization

### Models And Providers Used In Code Today

- OpenAI `gpt-4o-mini`
  - default model for most assistant/copilot/ops/inventory/finance/customer chat paths
- OpenAI `gpt-4o`
  - used selectively for higher-complexity customer chat routing and vision analysis
- OpenAI `whisper-1`
  - transcription
- OpenAI `text-embedding-3-small`
  - embeddings/retrieval
- ElevenLabs `eleven_multilingual_v2`
  - text-to-speech in voice flows

### Important AI Commercial Watch-Out

- Not every “agent” shown in pricing is actually implemented today.
- Implemented agents today are:
  - Ops Agent
  - Inventory Agent
  - Finance Agent
- Not yet sellable / coming soon:
  - Marketing Agent
  - Support Agent
  - Content Agent
  - Sales Agent
  - Creative Agent

## 3. Background Automations

### Merchant-Value Automations Present In Code

- Supplier low-stock actions
- Review request automation
- New customer welcome automation
- Re-engagement automation
- Churn prevention
- Quote follow-up
- Loyalty milestone actions
- Expense spike alerts
- Delivery SLA breach alerts
- Token usage warning
- AI anomaly detection
- Seasonal stock preparation
- Sentiment monitoring
- Lead scoring
- Auto VIP tagging
- At-risk tagging
- High-return flagging

### Other Operational Automations

- Daily reports
- Weekly/monthly reports
- Delivery status polling
- Follow-up scheduling
- Forecast refresh jobs
- Subscription expiry jobs
- Merchant deletion jobs
- Outbox workers
- DLQ replay support
- Webhook delivery maintenance

## 4. Bundles And Pricing From Static Code

These are the default plan prices and inclusions found in `apps/api/src/shared/entitlements/index.ts`. The repo also contains a richer regional billing catalog for Egypt and Gulf regions, so final sellable pricing can be region-specific.

## Bundle Comparison

| Plan       | Monthly Price | Main Included Agents    | Main Included Capabilities                                                                        | Key Notes                                              |
| ---------- | ------------: | ----------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Trial      |       `0 EGP` | Ops, Inventory, Finance | Conversations, Orders, Catalog, Inventory, Reports, Notifications, Voice Notes, Payments, Copilot | 14-day trial only                                      |
| Starter    |     `999 EGP` | Ops                     | Conversations, Orders, Catalog, Payments, Reports, Notifications, Webhooks, Voice Notes, Copilot  | Entry tier, no inventory agent                         |
| Basic      |   `2,200 EGP` | Ops, Inventory, Finance | Adds Inventory, API Access, more limits                                                           | Sellable standard tier                                 |
| Growth     |   `4,800 EGP` | Ops, Inventory, Finance | Adds Team, Loyalty, Automations, POS connection                                                   | “Active business” tier                                 |
| Pro        |  `10,000 EGP` | Ops, Inventory, Finance | Adds KPI Dashboard, Audit Logs, Forecasting, more branches/POS                                    | High-capacity tier                                     |
| Enterprise |  `21,500 EGP` | Ops, Inventory, Finance | Adds Voice Calling, Custom Integrations, SLA, bigger limits                                       | Enterprise/commercial negotiation likely still applies |
| Custom     |    Negotiated | Configurable            | Fully configurable                                                                                | Not a fixed off-the-shelf plan                         |

## What Is Included Vs Metered

- Included but metered:
  - Copilot Chat
  - AI usage generally through daily AI call limits
  - Message volumes
  - Payment proof scans
  - Voice minutes
  - Maps lookups
- Add-on features priced in static code:
  - Automations
  - Forecasting
  - Team
  - Loyalty
  - KPI Dashboard
  - API Access
  - Audit Logs
  - Webhooks
- Enterprise / custom-priced items:
  - Custom Integrations
  - SLA
  - Voice Calling

## Agent Add-Ons In Static Code

| Agent           | Monthly Price | Commercial Read               |
| --------------- | ------------: | ----------------------------- |
| Ops Agent       |     `299 EGP` | Implemented                   |
| Inventory Agent |     `199 EGP` | Implemented                   |
| Finance Agent   |     `349 EGP` | Implemented                   |
| Marketing Agent |           `0` | Coming soon, not sellable now |
| Support Agent   |           `0` | Coming soon, not sellable now |
| Content Agent   |           `0` | Coming soon, not sellable now |
| Sales Agent     |           `0` | Not implemented               |
| Creative Agent  |           `0` | Not implemented               |

## Extras / Add-Ons / Metered Usage

### Feature Add-Ons In Static Code

- Conversations: `99 EGP`
- Orders: `79 EGP`
- Catalog: `49 EGP`
- Inventory: `149 EGP`
- Payments: `129 EGP`
- Voice Notes: `69 EGP`
- Reports: `99 EGP`
- Webhooks: `49 EGP`
- Team: `79 EGP`
- Loyalty: `149 EGP`
- Notifications: `39 EGP`
- Audit Logs: `49 EGP`
- KPI Dashboard: `79 EGP`
- API Access: `99 EGP`
- Automations: `249 EGP`
- Forecasting: `349 EGP`

### AI Usage Tier Labels In Static Code

- Standard commercial labels exist for AI-capacity upgrades:
  - Basic
  - Standard
  - Professional
  - Unlimited
- Important note:
  - the repo comments explicitly say actual top-up billing is DB-driven via `usage_packs`, not only these static labels

### Message Tier Labels In Static Code

- Starter
- Basic
- Standard
- Professional
- Enterprise

### Regional Catalog

- Code supports regional billing catalogs for:
  - Egypt
  - Saudi Arabia
  - UAE
  - Oman
  - Kuwait
- The richer catalog includes:
  - bundles
  - capacity add-ons
  - usage packs
  - BYO pricing

## 5. What Is Internal-Only Or Not Ready For Marketing

### Internal Only

- Some internal AI ops endpoints
- DLQ and replay tooling
- Admin merchant operations
- Billing admin tooling
- Vision OCR as a standalone purchasable item

### Not Yet Sellable / Coming Soon

- Marketing Agent
- Support Agent
- Content Agent
- Sales Agent
- Creative Agent

### Should Be Marketed Carefully

- Custom integrations: real category, but enterprise/custom rather than a fixed packaged feature
- Voice calling: real technical path exists, but it is commercially modeled as enterprise/custom
- Campaigns: product surface exists, but the exact implementation depth should be positioned carefully
- Agent center / teams: real product surfaces, but they are partly orchestration and oversight, not a dozen separate deep AI model stacks

## 6. Watch-Outs For Internal Sales / Positioning

- Do not describe all cataloged agents as live and sellable. Only Ops, Inventory, and Finance agents are clearly implemented and priced as active.
- Do not market Vision OCR as a standalone line item unless you deliberately package it that way; the code models it as included within payments/proof workflows.
- Do not collapse static entitlements and the DB-driven regional catalog into one claim. The repo clearly has both.
- Do not imply one single model powers every AI path. The code uses a mix of `gpt-4o-mini`, selective `gpt-4o`, `whisper-1`, embeddings, and ElevenLabs TTS.
- Legacy Twilio paths still exist in code, so channel architecture should be described as mixed/legacy-aware rather than “Meta only everywhere.”

## 7. Bottom-Line Business Read

Tash8eel is not a thin chatbot product. The repo shows a broad operations platform with:

- omnichannel communications
- AI-assisted commerce
- POS/cashier operations
- inventory and payments workflows
- CRM/loyalty/segments
- forecasting and reporting
- admin control surfaces
- background automation infrastructure

It is commercially strongest today around:

- conversations and order-taking
- merchant operations
- inventory and payment workflows
- reporting/forecasting
- merchant assistant/copilot

The two biggest commercial cautions are:

- not all “agents” are ready to sell
- pricing is split between static defaults and a richer regional catalog, so quoting should come from the correct billing source for the target market
