# Tash8eel — تشغيل

A production-ready SaaS platform for conversational commerce, built as a monorepo with NestJS API, Next.js Portal, Background Worker, and shared packages. Arabic-first (Egyptian dialect), multi-tenant, with AI-powered agents, RBAC, billing, and real-time analytics.

## 🚀 Platform Overview

| App        | Port | Framework           | Purpose                        |
| ---------- | ---- | ------------------- | ------------------------------ |
| **API**    | 3000 | NestJS              | REST API, Auth, Business Logic |
| **Portal** | 3001 | Next.js 14          | Merchant & Admin Dashboard     |
| **Worker** | 3002 | NestJS (standalone) | Background Jobs, Events, DLQ   |

## 📦 Monorepo Structure

```
Tash8eel/
├── apps/
│   ├── api/             # NestJS REST API (~34 controllers, ~270+ routes)
│   ├── portal/          # Next.js 14 Dashboard (43+ pages, RTL, dark theme)
│   └── worker/          # Background worker (events, jobs, DLQ)
├── packages/
│   ├── shared/          # Shared utils, errors, config, logger (57 tests)
│   └── agent-sdk/       # Agent Teams SDK
├── migrations/          # SQL migrations (001-054)
├── scripts/             # Setup & utility scripts
├── docs/                # Architecture, security, test plan docs
├── postman/             # API collection
└── docker-compose.yml   # Full stack: API + Portal + Worker + PG + Redis
```

## ✨ Features

### Core Platform

- **Arabic-First**: All responses in Egyptian Arabic (عامية مصرية)
- **Multi-Tenant**: Complete merchant isolation with API key + JWT auth
- **RBAC**: Role hierarchy (OWNER > ADMIN > MANAGER > AGENT > VIEWER)
- **Subscription Plans**: FREE → TRIAL(14d) → STARTER(299 EGP) → GROWTH(599) → PRO(1,299) → ENTERPRISE
- **50+ Endpoint Entitlement Gating**: Feature access tied to subscription tier

### AI & Agents

- **Conversational Commerce**: GPT-4o-mini powered order extraction, negotiation, follow-ups
- **3 Production Agents**: Operations, Inventory, Customer Service
- **Agent Teams SDK**: Multi-agent orchestration with shared context
- **AI Caching**: Redis-backed response caching for cost reduction
- **Vision/OCR**: Receipt processing, product analysis, text extraction

### Commerce

- **Order Processing**: NLP-based item/quantity extraction
- **Smart Negotiation**: Category-specific discount policies
- **Payment Links**: Generate, track, auto-verify with OCR
- **Inventory Management**: Stock tracking, alerts, bulk operations
- **Customer Segments**: RFM analysis, retention tracking

### Portal Dashboard

- **43+ Pages**: Dashboard, conversations, orders, inventory, analytics, billing, agents, teams, and more
- **Dark Theme**: Consistent dark UI with Tailwind CSS
- **RTL Layout**: Full Arabic right-to-left support
- **Error Boundaries**: Global + merchant-level error handling
- **Mobile Responsive**: Collapsible sidebar with hamburger menu
- **Accessible**: ARIA labels, aria-current, keyboard navigation

### Observability

- **Structured Logging**: Pino JSON logs with correlation IDs
- **Health Endpoints**: `/health`, `/ready` on all 3 services
- **KPI Dashboards**: Cart recovery, delivery metrics, agent performance, revenue
- **Audit Trail**: Full activity logging with admin viewer

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Portal (:3001)                   │
│  43+ pages · Dark theme · RTL · Error boundaries · RBAC     │
└─────────────────────┬───────────────────────────────────────┘
                      │ REST (fetch + x-api-key)
