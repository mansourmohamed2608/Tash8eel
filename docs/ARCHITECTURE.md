# Tash8eel — Architecture

## Overview

Tash8eel (تشغيل) is a multi-tenant SaaS conversational commerce platform for Egyptian SMBs. The system is organized as a **monorepo** with three applications, two shared packages, and supporting infrastructure.

## Monorepo Layout

```
Tash8eel/
├── apps/
│   ├── api/        → NestJS REST API (:3000)      ~34 controllers, ~270+ routes
│   ├── portal/     → Next.js 14 Dashboard (:3001)  43+ pages, RTL, dark theme
│   └── worker/     → NestJS Background Worker (:3002)  Events, DLQ, jobs
├── packages/
│   ├── shared/     → Utils, errors, config, logger (57 tests)
│   └── agent-sdk/  → Agent Teams SDK (multi-agent orchestration)
├── migrations/     → SQL schema (001–054)
├── scripts/        → Setup, migration, and utility scripts
└── docker-compose.yml → Full stack orchestration
```

## Architecture Pattern

We follow **Hexagonal Architecture** (Ports and Adapters) in the API and Worker services:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Portal (:3001)                        │
│  App Router · RTL · Error Boundaries · RBAC · 43+ pages        │
├─────────────────────────────────────────────────────────────────┤
│                       NestJS API (:3000)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Controllers  │ │   Services   │ │   Guards     │            │
│  │ (34 modules) │ │ (Business)   │ │ (Auth/RBAC)  │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │  LLM Engine  │ │   Policies   │ │   Billing    │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                    NestJS Worker (:3002)                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │Outbox Poller │ │  DLQ Handler │ │  Schedulers  │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ PostgreSQL   │ │    Redis     │ │   OpenAI     │            │
│  │ 16 + pgvec   │ │ 7 + auth    │ │ GPT-4o-mini  │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## API Service (`apps/api/`)

### Folder Structure

```
src/
├── api/controllers/     # 34 REST controllers
├── application/
│   ├── adapters/        # External service adapters (delivery, etc.)
│   ├── dlq/             # Dead Letter Queue
│   ├── events/          # Event system (Outbox pattern)
│   ├── jobs/            # Scheduled jobs (follow-ups, reports)
│   ├── llm/             # OpenAI integration with structured outputs
│   ├── policies/        # Business rules (negotiation, slot-filling)
│   └── services/        # Core business services
├── domain/
│   ├── entities/        # Domain entities
│   └── ports/           # Repository interfaces
├── infrastructure/
│   ├── database/        # PostgreSQL connection pool
│   ├── redis/           # Redis (locks, cache, rate limiting)
│   └── repositories/    # Repository implementations
└── shared/
    ├── constants/       # Enums, templates
    ├── filters/         # Exception filters
    ├── guards/          # MerchantApiKeyGuard, RBACGuard, RateLimitGuard
    ├── logging/         # Pino structured logger
    ├── middleware/       # Correlation ID, request logging
    └── schemas/         # Zod validation schemas
```

### Key Features

- **Auth**: API key + JWT Bearer, demo users gated by NODE_ENV
- **RBAC**: 5 roles (OWNER, ADMIN, MANAGER, AGENT, VIEWER)
- **Rate Limiting**: 2 layers — `@nestjs/throttler` global + custom Redis sliding window
- **Entitlements**: 50+ endpoints gated by subscription plan tier
- **3 AI Agents**: Operations, Inventory, Customer Service
- **Agent Teams**: Multi-agent orchestration via `agent-sdk` package

## Portal Service (`apps/portal/`)

### Folder Structure

```
src/
├── app/                 # Next.js App Router
│   ├── layout.tsx       # Root layout (RTL, AuthProvider)
│   ├── global-error.tsx # Global error boundary
│   ├── merchant/        # Merchant dashboard (~35 pages)
│   │   ├── error.tsx    # Merchant error boundary
│   │   ├── dashboard/
│   │   ├── conversations/
│   │   ├── orders/
│   │   ├── inventory/
│   │   ├── analytics/
│   │   ├── billing/
│   │   ├── agents/
│   │   ├── teams/
│   │   └── ...
│   └── admin/           # Admin panel (~8 pages)
├── components/
│   ├── layout/          # Sidebar (RBAC-aware), TopBar, PageHeader
│   ├── ui/              # shadcn/ui components
│   └── error-boundary.tsx  # React ErrorBoundary class component
├── lib/
│   ├── api.ts           # merchantApi (typed methods)
│   ├── api-client.ts    # Barrel re-export
│   └── utils.ts         # cn, formatCurrency, formatDate, etc.
├── providers/           # AuthProvider
└── __tests__/           # Vitest tests (utils, error-boundary, smoke)
```

### Key Features

- **Dark Theme**: Consistent `bg-[#0f0f23]` / `bg-[#1a1a2e]` palette
- **RTL**: `<html lang="ar" dir="rtl">` with Arabic labels
- **Sidebar**: 35+ nav items, feature-gated, role-restricted, collapsible
- **Accessible**: ARIA labels, `aria-current="page"`, keyboard nav
- **Error Handling**: Global + merchant-level error boundaries
- **Testing**: Vitest + @testing-library/react + jsdom

## Worker Service (`apps/worker/`)

### Folder Structure

```
src/
├── application/
│   ├── events/          # Event handlers
│   ├── outbox/          # Outbox poller (5s interval)
│   ├── dlq/             # Dead Letter Queue (5 retries → DLQ)
│   └── jobs/            # Scheduled tasks
├── infrastructure/
│   ├── database/        # PostgreSQL connection
│   └── redis/           # Redis for distributed locks
└── main.ts              # Standalone NestJS + HTTP health (:3002)
```

