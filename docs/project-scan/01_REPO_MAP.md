# Phase 0 - Repository Map

## Repo Tree (excluding node_modules, build outputs, .git, caches)

```
Tash8eel
├── .env
├── .env.example
├── .github
│   └── workflows
│       └── ci.yml
├── .gitignore
├── Ai_Agents_ARCHIVED_2026-01-20.zip
├── README.md
├── apps
│   ├── api
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── docs
│   │   │   └── WHATSAPP_INTEGRATION.md
│   │   ├── migrations
│   │   │   ├── 001_init.sql
│   │   │   ├── 002_production_features.sql
│   │   │   ├── 003_delivery_lifecycle_reports.sql
│   │   │   ├── 004_inventory_agent.sql
│   │   │   ├── 005_twilio_whatsapp.sql
│   │   │   ├── 006_merchant_agent_subscriptions.sql
│   │   │   ├── 007_orchestrator_schema_fix.sql
│   │   │   ├── 008_production_features.sql
│   │   │   ├── 009_loyalty_and_promotions.sql
│   │   │   ├── 010_notifications_system.sql
│   │   │   ├── 011_payment_links_and_proofs.sql
│   │   │   ├── 012_merchant_entitlements.sql
│   │   │   ├── 013_product_ocr.sql
│   │   │   └── seed_inventory.sql
│   │   ├── nest-cli.json
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── pass.txt
│   │   ├── postman
│   │   │   └── Twilio_WhatsApp_Webhooks.postman_collection.json
│   │   ├── scripts
│   │   │   └── set-demo-password.js
│   │   ├── src
│   │   │   ├── api
│   │   │   │   ├── api.module.ts
│   │   │   │   ├── controllers
│   │   │   │   │   ├── admin.controller.ts
│   │   │   │   │   ├── analytics.controller.ts
│   │   │   │   │   ├── catalog.controller.ts
│   │   │   │   │   ├── conversations.controller.ts
│   │   │   │   │   ├── early-access.controller.ts
│   │   │   │   │   ├── followups.controller.ts
│   │   │   │   │   ├── health.controller.ts
│   │   │   │   │   ├── inbox.controller.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── internal-ai.controller.ts
│   │   │   │   │   ├── inventory.controller.ts
│   │   │   │   │   ├── kpi.controller.ts
│   │   │   │   │   ├── loyalty.controller.ts
│   │   │   │   │   ├── merchant-portal.controller.ts
│   │   │   │   │   ├── merchants.controller.ts
│   │   │   │   │   ├── notifications.controller.ts
│   │   │   │   │   ├── orders.controller.ts
│   │   │   │   │   ├── payments.controller.ts
│   │   │   │   │   ├── production-features.controller.ts
│   │   │   │   │   ├── twilio-webhook.controller.ts
│   │   │   │   │   ├── vision.controller.ts
│   │   │   │   │   └── webhooks.controller.ts
│   │   │   │   └── dto
│   │   │   │       ├── catalog.dto.ts
│   │   │   │       ├── inbox.dto.ts
│   │   │   │       ├── index.ts
│   │   │   │       ├── merchant.dto.ts
│   │   │   │       └── vision.dto.ts
│   │   │   ├── app.module.ts
│   │   │   ├── application
│   │   │   │   ├── adapters
│   │   │   │   │   ├── adapters.module.ts
│   │   │   │   │   ├── delivery-adapter.interface.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── mock-delivery.adapter.ts
│   │   │   │   │   ├── transcription.adapter.ts
│   │   │   │   │   └── twilio-whatsapp.adapter.ts
│   │   │   │   ├── dlq
│   │   │   │   │   ├── dlq.module.ts
│   │   │   │   │   ├── dlq.service.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── events
│   │   │   │   │   ├── event-handler.registry.ts
│   │   │   │   │   ├── event-types.ts
│   │   │   │   │   ├── events.module.ts
│   │   │   │   │   ├── handlers
│   │   │   │   │   │   ├── delivery-status.handler.ts
│   │   │   │   │   │   ├── followup.handler.ts
│   │   │   │   │   │   ├── index.ts
│   │   │   │   │   │   ├── merchant-alert.handler.ts
│   │   │   │   │   │   ├── order-created.handler.ts
│   │   │   │   │   │   └── shipment-booked.handler.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── outbox.service.ts
│   │   │   │   │   └── outbox.worker.ts
│   │   │   │   ├── jobs
│   │   │   │   │   ├── daily-report.scheduler.ts
│   │   │   │   │   ├── delivery-status.poller.ts
│   │   │   │   │   ├── followup.scheduler.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── jobs.module.ts
│   │   │   │   │   ├── message-delivery.worker.ts
│   │   │   │   │   └── weekly-report.scheduler.ts
│   │   │   │   ├── llm
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── inventory-ai.service.ts
│   │   │   │   │   ├── llm-schema.ts
│   │   │   │   │   ├── llm.module.ts
│   │   │   │   │   ├── llm.service.ts
│   │   │   │   │   └── vision.service.ts
│   │   │   │   ├── policies
│   │   │   │   │   ├── address-validation.policy.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── negotiation.policy.ts
│   │   │   │   │   ├── policies.module.ts
│   │   │   │   │   └── slot-filling.policy.ts
│   │   │   │   └── services
│   │   │   │       ├── address-depth.service.ts
│   │   │   │       ├── agent-subscription.service.ts
│   │   │   │       ├── analytics.service.ts
│   │   │   │       ├── audit.service.ts
│   │   │   │       ├── bulk-operations.service.ts
│   │   │   │       ├── candidate-retrieval.service.ts
│   │   │   │       ├── continuity-mode.service.ts
│   │   │   │       ├── inbox.service.ts
│   │   │   │       ├── index.ts
│   │   │   │       ├── inventory.service.ts
│   │   │   │       ├── kpi.service.ts
│   │   │   │       ├── loyalty.service.ts
│   │   │   │       ├── memory-compression.service.ts
│   │   │   │       ├── message-delivery.service.ts
│   │   │   │       ├── notifications.service.ts
│   │   │   │       ├── payment.service.ts
│   │   │   │       ├── product-ocr.service.ts
│   │   │   │       ├── services.module.ts
│   │   │   │       ├── staff.service.ts
│   │   │   │       └── webhook.service.ts
│   │   │   ├── categories
│   │   │   │   ├── categories.module.ts
│   │   │   │   ├── category-strategy.factory.ts
│   │   │   │   ├── clothes
│   │   │   │   │   └── clothes.strategy.ts
│   │   │   │   ├── food
│   │   │   │   │   └── food.strategy.ts
│   │   │   │   ├── generic
│   │   │   │   │   └── generic.strategy.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── supermarket
│   │   │   │       └── supermarket.strategy.ts
│   │   │   ├── cli
│   │   │   │   ├── dlq-replay.ts
│   │   │   │   ├── run-migrations.ts
│   │   │   │   └── seed.ts
│   │   │   ├── domain
│   │   │   │   ├── entities
│   │   │   │   │   ├── catalog.entity.ts
│   │   │   │   │   ├── conversation.entity.ts
│   │   │   │   │   ├── customer.entity.ts
│   │   │   │   │   ├── event.entity.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── known-area.entity.ts
│   │   │   │   │   ├── merchant.entity.ts
│   │   │   │   │   ├── message.entity.ts
│   │   │   │   │   ├── order.entity.ts
│   │   │   │   │   └── shipment.entity.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── policies
│   │   │   │   │   ├── address-validation-policy.interface.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── negotiation-policy.interface.ts
│   │   │   │   │   └── slot-filling-policy.interface.ts
│   │   │   │   └── ports
│   │   │   │       ├── catalog.repository.ts
│   │   │   │       ├── conversation.repository.ts
│   │   │   │       ├── customer.repository.ts
│   │   │   │       ├── event.repository.ts
│   │   │   │       ├── index.ts
│   │   │   │       ├── known-area.repository.ts
│   │   │   │       ├── merchant.repository.ts
│   │   │   │       ├── message.repository.ts
│   │   │   │       ├── order.repository.ts
│   │   │   │       └── shipment.repository.ts
│   │   │   ├── infrastructure
│   │   │   │   ├── database
│   │   │   │   │   ├── data-source.ts
│   │   │   │   │   ├── database.module.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── redis
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── redis.module.ts
│   │   │   │   │   └── redis.service.ts
│   │   │   │   ├── repositories
│   │   │   │   │   ├── catalog.repository.impl.ts
│   │   │   │   │   ├── conversation.repository.impl.ts
│   │   │   │   │   ├── customer.repository.impl.ts
│   │   │   │   │   ├── event.repository.impl.ts
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── known-area.repository.impl.ts
│   │   │   │   │   ├── merchant.repository.impl.ts
│   │   │   │   │   ├── message.repository.impl.ts
│   │   │   │   │   ├── order.repository.impl.ts
│   │   │   │   │   ├── repositories.module.ts
│   │   │   │   │   └── shipment.repository.impl.ts
│   │   │   │   └── websocket
│   │   │   │       ├── events.gateway.ts
│   │   │   │       ├── index.ts
│   │   │   │       ├── websocket.module.ts
│   │   │   │       ├── websocket.service.ts
│   │   │   │       └── ws-jwt.guard.ts
│   │   │   ├── main.ts
│   │   │   └── shared
│   │   │       ├── constants
│   │   │       │   ├── enums.ts
│   │   │       │   ├── index.ts
│   │   │       │   └── templates.ts
│   │   │       ├── decorators
│   │   │       │   └── merchant-id.decorator.ts
│   │   │       ├── entitlements
│   │   │       │   └── index.ts
│   │   │       ├── filters
│   │   │       │   ├── all-exceptions.filter.ts
│   │   │       │   └── index.ts
│   │   │       ├── guards
│   │   │       │   ├── admin-api-key.guard.ts
│   │   │       │   ├── entitlement.guard.ts
│   │   │       │   ├── index.ts
│   │   │       │   ├── internal-api.guard.ts
│   │   │       │   ├── merchant-api-key.guard.ts
│   │   │       │   ├── merchant-auth.guard.ts
│   │   │       │   └── rate-limit.guard.ts
│   │   │       ├── index.ts
│   │   │       ├── logging
│   │   │       │   ├── index.ts
│   │   │       │   └── logger.ts
│   │   │       ├── middleware
│   │   │       │   ├── correlation-id.middleware.ts
│   │   │       │   └── index.ts
│   │   │       ├── pipes
│   │   │       │   ├── index.ts
│   │   │       │   └── zod-validation.pipe.ts
│   │   │       ├── schemas
│   │   │       │   └── index.ts
│   │   │       ├── shared.module.ts
│   │   │       └── utils
│   │   │           ├── helpers.ts
│   │   │           └── index.ts
│   │   ├── test
│   │   │   ├── e2e
│   │   │   │   ├── catalog.e2e-spec.ts
│   │   │   │   ├── conversations.e2e-spec.ts
│   │   │   │   ├── inbox.e2e-spec.ts
│   │   │   │   └── order-flows.spec.ts
│   │   │   ├── jest-e2e.json
│   │   │   ├── jest.setup.ts
│   │   │   └── unit
│   │   │       ├── address-depth.service.spec.ts
│   │   │       ├── address-validation.policy.spec.ts
│   │   │       ├── category-strategies.spec.ts
│   │   │       ├── entitlements.spec.ts
│   │   │       ├── inbox-locking.spec.ts
│   │   │       ├── negotiation.policy.spec.ts
│   │   │       ├── slot-filling.policy.spec.ts
│   │   │       ├── transcription.adapter.spec.ts
│   │   │       └── twilio-whatsapp.adapter.spec.ts
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   ├── portal
│   │   ├── .env.local
│   │   ├── Dockerfile
│   │   ├── README.md
│   │   ├── next-env.d.ts
│   │   ├── next.config.js
│   │   ├── package.json
│   │   ├── postcss.config.js
│   │   ├── public
│   │   ├── src
│   │   │   ├── app
│   │   │   │   ├── admin
│   │   │   │   │   ├── analytics
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── audit-logs
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── dashboard
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── dlq
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── entitlements
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── merchants
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── api
│   │   │   │   │   ├── auth
│   │   │   │   │   │   └── [...nextauth]
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   └── health
│   │   │   │   │       └── route.ts
│   │   │   │   ├── globals.css
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── login
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── merchant
│   │   │   │   │   ├── analytics
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── audit
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── conversations
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── customers
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── dashboard
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── import-export
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── inventory
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── knowledge-base
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── kpis
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── loyalty
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── notifications
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── orders
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── payments
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── proofs
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── plan
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── reports
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── roadmap
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── settings
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── team
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── vision
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── webhooks
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   └── signup
│   │   │   │       └── page.tsx
│   │   │   ├── components
│   │   │   │   ├── analytics
│   │   │   │   │   ├── enhanced-metrics.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── charts
│   │   │   │   │   ├── area-chart.tsx
│   │   │   │   │   ├── bar-chart.tsx
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── line-chart.tsx
│   │   │   │   │   └── pie-chart.tsx
│   │   │   │   ├── customers
│   │   │   │   │   ├── enhanced-features.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── dashboard
│   │   │   │   │   └── realtime-dashboard.tsx
│   │   │   │   ├── inventory
│   │   │   │   │   ├── ai-insights-panel.tsx
│   │   │   │   │   ├── enhanced-features.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── layout
│   │   │   │   │   ├── api-status-indicator.tsx
│   │   │   │   │   ├── api-status.tsx
│   │   │   │   │   ├── header.tsx
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── notification-bell.tsx
│   │   │   │   │   ├── notifications-popover.tsx
│   │   │   │   │   └── sidebar.tsx
│   │   │   │   ├── notifications
│   │   │   │   │   └── websocket-notifications.tsx
│   │   │   │   ├── orders
│   │   │   │   │   ├── enhanced-features.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   └── ui
│   │   │   │       ├── alerts.tsx
│   │   │   │       ├── avatar.tsx
│   │   │   │       ├── badge.tsx
│   │   │   │       ├── button.tsx
│   │   │   │       ├── card.tsx
│   │   │   │       ├── checkbox.tsx
│   │   │   │       ├── collapsible.tsx
│   │   │   │       ├── data-table.tsx
│   │   │   │       ├── dialog.tsx
│   │   │   │       ├── dropdown-menu.tsx
│   │   │   │       ├── index.ts
│   │   │   │       ├── input.tsx
│   │   │   │       ├── label.tsx
│   │   │   │       ├── popover.tsx
│   │   │   │       ├── progress.tsx
│   │   │   │       ├── scroll-area.tsx
│   │   │   │       ├── select.tsx
│   │   │   │       ├── skeleton.tsx
│   │   │   │       ├── stat-card.tsx
│   │   │   │       ├── switch.tsx
│   │   │   │       ├── table.tsx
│   │   │   │       ├── tabs.tsx
│   │   │   │       ├── textarea.tsx
│   │   │   │       ├── toaster.tsx
│   │   │   │       └── tooltip.tsx
│   │   │   ├── hooks
│   │   │   │   ├── index.ts
│   │   │   │   ├── use-auth.ts
│   │   │   │   ├── use-merchant.tsx
│   │   │   │   ├── use-toast.ts
│   │   │   │   └── use-websocket.ts
│   │   │   ├── lib
│   │   │   │   ├── api.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── authenticated-api.ts
│   │   │   │   └── utils.ts
│   │   │   ├── middleware.ts
│   │   │   └── providers
│   │   │       ├── auth-provider.tsx
│   │   │       └── index.ts
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   └── tsconfig.tsbuildinfo
│   └── worker
│       ├── .env
│       ├── Dockerfile
│       ├── README.md
│       ├── docs
│       │   └── AGENTS.md
│       ├── migrations
│       ├── nest-cli.json
│       ├── package.json
│       ├── src
│       │   ├── agents
│       │   │   ├── agents.module.ts
│       │   │   ├── content
│       │   │   │   ├── content.agent.ts
│       │   │   │   ├── content.handlers.ts
│       │   │   │   ├── content.tasks.ts
│       │   │   │   ├── index.ts
│       │   │   │   └── tests
│       │   │   │       └── content.agent.spec.ts
│       │   │   ├── finance
│       │   │   │   ├── finance.agent.ts
│       │   │   │   ├── finance.handlers.ts
│       │   │   │   ├── finance.tasks.ts
│       │   │   │   ├── index.ts
│       │   │   │   └── tests
│       │   │   │       └── finance.agent.spec.ts
│       │   │   ├── index.ts
│       │   │   ├── inventory
│       │   │   │   ├── index.ts
│       │   │   │   ├── inventory.agent.ts
│       │   │   │   ├── inventory.handlers.ts
│       │   │   │   ├── inventory.policies.ts
│       │   │   │   ├── inventory.tasks.ts
│       │   │   │   └── tests
│       │   │   │       ├── inventory.agent.spec.ts
│       │   │   │       └── inventory.policies.spec.ts
│       │   │   ├── marketing
│       │   │   │   ├── index.ts
│       │   │   │   ├── marketing.agent.ts
│       │   │   │   ├── marketing.handlers.ts
│       │   │   │   ├── marketing.tasks.ts
│       │   │   │   └── tests
│       │   │   │       └── marketing.agent.spec.ts
│       │   │   ├── ops
│       │   │   │   ├── index.ts
│       │   │   │   ├── ops.agent.ts
│       │   │   │   ├── ops.handlers.ts
│       │   │   │   ├── ops.tasks.ts
│       │   │   │   └── tests
│       │   │   │       └── ops.agent.spec.ts
│       │   │   └── support
│       │   │       ├── index.ts
│       │   │       ├── support.agent.ts
│       │   │       ├── support.handlers.ts
│       │   │       ├── support.tasks.ts
│       │   │       └── tests
│       │   │           └── support.agent.spec.ts
│       │   ├── infrastructure
│       │   │   ├── database.module.ts
│       │   │   ├── llm-client.module.ts
│       │   │   └── redis.module.ts
│       │   ├── jobs
│       │   │   ├── daily-report-scheduler.service.ts
│       │   │   ├── followup-scheduler.service.ts
│       │   │   └── jobs.module.ts
│       │   ├── main.ts
│       │   ├── orchestrator
│       │   │   ├── orchestrator.module.ts
│       │   │   └── orchestrator.service.ts
│       │   ├── outbox
│       │   │   ├── outbox-poller.service.ts
│       │   │   └── outbox.module.ts
│       │   └── worker.module.ts
│       ├── test
│       │   └── jest.setup.ts
│       └── tsconfig.json
├── docker-compose.test.yml
├── docker-compose.yml
├── docs
│   ├── ARCHITECTURE.md
│   ├── AUDIT_REPORT.md
│   ├── BUSINESS_SCORECARD.md
│   ├── CODE_REVIEW.md
│   ├── COMPLETE_DOCUMENTATION.md
│   ├── GAP_ANALYSIS.md
│   ├── LLM.md
│   ├── OBSERVABILITY.md
│   ├── RELEASE_CHECKLIST.md
│   ├── SECURITY.md
│   ├── TEST_PLAN.md
│   └── project-scan
│       ├── 00_EXEC_SUMMARY.md
│       ├── 01_REPO_MAP.md
│       ├── 02_ARCHITECTURE.md
│       ├── 03_BACKEND.md
│       ├── 03_BACKEND_FINDINGS.md
│       ├── 04_FRONTEND.md
│       ├── 04_FRONTEND_FINDINGS.md
│       ├── 05_DATABASE.md
│       ├── 05_DATABASE_FINDINGS.md
│       ├── 06_DEVOPS.md
│       ├── 06_DEVOPS_FINDINGS.md
│       ├── 07_DEPENDENCIES_AND_COMPLIANCE.md
│       ├── 08_CODE_QUALITY_STANDARDS.md
│       ├── 09_BUSINESS_AND_ROADMAP.md
│       ├── 10_PRIORITIZED_PLAN.md
│       ├── 11_PATCHES.md
│       └── 12_SEARCH_LOG.md
├── fix_arabic.sql
├── migrations
│   └── init.sql
├── package-lock.json
├── package.json
├── packages
│   ├── agent-sdk
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── actions
│   │   │   │   └── index.ts
│   │   │   ├── entities
│   │   │   │   └── index.ts
│   │   │   ├── events
│   │   │   │   └── index.ts
│   │   │   ├── index.ts
│   │   │   └── tasks
│   │   │       └── index.ts
│   │   └── tsconfig.json
│   └── shared
│       ├── package.json
│       ├── src
│       │   ├── config
│       │   │   └── index.ts
│       │   ├── errors
│       │   │   └── index.ts
│       │   ├── index.ts
│       │   ├── logger
│       │   │   └── index.ts
│       │   └── utils
│       │       └── index.ts
│       └── tsconfig.json
├── postman
│   └── Operations_Agent.postman_collection.json
├── scripts
│   ├── add-inventory-agent.js
│   ├── check-bulk-ops.js
│   ├── check-catalog-items.js
│   ├── check-constraints.js
│   ├── check-customers.js
│   ├── check-inv-columns.js
│   ├── check-inventory-schema.js
│   ├── check-inventory-setup.js
│   ├── check-neon-tables.js
│   ├── check-notifications.js
│   ├── check-tables.js
│   ├── create-all-tables.js
│   ├── create-bulk-ops-table.js
│   ├── fix-neon-tables.js
│   ├── full-schema-scan.js
│   ├── go-check.js
│   ├── migrate-neon-direct.js
│   ├── migrate-neon.js
│   ├── quick-fix.js
│   ├── run-e2e-tests.js
│   ├── setup-inventory-agent.js
│   └── setup-neon.md
├── seed_data.sql
├── docs
│   ├── legacy
│   │   └── temp_extract
│   │       ├── README.md
│   │       ├── docker-compose.yml
│   │       ├── docs
│   │       │   ├── ARCHITECTURE.md
│   │       │   ├── COMPLETE_DOCUMENTATION.md
│   │       │   ├── LLM.md
│   │       │   ├── OBSERVABILITY.md
│   │       │   ├── SECURITY.md
│   │       │   └── TEST_PLAN.md
│   │       └── src
│   │           ├── api
│   │           │   ├── api.module.ts
│   │           │   ├── controllers
│   │           │   │   ├── admin.controller.ts
│   │           │   │   ├── catalog.controller.ts
│   │           │   │   ├── conversations.controller.ts
│   │           │   │   ├── inbox.controller.ts
│   │           │   │   ├── index.ts
│   │           │   │   ├── merchants.controller.ts
│   │           │   │   └── orders.controller.ts
│   │           │   └── dto
│   │           │       ├── catalog.dto.ts
│   │           │       ├── inbox.dto.ts
│   │           │       ├── index.ts
│   │           │       └── merchant.dto.ts
│   │           ├── app.module.ts
│   │           ├── application
│   │           │   ├── adapters
│   │           │   │   ├── adapters.module.ts
│   │           │   │   ├── delivery-adapter.interface.ts
│   │           │   │   ├── index.ts
│   │           │   │   └── mock-delivery.adapter.ts
│   │           │   ├── dlq
│   │           │   │   ├── dlq.module.ts
│   │           │   │   ├── dlq.service.ts
│   │           │   │   └── index.ts
│   │           │   ├── events
│   │           │   │   ├── event-handler.registry.ts
│       │   │   ├── event-types.ts
│       │   │   ├── events.module.ts
│       │   │   ├── handlers
│       │   │   │   ├── delivery-status.handler.ts
│       │   │   │   ├── followup.handler.ts
│       │   │   │   ├── index.ts
│       │   │   │   ├── merchant-alert.handler.ts
│       │   │   │   ├── order-created.handler.ts
│       │   │   │   └── shipment-booked.handler.ts
│       │   │   ├── index.ts
│       │   │   ├── outbox.service.ts
│       │   │   └── outbox.worker.ts
│       │   ├── jobs
│       │   │   ├── daily-report.scheduler.ts
│       │   │   ├── delivery-status.poller.ts
│       │   │   ├── followup.scheduler.ts
│       │   │   ├── index.ts
│       │   │   └── jobs.module.ts
│       │   ├── llm
│       │   │   ├── index.ts
│       │   │   ├── llm-schema.ts
│       │   │   ├── llm.module.ts
│       │   │   └── llm.service.ts
│       │   ├── policies
│       │   │   ├── address-validation.policy.ts
│       │   │   ├── index.ts
│       │   │   ├── negotiation.policy.ts
│       │   │   ├── policies.module.ts
│       │   │   └── slot-filling.policy.ts
│       │   └── services
│       │       ├── inbox.service.ts
│       │       └── index.ts
│       ├── cli
│       │   ├── dlq-replay.ts
│       │   ├── run-migrations.ts
│       │   └── seed.ts
│       ├── domain
│       │   ├── entities
│       │   │   ├── catalog.entity.ts
│       │   │   ├── conversation.entity.ts
│       │   │   ├── customer.entity.ts
│       │   │   ├── event.entity.ts
│       │   │   ├── index.ts
│       │   │   ├── known-area.entity.ts
│       │   │   ├── merchant.entity.ts
│       │   │   ├── message.entity.ts
│       │   │   ├── order.entity.ts
│       │   │   └── shipment.entity.ts
│       │   ├── index.ts
│       │   ├── policies
│       │   │   ├── address-validation-policy.interface.ts
│       │   │   ├── index.ts
│       │   │   ├── negotiation-policy.interface.ts
│       │   │   └── slot-filling-policy.interface.ts
│       │   └── ports
│       │       ├── catalog.repository.ts
│       │       ├── conversation.repository.ts
│       │       ├── customer.repository.ts
│       │       ├── event.repository.ts
│       │       ├── index.ts
│       │       ├── known-area.repository.ts
│       │       ├── merchant.repository.ts
│       │       ├── message.repository.ts
│       │       ├── order.repository.ts
│       │       └── shipment.repository.ts
│       ├── infrastructure
│       │   ├── database
│       │   │   ├── data-source.ts
│       │   │   ├── database.module.ts
│       │   │   └── index.ts
│       │   ├── redis
│       │   │   ├── index.ts
│       │   │   ├── redis.module.ts
│       │   │   └── redis.service.ts
│       │   └── repositories
│       │       ├── catalog.repository.impl.ts
│       │       ├── conversation.repository.impl.ts
│       │       ├── customer.repository.impl.ts
│       │       ├── event.repository.impl.ts
│       │       ├── index.ts
│       │       ├── known-area.repository.impl.ts
│       │       ├── merchant.repository.impl.ts
│       │       ├── message.repository.impl.ts
│       │       ├── order.repository.impl.ts
│       │       ├── repositories.module.ts
│       │       └── shipment.repository.impl.ts
│       ├── main.ts
│       └── shared
│           ├── constants
│           │   ├── enums.ts
│           │   ├── index.ts
│           │   └── templates.ts
│           ├── filters
│           │   ├── all-exceptions.filter.ts
│           │   └── index.ts
│           ├── guards
│           │   ├── admin-api-key.guard.ts
│           │   └── index.ts
│           ├── index.ts
│           ├── logging
│           │   ├── index.ts
│           │   └── logger.ts
│           ├── middleware
│           │   ├── correlation-id.middleware.ts
│           │   └── index.ts
│           ├── pipes
│           │   ├── index.ts
│           │   └── zod-validation.pipe.ts
│           ├── schemas
│           │   └── index.ts
│           ├── shared.module.ts
│           └── utils
│               ├── helpers.ts
│               └── index.ts
├── temp_seed.sql
└── tsconfig.json
```