┌─────────────────────▼───────────────────────────────────────┐
│                    NestJS API (:3000)                         │
│  ~34 controllers · ~270+ routes · Guards · Throttling        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  Inbox   │  │ Merchant │  │  Agents  │  │   Billing   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
└───────┼──────────────┼──────────────┼──────────────┼────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────┐
│                  NestJS Worker (:3002)                        │
│  Outbox polling · DLQ · Scheduled jobs · Event handlers      │
└──────────────────────┬───────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌───────────┐  ┌──────────┐  ┌───────────┐
  │ PostgreSQL│  │  Redis   │  │  OpenAI   │
  │  (pgvec)  │  │  7-alpine│  │ GPT-4o-mini│
  └───────────┘  └──────────┘  └───────────┘
```

## 📁 Project Structure

```
Tash8eel/
├── apps/
│   ├── api/src/                # NestJS API
│   │   ├── api/controllers/    # REST controllers & DTOs
│   │   ├── application/        # Business logic, services, policies
│   │   ├── domain/             # Entities & port interfaces
│   │   ├── infrastructure/     # Database, Redis, repositories
│   │   └── shared/             # Guards, filters, middleware
│   ├── portal/src/             # Next.js Portal
│   │   ├── app/                # App Router pages (merchant/, admin/)
│   │   ├── components/         # UI components (layout, ui, shared)
│   │   ├── lib/                # API client, utils, auth
│   │   ├── providers/          # AuthProvider, theme
│   │   └── __tests__/          # Vitest tests
│   └── worker/src/             # Background Worker
│       ├── application/        # Event handlers, outbox, DLQ, jobs
│       └── infrastructure/     # Database, Redis connections
├── packages/
│   ├── shared/                 # Shared utils, errors, config, logger
│   └── agent-sdk/              # Agent Teams SDK
├── migrations/                 # SQL schema (001-054)
└── docker-compose.yml          # Full stack orchestration
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- OpenAI API key

### 1. Clone and Install

```bash
cd Tash8eel
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://ops:ops@localhost:5432/operations

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Security
ADMIN_API_KEY=your-admin-secret
JWT_SECRET=your-jwt-secret
```

### 3. Start Full Stack

```bash
docker-compose up -d
```

This starts all services:

- **API** at `http://localhost:3000`
- **Portal** at `http://localhost:3001`
- **Worker** at `http://localhost:3002`
- **PostgreSQL** (pgvector) at `localhost:5432`
- **Redis** at `localhost:6379`

### 4. Development Mode

```bash
# API
cd apps/api && npm run start:dev

# Portal
cd apps/portal && npm run dev

# Worker
cd apps/worker && npm run start:dev
```

## 📡 API Endpoints

| Endpoint                             | Method | Description                   |
| ------------------------------------ | ------ | ----------------------------- |
| `/api/v1/inbox/message`              | POST   | Process customer message      |
| `/api/v1/merchants/:id/config`       | POST   | Update merchant config        |
| `/api/v1/catalog/upsert`             | POST   | Bulk upsert catalog items     |
| `/api/v1/conversations/:id`          | GET    | Get conversation with history |
| `/api/v1/orders/:id`                 | GET    | Get order with shipment       |
| `/api/v1/admin/replay/:id`           | POST   | Replay DLQ event              |
| `/api/v1/admin/metrics`              | GET    | System metrics                |
| `/api/v1/admin/seed`                 | POST   | Seed demo data                |
| `/api/v1/vision/receipt`             | POST   | OCR process payment receipt   |
| `/api/v1/vision/product`             | POST   | Analyze product image         |
| `/api/v1/vision/medicine`            | POST   | Analyze medicine image        |
| `/api/v1/vision/extract-text`        | POST   | General OCR text extraction   |
| `/api/v1/payments/links`             | POST   | Create payment link           |
| `/api/v1/payments/links`             | GET    | List payment links            |
| `/api/v1/payments/proofs`            | POST   | Submit payment proof          |
| `/api/v1/payments/proofs/:id/verify` | POST   | Verify payment proof          |
| `/api/v1/kpis/recovered-carts`       | GET    | Cart recovery KPIs            |
| `/api/v1/kpis/delivery-failures`     | GET    | Delivery failure KPIs         |
| `/api/v1/kpis/agent-performance`     | GET    | AI agent performance KPIs     |
| `/api/v1/kpis/revenue`               | GET    | Revenue KPIs                  |
| `/api/v1/kpis/customers`             | GET    | Customer KPIs                 |

