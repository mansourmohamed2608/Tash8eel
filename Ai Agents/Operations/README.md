# Operations Agent - MVP Core

A production-ready conversational commerce agent built with NestJS, PostgreSQL, Redis, and OpenAI GPT-4o-mini. Supports Arabic-first communication with Egyptian dialect, multi-tenant architecture, and intelligent order processing.

## 🚀 Features

- **Arabic-First**: All customer responses in Egyptian Arabic (عامية مصرية)
- **Multi-Tenant**: Complete merchant isolation with API key authentication
- **Intelligent Order Processing**: Extract items, quantities, addresses from natural language
- **Smart Negotiation**: Category-specific discount policies
- **Delivery Integration**: Pluggable delivery adapter pattern
- **Event-Driven**: Outbox pattern with DLQ and replay capability
- **Cost Guardrails**: Daily token budget per merchant

## 📋 9 Core Behaviors

1. **Arabic Replies** - All responses in Egyptian Arabic
2. **Negotiation** - Category-aware discount handling (CLOTHES: 10%, FOOD: 5%, etc.)
3. **Order Extraction** - NLP-based item/quantity extraction using GPT-4o-mini
4. **Delivery Booking** - Automatic shipment creation with courier integration
5. **Tracking** - Real-time order status updates
6. **Follow-ups** - Abandoned cart recovery and post-delivery feedback
7. **Daily Reports** - Automated merchant performance summaries
8. **Customer Memory** - Address and preference persistence
9. **Merchant Config** - Custom brand voice, limits, and hours

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         API Layer                            │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌────────────────┐  │
│  │  Inbox  │  │ Merchant │  │ Catalog │  │     Admin      │  │
│  └────┬────┘  └────┬─────┘  └────┬────┘  └───────┬────────┘  │
└───────┼────────────┼─────────────┼───────────────┼───────────┘
        │            │             │               │
        ▼            ▼             ▼               ▼
┌──────────────────────────────────────────────────────────────┐
│                     Application Layer                         │
│  ┌────────────────┐  ┌────────────┐  ┌──────────────────┐    │
│  │  InboxService  │  │ LlmService │  │  Policy Engines  │    │
│  └────────────────┘  └────────────┘  └──────────────────┘    │
│  ┌────────────────┐  ┌────────────┐  ┌──────────────────┐    │
│  │  OutboxWorker  │  │ DlqService │  │   Job Schedulers │    │
│  └────────────────┘  └────────────┘  └──────────────────┘    │
└──────────────────────────────────────────────────────────────┘
        │                   │                    │
        ▼                   ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                       │
│  ┌────────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐  │
│  │ PostgreSQL │  │  Redis   │  │  OpenAI    │  │ Delivery │  │
│  │ (pg Pool)  │  │ (ioredis)│  │ GPT-4o-mini│  │ Adapter  │  │
│  └────────────┘  └──────────┘  └────────────┘  └──────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
src/
├── api/                    # REST controllers & DTOs
│   ├── controllers/
│   └── dto/
├── application/            # Business logic
│   ├── adapters/           # External service adapters
│   ├── dlq/                # Dead Letter Queue
│   ├── events/             # Event handlers & outbox
│   ├── jobs/               # Scheduled jobs
│   ├── llm/                # OpenAI integration
│   ├── policies/           # Business rules engines
│   └── services/           # Core services
├── domain/                 # Entities & port interfaces
│   ├── entities/
│   └── ports/
├── infrastructure/         # Database & Redis
│   ├── database/
│   ├── repositories/
│   └── redis/
├── shared/                 # Cross-cutting concerns
│   ├── constants/
│   ├── filters/
│   ├── guards/
│   ├── logging/
│   ├── middleware/
│   ├── schemas/
│   └── utils/
└── cli/                    # CLI tools
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- OpenAI API key

### 1. Clone and Install

```bash
cd Operations
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

# Redis (optional)
REDIS_URL=redis://localhost:6379

# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Security
ADMIN_API_KEY=your-admin-secret
```

### 3. Start Infrastructure

```bash
docker-compose up -d
```

### 4. Run Migrations

Migrations run automatically on container startup, or manually:
```bash
docker exec -i operations-db psql -U ops -d operations < migrations/init.sql
```

### 5. Start the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

### 6. Seed Demo Data

```bash
npm run cli:seed
# Or via API:
curl -X POST http://localhost:3000/api/v1/admin/seed \
  -H "x-admin-key: your-admin-secret"
```

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/inbox/message` | POST | Process customer message |
| `/api/v1/merchants/:id/config` | POST | Update merchant config |
| `/api/v1/catalog/upsert` | POST | Bulk upsert catalog items |
| `/api/v1/conversations/:id` | GET | Get conversation with history |
| `/api/v1/orders/:id` | GET | Get order with shipment |
| `/api/v1/admin/replay/:id` | POST | Replay DLQ event |
| `/api/v1/admin/metrics` | GET | System metrics |
| `/api/v1/admin/seed` | POST | Seed demo data |

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
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

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

### Build Image

```bash
docker build -t operations-agent .
```

### Run Full Stack

```bash
docker-compose up -d
```

Services:
- **operations-api**: Main application (port 3000)
- **operations-db**: PostgreSQL 16 (port 5432)
- **operations-redis**: Redis 7 (port 6379)

## 📖 Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and patterns
- [LLM Integration](docs/LLM.md) - OpenAI GPT-4o-mini setup
- [Security](docs/SECURITY.md) - Authentication and authorization
- [Test Plan](docs/TEST_PLAN.md) - Testing strategy
- [Observability](docs/OBSERVABILITY.md) - Logging and monitoring

## 🔒 Security

- API key authentication per merchant
- Admin endpoints require separate admin key
- Correlation IDs for request tracing
- PII masking in logs
- Input validation with Zod schemas

## 📊 Observability

- Structured JSON logging (Pino)
- Correlation ID propagation
- Health endpoints: `/health`, `/ready`
- Metrics endpoint: `/api/v1/admin/metrics`

## 🛡 Production Checklist

- [ ] Set strong `ADMIN_API_KEY`
- [ ] Enable TLS/HTTPS
- [ ] Configure Redis for distributed locks
- [ ] Set appropriate token budgets per merchant
- [ ] Enable log aggregation (ELK/Datadog)
- [ ] Configure alerts for DLQ growth
- [ ] Set up database backups

## 📄 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Write tests
4. Submit pull request

---

Built with ❤️ for Egyptian e-commerce