## Languages & Frameworks Detected

- TypeScript + Node.js monorepo (workspaces). Evidence: `package.json:6-9`, `package.json:46-51`, `package.json:60-63`.
- NestJS (API + Worker). Evidence: `apps/api/package.json:31-40`, `apps/worker/package.json:1-42`.
- Next.js (Portal, React 18). Evidence: `apps/portal/package.json:6-33`.
- SQL (PostgreSQL migrations). Evidence: `apps/api/migrations/001_init.sql:1-8`, `apps/api/migrations/002_production_features.sql:1-20`.
- Markdown documentation. Evidence: `docs/ARCHITECTURE.md:1-20`, `docs/SECURITY.md:1-30`, `apps/api/docs/WHATSAPP_INTEGRATION.md:1-20`.

## Package Managers

- npm with lockfile. Evidence: `package-lock.json:1-12`, `apps/api/package-lock.json:1-12`.

## Runtime Versions Referenced

- Node.js >= 20. Evidence: `package.json:60-63` (engines), `apps/api/Dockerfile:1-2`, `apps/worker/Dockerfile:1-2`, `apps/portal/Dockerfile:1-2` (node:20-alpine).
- PostgreSQL 16. Evidence: `docker-compose.yml:3-9` (postgres:16-alpine).
- Redis 7. Evidence: `docker-compose.yml:25-33` (redis:7-alpine).
- pgvector in test stack. Evidence: `docker-compose.test.yml:7-16` (pgvector/pgvector:pg16).