### Example: Send Message

```bash
curl -X POST http://localhost:3000/api/v1/inbox/message \
  -H "Content-Type: application/json" \
  -H "x-api-key: demo-api-key-12345" \
  -d '{
    "merchantId": "demo-merchant",
    "senderId": "+201234567890",
    "channel": "whatsapp",
    "text": "عايز أطلب 2 بيتزا مارجريتا"
  }'
```

## 📮 Postman Collection

Import the collection from `postman/Operations_Agent.postman_collection.json`

Includes example requests for all endpoints with sample responses.

## 🧪 Testing

```bash
# Shared package (57 tests)
cd packages/shared && npm test

# API security tests (61 tests)
cd apps/api && npx jest --testPathPattern=security

# Portal tests (vitest)
cd apps/portal && npx vitest run

# API E2E tests (5 specs)
cd apps/api && npm run test:e2e

# All tests
npm run test --workspaces
```

### Test Coverage

| Suite             | Tests    | Framework |
| ----------------- | -------- | --------- |
| Shared Package    | 57       | Jest      |
| API Security      | 61       | Jest      |
| Portal Components | 38+      | Vitest    |
| API E2E           | 5 specs  | Jest      |
| **Total**         | **156+** |           |

## 🔧 CLI Tools

### Replay DLQ Events

```bash
# Replay single event
npm run cli:dlq -- --id evt-123

# Replay all pending
npm run cli:dlq -- --all

# Replay specific event types
npm run cli:dlq -- --type OrderCreated
```

### Seed Data

```bash
npm run cli:seed
```

## 🐳 Docker

### Run Full Stack

```bash
docker-compose up -d
```

Services:

- **api**: NestJS API (port 3000) — healthcheck enabled
- **portal**: Next.js Dashboard (port 3001)
- **worker**: Background processor (port 3002) — healthcheck enabled
- **db**: PostgreSQL 16 with pgvector (port 5432) — healthcheck enabled
- **redis**: Redis 7-alpine with auth (port 6379) — healthcheck enabled

## 🔒 Security

- API key + JWT Bearer authentication per merchant
- RBAC with 5 role levels (OWNER → VIEWER)
- Admin endpoints require separate admin key
- Rate limiting: 2 layers (global throttler + Redis sliding window)
- Correlation IDs for request tracing
- PII masking in logs
- Input validation with Zod schemas
- 61 dedicated security tests

## 💰 Pricing Plans (EGP)

| Plan       | Price       | Limits                                 |
| ---------- | ----------- | -------------------------------------- |
| TRIAL      | 0 (14 days) | 50 conversations, 100 orders           |
| STARTER    | 299/mo      | 500 conversations, 1,000 orders        |
| GROWTH     | 599/mo      | 2,000 conversations, 5,000 orders      |
| PRO        | 1,299/mo    | 10,000 conversations, unlimited orders |
| ENTERPRISE | Custom      | Custom limits                          |

## 📖 Documentation

- [Architecture](docs/ARCHITECTURE.md) — Full system design
- [Security](docs/SECURITY.md) — Auth, RBAC, rate limiting
- [Test Plan](docs/TEST_PLAN.md) — Testing strategy
- [Observability](docs/OBSERVABILITY.md) — Logging and monitoring
- [LLM Integration](docs/LLM.md) — OpenAI GPT-4o-mini setup
- [Gap Analysis](docs/GAP_ANALYSIS.md) — Feature gap assessment
- [Release Checklist](docs/RELEASE_CHECKLIST.md) — Production deploy steps

## 📄 License

MIT

---

Built with ❤️ for Egyptian e-commerce — تشغيل