### Key Features

- **Outbox Pattern**: Polls pending events every 5 seconds
- **Distributed Locks**: Redis-based to prevent duplicate processing
- **DLQ**: Failed events after 5 retries moved to Dead Letter Queue
- **Health Server**: HTTP health endpoint on port 3002
- **Scheduled Jobs**: Follow-ups, daily reports, cleanup

## Shared Packages

### `packages/shared/`

Utilities shared across API, Worker, and Portal:

- **utils/** — `formatCurrency`, `slugify`, `sanitizeHtml`, date helpers
- **errors/** — `AppError`, `NotFoundError`, `ValidationError`, `AuthorizationError`
- **config/** — Environment validation, feature flags
- **logger/** — Pino-based structured logger
- **57 tests** (Jest)

### `packages/agent-sdk/`

Multi-agent orchestration SDK:

- Agent registration and lifecycle
- Team composition with shared context
- Message routing between agents

## Key Design Decisions

### 1. Multi-Tenancy

- Every operation is scoped by `merchantId`
- All database queries include `merchant_id` in WHERE clauses
- Repository interfaces enforce merchant isolation

### 2. OpenAI Integration

- **Model**: GPT-4o-mini exclusively (cost-effective for Arabic)
- **Structured Outputs**: JSON Schema with `strict: true`
- **Zod Validation**: All LLM responses validated before use
- **Token Budget**: Per-merchant daily limits enforced
- **AI Caching**: Redis-backed response caching for cost reduction

### 3. Event-Driven Architecture

- **Outbox Pattern**: Events persisted in DB before processing (Worker polls)
- **At-least-once delivery**: Idempotent event handlers
- **DLQ**: Failed events moved to Dead Letter Queue after 5 retries
- **Distributed Locks**: Redis-based to prevent duplicate processing

### 4. Security

- **Auth**: API key (x-api-key header) + JWT Bearer tokens
- **RBAC**: 5-level role hierarchy (OWNER > ADMIN > MANAGER > AGENT > VIEWER)
- **Rate Limiting**: Global throttler + per-endpoint Redis sliding window
- **Entitlements**: Feature access gated by subscription plan
- **61 security tests** validating auth, RBAC, input validation

### 5. Subscription & Billing

- 5 plan tiers: TRIAL → STARTER → GROWTH → PRO → ENTERPRISE
- Egyptian Pound (EGP) pricing
- Entitlement provisioning tied to plan features
- Usage metering for conversations and orders

## Data Flow

### Message Processing

```
1. Customer sends message via WhatsApp
         ↓
2. Webhook POSTs to /v1/inbox/message
         ↓
3. API InboxService orchestrates:
   a. Load merchant config  →  Check entitlements
   b. Get/create conversation
   c. Build LLM context  →  Call OpenAI
   d. Apply policies (negotiation, slot-filling)
   e. Update cart / create order
   f. Publish event to outbox
         ↓
4. Worker polls outbox (5s) → processes events
         ↓
5. Portal shows real-time updates via polling
```

### Portal ↔ API Flow

```
Portal (Next.js)  ──fetch──►  API (NestJS)
                   x-api-key
                   Bearer JWT
                               │
                               ▼
                        Guards check:
                        1. API key valid?
                        2. JWT valid?
                        3. Role sufficient?
                        4. Rate limit ok?
                        5. Entitlement ok?
                               │
                               ▼
                         Service layer
                               │
                               ▼
                           Response
```

## Database Schema

### Core Tables (54 migrations)

- `merchants` — Tenant configuration, plan, features
- `conversations` — Chat sessions with state machine
- `messages` — Full message history
- `orders` — Orders with line items
- `shipments` — Delivery tracking
- `customers` — Customer profiles with addresses
- `catalog_items` — Product catalog with variants
- `staff_members` — Team members with RBAC roles

### Event Tables

- `outbox_events` — Pending/processed events
- `dlq_events` — Failed events for replay

### Billing Tables

- `subscriptions` — Active plan subscriptions
- `invoices` — Billing history
- `usage_metrics` — Conversation/order counters

## Scaling Considerations

### Horizontal Scaling

- Stateless API servers behind load balancer
- Worker uses Redis distributed locks (single-writer)
- Database connection pooling
- Portal: Vercel/Netlify or containerized

### Performance

- Batch event processing (50 at a time)
- Index on `merchant_id` for all tables
- AI response caching in Redis
- Pino for high-performance logging

### Reliability

- Outbox pattern for event delivery
- DLQ for failed event recovery
- Graceful shutdown handlers
- Health/ready endpoints on all 3 services
- Error boundaries in Portal (global + route-level)

## Technology Choices

| Component     | Choice                   | Rationale                                      |
| ------------- | ------------------------ | ---------------------------------------------- |
| API Framework | NestJS                   | Modular, TypeScript-first, guards/interceptors |
| Portal        | Next.js 14               | App Router, RSC, SSR                           |
| Worker        | NestJS standalone        | Same DI as API, simpler HTTP                   |
| Database      | PostgreSQL 16 + pgvector | JSONB, vector search, full-text                |
| Cache/Locks   | Redis 7                  | Distributed locks, rate limiting, AI cache     |
| LLM           | GPT-4o-mini              | Cost-effective, good Arabic                    |
| Validation    | Zod                      | Runtime type safety                            |
| UI            | Tailwind + shadcn/ui     | Consistent dark theme                          |
| Testing       | Jest + Vitest            | Jest for API/shared, Vitest for Portal         |
| CI            | GitHub Actions           | 12-job pipeline with matrix builds             |