## Entry Points

- API service bootstrap: `apps/api/src/main.ts:7-129` (NestJS bootstrap, global prefix, CORS, etc.).
- Worker service bootstrap: `apps/worker/src/main.ts:6-30`.
- Portal (Next.js app router): `apps/portal/src/app/layout.tsx:1-25`, `apps/portal/src/app/page.tsx:1-30`.
- CLI tools: apps/api/src/cli/\*.ts (e.g., migrations/seed). Evidence: `apps/api/src/cli/run-migrations.ts:1-120`.

## Config Files & Conventions

- Environment files: .env, .env.example, apps/api/.env, apps/worker/.env, apps/portal/.env.local. Evidence: `.env:1-54`, `.env.example:1-40`, `apps/api/.env:1-68`, `apps/worker/.env:1-31`, `apps/portal/.env.local:1-6`.
- TypeScript config: tsconfig.json (root), per-app configs in apps/api/tsconfig.json, apps/worker/tsconfig.json, apps/portal/tsconfig.json. Evidence: `tsconfig.json:1-28`, `apps/api/tsconfig.json:1-35`, `apps/worker/tsconfig.json:1-28`, `apps/portal/tsconfig.json:1-26`.
- NestJS CLI config: apps/api/nest-cli.json, apps/worker/nest-cli.json. Evidence: `apps/api/nest-cli.json:1-8`, `apps/worker/nest-cli.json:1-7`.
- Next.js config: apps/portal/next.config.js, Tailwind/PostCSS configs: apps/portal/tailwind.config.js, apps/portal/postcss.config.js. Evidence: `apps/portal/next.config.js:1-48`, `apps/portal/tailwind.config.js:1-88`, `apps/portal/postcss.config.js:1-6`.
- Docker compose and Dockerfiles: docker-compose.yml, docker-compose.test.yml, apps/api/Dockerfile, apps/worker/Dockerfile, apps/portal/Dockerfile. Evidence: `docker-compose.yml:1-114`, `docker-compose.test.yml:1-46`, `apps/api/Dockerfile:1-63`, `apps/worker/Dockerfile:1-63`, `apps/portal/Dockerfile:1-63`.
- Postman collections: postman/Operations_Agent.postman_collection.json, apps/api/postman/Twilio_WhatsApp_Webhooks.postman_collection.json. Evidence: `postman/Operations_Agent.postman_collection.json:1-40`, `apps/api/postman/Twilio_WhatsApp_Webhooks.postman_collection.json:1-40`.

## CI/CD, Containers, IaC

- GitHub Actions CI: .github/workflows/ci.yml (lint/build/test/e2e/docker build). Evidence: `.github/workflows/ci.yml:1-121`.
- Dockerized services and local dev compose: docker-compose.yml, docker-compose.test.yml. Evidence: `docker-compose.yml:1-114`, `docker-compose.test.yml:1-46`.
- IaC / k8s manifests: **Not found in repository** (no Terraform, Helm, or Kubernetes manifests found in tree). Evidence: `docs/project-scan/12_SEARCH_LOG.md:5-11`. Suggested additions: infra/ with Terraform or k8s/ manifests for deployment.
