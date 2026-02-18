# Operations Agent - Complete Documentation

> Comprehensive guide to the AI-powered conversational commerce platform for Egyptian SMBs

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Deep Dive](#2-architecture-deep-dive)
3. [Technology Stack](#3-technology-stack)
4. [Installation & Setup](#4-installation--setup)
5. [Configuration Reference](#5-configuration-reference)
6. [API Endpoints](#6-api-endpoints)
7. [Database Schema](#7-database-schema)
8. [LLM Integration](#8-llm-integration)
9. [Business Logic](#9-business-logic)
10. [Event System](#10-event-system)
11. [Testing](#11-testing)
12. [Deployment](#12-deployment)
13. [Project Structure](#13-project-structure)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Project Overview

### What is Operations Agent?

Operations Agent is a **multi-tenant conversational commerce platform** designed specifically for Egyptian SMBs (Small and Medium Businesses). It processes customer messages in Arabic (Egyptian dialect), extracts orders from natural language, handles price negotiation, and manages the complete order lifecycle.

### Key Capabilities

| Capability                      | Description                                              |
| ------------------------------- | -------------------------------------------------------- |
| **Natural Language Processing** | Understands Arabic customer messages and extracts intent |
| **Order Management**            | Cart building, order confirmation, status tracking       |
| **Smart Negotiation**           | Configurable discount rules with active promotions       |
| **Slot Filling**                | Collects customer name, phone, address progressively     |
| **Multi-Tenancy**               | Complete data isolation per merchant                     |
| **Event-Driven**                | Reliable event processing with dead letter queue         |

### Target Users

- **Merchants**: Egyptian SMBs selling clothes, food, or general merchandise
- **Customers**: Arabic-speaking customers interacting via WhatsApp
- **Admins**: Platform operators managing merchants and monitoring system health

---

## 2. Architecture Deep Dive

### Hexagonal Architecture (Ports & Adapters)

The project follows Clean Architecture principles:

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  • Controllers: REST endpoints for incoming requests            │
│  • DTOs: Request/Response validation with class-validator       │
│  • Swagger: Auto-generated API documentation                    │
├─────────────────────────────────────────────────────────────────┤
│                      Application Layer                           │
│  • InboxService: Main orchestration for message processing      │
│  • LlmService: OpenAI GPT integration                           │
│  • Policies: Business rules (negotiation, slot-filling)         │
│  • Events: Outbox pattern for reliable event delivery           │
│  • Jobs: Scheduled tasks (followups, reports)                   │
│  • DLQ: Dead letter queue handling                              │
├─────────────────────────────────────────────────────────────────┤
│                       Domain Layer                               │
│  • Entities: Pure domain models (Order, Conversation, etc.)     │
│  • Ports: Repository interfaces (abstractions)                  │
├─────────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                           │
│  • Repositories: PostgreSQL implementations                     │
│  • Redis: Distributed locks via Redlock                         │
│  • Adapters: External service integrations (delivery)           │
└─────────────────────────────────────────────────────────────────┘
```

### Message Processing Flow

```
1. Customer sends WhatsApp message
                    ↓
2. Webhook receives message → POST /v1/inbox/message
                    ↓
3. InboxService.processMessage() orchestrates:
   ├── Load merchant configuration
   ├── Get/create conversation (state machine)
   ├── Get/create customer profile
   ├── Store incoming message
   ├── Publish MessageReceived event
   ├── Build LLM context (catalog, history, cart)
   ├── Call OpenAI with structured output
   ├── Validate response with Zod
   ├── Apply business policies
   ├── Update cart if items extracted
   ├── Create order if confirmed
   ├── Store bot reply message
   └── Update conversation state
                    ↓
4. Return structured response to webhook
                    ↓
5. Webhook sends reply to customer via WhatsApp
```

### State Machine

Conversations follow a state machine:

```
GREETING → COLLECTING_ITEMS → COLLECTING_VARIANTS → COLLECTING_CUSTOMER_INFO
    ↓                                                        ↓
    └──────────────────────→ NEGOTIATING ←──────────────────┘
                                  ↓
                        COLLECTING_ADDRESS
                                  ↓
                        CONFIRMING_ORDER
                                  ↓
                          ORDER_PLACED
                                  ↓
                            TRACKING
                                  ↓
                            FOLLOWUP
                                  ↓
                             CLOSED
```

---

## 3. Technology Stack

### Core Framework

| Technology     | Version | Purpose                      |
| -------------- | ------- | ---------------------------- |
| **NestJS**     | 10.3.0  | Modular TypeScript framework |
| **TypeScript** | 5.x     | Type-safe JavaScript         |
| **Express**    | 4.x     | HTTP server (via NestJS)     |

### Database & Storage

| Technology     | Version      | Purpose                             |
| -------------- | ------------ | ----------------------------------- |
| **PostgreSQL** | 16           | Primary database with JSONB support |
| **Redis**      | 7            | Distributed locks, optional caching |
| **pg**         | 8.11.3       | PostgreSQL client                   |
| **ioredis**    | 5.3.2        | Redis client                        |
| **Redlock**    | 5.0.0-beta.2 | Distributed lock algorithm          |

### AI & Validation

| Technology            | Version | Purpose                   |
| --------------------- | ------- | ------------------------- |
| **OpenAI**            | 4.24.0  | GPT-4o-mini for NLP       |
| **Zod**               | 3.22.4  | Runtime schema validation |
| **class-validator**   | 0.14.0  | DTO validation            |
| **class-transformer** | 0.5.1   | Object transformation     |

### Observability & Security

| Technology            | Version | Purpose                  |
| --------------------- | ------- | ------------------------ |
| **Pino**              | 8.17.2  | High-performance logging |
| **pino-pretty**       | 10.3.1  | Dev log formatting       |
| **Helmet**            | 7.1.0   | Security headers         |
| **@nestjs/throttler** | 5.1.1   | Rate limiting            |
| **@nestjs/swagger**   | 7.4.0   | API documentation        |

### Development & Testing

| Technology   | Purpose              |
| ------------ | -------------------- |
| **Jest**     | Testing framework    |
| **ESLint**   | Code linting         |
| **Prettier** | Code formatting      |
| **ts-node**  | TypeScript execution |

---

## 4. Installation & Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- Docker & Docker Compose
- OpenAI API key (with GPT-4o-mini access)
- Git

### Step-by-Step Setup

#### 1. Clone Repository

```bash
cd "d:\Downloads\Saas\Tash8eel\Ai Agents"
cd Operations
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit with your settings
notepad .env
```

**Required settings:**

```env
OPENAI_API_KEY=sk-your-actual-key
ADMIN_API_KEY=your-secure-admin-key
DATABASE_PASSWORD=your-db-password
```

#### 4. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Verify containers are running
docker ps
```

#### 5. Initialize Database

```bash
# Run migrations (creates tables)
npm run db:migrate

# Seed demo data (optional)
npm run db:seed
```

#### 6. Start Application

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

#### 7. Verify Installation

```bash
# Health check
curl http://localhost:3000/health

# Access Swagger documentation
# Open browser: http://localhost:3000/api
```

### Docker Compose Services

```yaml
services:
  app:
    # NestJS application
    ports: ["3000:3000"]
    depends_on: [postgres, redis]

  postgres:
    # PostgreSQL 16
    image: postgres:16-alpine
    ports: ["5432:5432"]
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations/init.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    # Redis 7 for distributed locks
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes
```

---

## 5. Configuration Reference

### Complete Environment Variables

```env
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SERVER
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NODE_ENV=development          # development | production | test
PORT=3000                     # HTTP port
HOST=0.0.0.0                  # Bind address

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DATABASE (PostgreSQL)
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE_URL=postgresql://postgres:password@localhost:5432/operations_agent
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=operations_agent
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres_secret_password
DATABASE_SSL=false            # true for production

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# REDIS (optional - falls back to in-memory locks)
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=               # Optional
REDIS_DB=0

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# OPENAI
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPENAI_API_KEY=sk-...         # Required: Your OpenAI API key
OPENAI_MODEL=gpt-4o-mini      # Model to use
OPENAI_MAX_TOKENS=2048        # Max response tokens
OPENAI_TIMEOUT_MS=30000       # Request timeout (30s)

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TOKEN BUDGET
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFAULT_DAILY_TOKEN_BUDGET=100000  # Default per merchant

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RATE LIMITING
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THROTTLE_TTL=60               # Window in seconds
THROTTLE_LIMIT=100            # Max requests per window

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECURITY
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADMIN_API_KEY=admin-secret    # Required for /v1/admin/* routes

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LOGGING
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOG_LEVEL=info                # trace | debug | info | warn | error
LOG_PRETTY=true               # Human-readable logs (dev only)

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CORS
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORS_ORIGINS=http://localhost:3000,http://localhost:8080

#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# JOBS
#━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FOLLOWUP_CHECK_INTERVAL_MS=300000   # 5 minutes
DAILY_REPORT_CRON=0 9 * * *         # 9 AM daily
OUTBOX_POLL_INTERVAL_MS=5000        # 5 seconds
DLQ_MAX_RETRIES=5                   # Before moving to DLQ
```

### Merchant Configuration Schema

```typescript
interface MerchantConfig {
  id: string; // Unique identifier
  name: string; // Display name (Arabic)
  category: MerchantCategory; // CLOTHES | FOOD | SUPERMARKET | GENERIC

  // Token Budget
  dailyTokenBudget: number; // Max tokens per day (default: 100000)

  // Negotiation Settings
  negotiationRules: {
    maxDiscountPercent: number; // Max allowed discount (default: 10)
    minMarginPercent: number; // Minimum margin to maintain
    allowNegotiation: boolean; // Enable/disable negotiation
    freeDeliveryThreshold?: number; // Order total for free delivery

    // Active Promotion
    activePromotion?: {
      enabled: boolean;
      discountPercent: number;
      description: string; // Arabic description
      validUntil?: string; // ISO date
    };
  };

  // Delivery Settings
  deliveryRules: {
    defaultFee: number; // Default delivery fee (EGP)
    freeDeliveryThreshold?: number;
    deliveryZones?: Array<{
      zone: string;
      fee: number;
      estimatedDays: number;
    }>;
  };

  // Branding
  config: {
    brandName?: string;
    tone: "friendly" | "formal" | "casual";
    currency: string; // EGP, SAR, etc.
    language: string; // ar-EG, ar-SA, etc.
  };
}
```

---

## 6. API Endpoints

### Inbox API

#### POST /v1/inbox/message

Process incoming customer message - **main endpoint**.

**Headers:**

- `Content-Type: application/json`
- `x-correlation-id` (optional): Request tracing ID

**Request Body:**

```json
{
  "merchantId": "demo-merchant",
  "senderId": "wa_201234567890",
  "text": "عايز تيشيرت أبيض مقاس M"
}
```

**Response (200):**

```json
{
  "conversationId": "demo-merchant_wa_201234567890",
  "replyText": "تمام! تيشيرت قطن أبيض مقاس M - 150 جنيه. ممكن اسمك الكريم؟",
  "action": "UPDATE_CART",
  "cart": {
    "items": [
      {
        "name": "تيشيرت قطن أبيض",
        "quantity": 1,
        "unitPrice": 150,
        "variant": { "size": "M" },
        "lineTotal": 150
      }
    ],
    "subtotal": 150,
    "discount": 0,
    "deliveryFee": 30,
    "total": 180
  },
  "orderId": null,
  "orderNumber": null
}
```

**Error Responses:**

- `400`: Invalid request body
- `404`: Merchant not found
- `429`: Token budget exceeded

---

### Merchants API

#### GET /v1/merchants/:id

Get merchant details.

**Response:**

```json
{
  "id": "demo-merchant",
  "name": "متجر تجريبي",
  "category": "CLOTHES",
  "isActive": true,
  "dailyTokenBudget": 100000,
  "negotiationRules": { ... },
  "deliveryRules": { ... }
}
```

#### POST /v1/merchants/:id/config

Update merchant configuration.

**Request Body:**

```json
{
  "name": "اسم جديد",
  "negotiationRules": {
    "maxDiscountPercent": 15,
    "allowNegotiation": true
  }
}
```

---

### Orders API

#### GET /v1/orders?merchantId=xxx

List orders for a merchant.

**Query Parameters:**

- `merchantId` (required): Merchant ID
- `status` (optional): Filter by status
- `limit` (optional): Max results (default: 50)
- `offset` (optional): Pagination offset

**Response:**

```json
{
  "orders": [
    {
      "id": "uuid",
      "orderNumber": "ORD-001",
      "status": "CONFIRMED",
      "items": [...],
      "total": 350,
      "customerName": "أحمد",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 42
}
```

#### GET /v1/orders/:id?merchantId=xxx

Get order details.

---

### Catalog API

#### GET /v1/catalog/:merchantId

Get merchant's product catalog.

**Response:**

```json
{
  "items": [
    {
      "id": "uuid",
      "sku": "tshirt-white",
      "nameAr": "تيشيرت قطن أبيض",
      "basePrice": 150,
      "category": "ملابس رجالي",
      "variants": [
        { "name": "size", "values": ["S", "M", "L", "XL"] },
        { "name": "color", "values": ["أبيض", "أسود"] }
      ],
      "isAvailable": true
    }
  ]
}
```

---

### Admin API

All admin endpoints require `x-admin-api-key` header.

#### GET /v1/admin/metrics

Get system metrics.

**Response:**

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "merchants": { "total": 5, "active": 4 },
  "orders": { "today": 23, "total": 1500 },
  "conversations": { "active": 45 },
  "messages": { "today": 350 },
  "events": { "pending": 0, "failed": 2 },
  "dlq": { "pending": 1 }
}
```

#### POST /v1/admin/seed

Seed demo data.

#### POST /v1/admin/promotion/:merchantId

Toggle active promotion.

**Request Body:**

```json
{
  "enabled": true,
  "discountPercent": 15,
  "description": "خصم 15% لفترة محدودة"
}
```

#### GET /v1/admin/dlq

List DLQ events.

#### POST /v1/admin/replay/:dlqEventId

Replay a failed event.

---

## 7. Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│  merchants  │───────│ conversations│───────│  customers  │
└─────────────┘       └──────────────┘       └─────────────┘
       │                     │                      │
       │                     │                      │
       ▼                     ▼                      │
┌─────────────┐       ┌──────────────┐              │
│catalog_items│       │   messages   │              │
└─────────────┘       └──────────────┘              │
                             │                      │
                             ▼                      │
                      ┌──────────────┐              │
                      │    orders    │◄─────────────┘
                      └──────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │  shipments   │
                      └──────────────┘
```

### Table Definitions

#### merchants

```sql
CREATE TABLE merchants (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category merchant_category NOT NULL DEFAULT 'GENERIC',
  config JSONB NOT NULL DEFAULT '{}',
  branding JSONB NOT NULL DEFAULT '{}',
  negotiation_rules JSONB NOT NULL DEFAULT '{}',
  delivery_rules JSONB NOT NULL DEFAULT '{}',
  daily_token_budget INTEGER NOT NULL DEFAULT 100000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### conversations

```sql
CREATE TABLE conversations (
  id VARCHAR(100) PRIMARY KEY,            -- Format: {merchantId}_{senderId}
  merchant_id VARCHAR(50) NOT NULL,
  customer_id UUID REFERENCES customers(id),
  sender_id VARCHAR(255) NOT NULL,
  state conversation_state NOT NULL DEFAULT 'GREETING',
  context JSONB NOT NULL DEFAULT '{}',
  cart JSONB NOT NULL DEFAULT '{"items": [], "subtotal": 0, "discount": 0, "total": 0}',
  collected_info JSONB NOT NULL DEFAULT '{}',
  missing_slots TEXT[] NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  followup_count INTEGER NOT NULL DEFAULT 0,
  next_followup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### orders

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL,
  conversation_id VARCHAR(100) NOT NULL,
  customer_id UUID,
  order_number VARCHAR(50) NOT NULL,
  status order_status NOT NULL DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  delivery_address JSONB,
  delivery_notes TEXT,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### catalog_items

```sql
CREATE TABLE catalog_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL,
  sku VARCHAR(100),
  name_ar VARCHAR(500) NOT NULL,
  name_en VARCHAR(500),
  description_ar TEXT,
  category VARCHAR(100),
  base_price DECIMAL(10,2) NOT NULL,
  min_price DECIMAL(10,2),
  variants JSONB NOT NULL DEFAULT '[]',    -- [{name: "size", values: ["S","M","L"]}]
  options JSONB NOT NULL DEFAULT '[]',
  tags TEXT[],
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### known_areas

Pre-populated with Egyptian cities/areas:

```sql
INSERT INTO known_areas (city, area_name_ar, area_name_en, area_aliases) VALUES
('القاهرة', 'التجمع الخامس', 'Fifth Settlement', ARRAY['التجمع', '5th settlement']),
('القاهرة', 'مدينة نصر', 'Nasr City', ARRAY['نصر', 'nasr city']),
('القاهرة', 'المعادي', 'Maadi', ARRAY['معادي', 'maadi']),
-- ... more areas for Cairo, Giza, Alexandria
```

---

## 8. LLM Integration

### Model: GPT-4o-mini

- **Cost**: ~$0.15 per 1M input tokens
- **Latency**: 1-2 seconds typical
- **Arabic**: Excellent Egyptian dialect support
- **Structured Outputs**: JSON Schema with `strict: true`

### System Prompt Structure

The LLM receives a comprehensive system prompt:

```
1. Merchant identity and tone
2. Active promotion (if enabled)
3. Discount rules (when to offer, max %)
4. Product catalog with variants
5. Delivery rules and fees
6. Required slots before order confirmation
7. Name greeting rules
8. Arabic response guidelines
```

### Response Schema

```typescript
interface LlmResponse {
  reply_ar: string; // Arabic reply to customer
  actionType: ActionType; // What action to take
  confidence: number; // 0-1 confidence score

  extracted_entities: {
    products?: Array<{
      name: string;
      quantity: number;
      size?: string;
      color?: string;
    }>;
    customerName?: string;
    phone?: string;
    address?: {
      raw_text: string;
      city?: string;
      area?: string;
      street?: string;
      building?: string;
    };
  };

  negotiation?: {
    isNegotiating: boolean;
    requestedDiscount?: number;
    counterOffer?: number;
  };

  missing_slots?: string[]; // What info is still needed
  delivery_fee?: number;
}
```

### Action Types

| Action                    | Description                 |
| ------------------------- | --------------------------- |
| `GREET`                   | Initial greeting            |
| `UPDATE_CART`             | Add/modify cart items       |
| `ASK_CLARIFYING_QUESTION` | Need more info              |
| `COUNTER_OFFER`           | Negotiation response        |
| `ACCEPT_NEGOTIATION`      | Accept discount request     |
| `REJECT_NEGOTIATION`      | Decline discount (at max)   |
| `CONFIRM_ORDER`           | All info collected, confirm |
| `CREATE_ORDER`            | Finalize order              |
| `TRACK_ORDER`             | Provide tracking info       |
| `ESCALATE`                | Human intervention needed   |

### Token Budget Enforcement

```typescript
// Before each LLM call
const budget = await checkTokenBudget(merchantId);
if (!budget.hasRemaining) {
  // Return fallback response without LLM
  return createFallbackResponse();
}

// After successful LLM call
await incrementTokenUsage(merchantId, tokensUsed);
```

---

## 9. Business Logic

### Negotiation Policy

```typescript
// Category-specific max discounts
const MAX_DISCOUNTS = {
  CLOTHES: 15, // Fashion has room for negotiation
  FOOD: 5, // Low margin
  SUPERMARKET: 3, // Fixed pricing
  GENERIC: 10, // Default
};

// Negotiation triggers (customer says):
// "غالي", "كتير", "عايز خصم", "ممكن خصم"

// Active promotion behavior:
// - If activePromotion.enabled: Proactively mention offer
// - If NOT enabled: Only offer discount when customer asks
```

### Slot Filling Requirements

Before order confirmation, must have:

1. ✅ Customer name
2. ✅ Phone number (auto-detected from WhatsApp senderId)
3. ✅ Complete address (area, street, building, apartment)
4. ✅ At least one item in cart with variants (if applicable)

### Address Validation

```typescript
// Required address components
interface CompleteAddress {
  area: string; // المنطقة (e.g., "المعادي")
  street: string; // الشارع
  building: string; // رقم العمارة
  apartment?: string; // رقم الشقة
  landmark?: string; // علامة مميزة
}

// Validation against known_areas table
const isValidArea = await knownAreaRepo.findByName(area, city);
```

### Cart Operations

```typescript
// Cart structure
interface Cart {
  items: CartItem[];
  subtotal: number; // Sum of line totals
  discount: number; // Applied discount amount
  discountPercent?: number;
  deliveryFee: number;
  total: number; // subtotal - discount + deliveryFee
}

// Cart update rules:
// 1. If item exists with same variant: Update quantity
// 2. If item exists with different variant: Add as new line
// 3. New item: Add to cart
```

---

## 10. Event System

### Outbox Pattern

Events are persisted before processing for at-least-once delivery:

```sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  merchant_id VARCHAR(50),
  payload JSONB NOT NULL,
  correlation_id VARCHAR(100),
  status event_status NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Event Processing Flow

```
1. Service publishes event:
   await outboxService.publishEvent({
     eventType: 'order.created',
     aggregateType: 'order',
     aggregateId: orderId,
     payload: { ... }
   });

2. OutboxWorker polls every 5 seconds:
   - Acquires distributed lock (Redis)
   - SELECT ... FOR UPDATE SKIP LOCKED
   - Routes to appropriate handler
   - Marks as COMPLETED or increments retry

3. After 5 failures → Move to DLQ
```

### Event Types

| Event                | Trigger            | Handler Action        |
| -------------------- | ------------------ | --------------------- |
| `message.received`   | Customer message   | Analytics, logging    |
| `message.sent`       | Bot reply          | Delivery confirmation |
| `order.created`      | Order confirmed    | Notify merchant       |
| `order.confirmed`    | Status update      | Customer notification |
| `shipment.booked`    | Delivery scheduled | Update tracking       |
| `followup.scheduled` | Cart abandoned     | Schedule reminder     |

### Dead Letter Queue

Failed events can be:

1. **Inspected**: `GET /v1/admin/dlq`
2. **Replayed**: `POST /v1/admin/replay/:id`
3. **Bulk replayed**: `npm run dlq:replay`

---

## 11. Testing

### Test Structure

```
test/
├── jest.setup.ts              # Global setup (loads .env)
├── e2e/
│   └── order-flows.spec.ts    # End-to-end tests
└── unit/                      # Unit tests (TODO)
```

### Running Tests

```bash
# All tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# E2E tests only
npm run test:e2e
```

### E2E Test Scenarios

The `order-flows.spec.ts` covers:

1. **Happy Path**
   - Complete order flow from greeting to confirmation
   - Name extraction and personalization
   - Cart building with variants

2. **Negotiation**
   - Customer asks for discount
   - Counter-offer scenarios
   - Max discount enforcement

3. **Edge Cases**
   - Empty message handling
   - Unknown product requests
   - Incomplete address

4. **Security**
   - SQL injection prevention
   - XSS in message text

5. **Cart Operations**
   - Add items
   - Update quantities
   - Clear cart

### Test Environment Setup

```typescript
// test/jest.setup.ts
import * as dotenv from "dotenv";
dotenv.config(); // Load .env BEFORE setting defaults

// Set test defaults (only if not in .env)
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-test-key";
process.env.DATABASE_NAME =
  process.env.DATABASE_NAME || "operations_agent_test";
```

---

## 12. Deployment

### Production Checklist

#### Environment

- [ ] `NODE_ENV=production`
- [ ] Strong `ADMIN_API_KEY`
- [ ] Real `OPENAI_API_KEY`
- [ ] Restrictive `CORS_ORIGINS`

#### Database

- [ ] `DATABASE_SSL=true`
- [ ] Connection pooling configured
- [ ] Regular backups scheduled
- [ ] Migrations applied

#### Monitoring

- [ ] Health endpoint: `/health`
- [ ] Ready endpoint: `/ready`
- [ ] Log aggregation (Pino JSON)
- [ ] Token usage alerts

### Docker Production Build

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main"]
```

### Kubernetes Health Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Scaling Considerations

- **Horizontal scaling**: Stateless API servers behind load balancer
- **Redis required**: For distributed locks when running multiple instances
- **Database pooling**: Use PgBouncer or similar for connection management
- **Background jobs**: Use lock-based coordination (already implemented)

---

## 13. Project Structure

```
Operations/
├── src/
│   ├── api/                        # 🌐 HTTP API Layer
│   │   ├── controllers/
│   │   │   ├── inbox.controller.ts      # POST /v1/inbox/message
│   │   │   ├── merchants.controller.ts  # Merchant CRUD
│   │   │   ├── orders.controller.ts     # Order queries
│   │   │   ├── catalog.controller.ts    # Product catalog
│   │   │   ├── conversations.controller.ts
│   │   │   └── admin.controller.ts      # Admin operations
│   │   ├── dto/                    # Request/Response DTOs
│   │   └── api.module.ts
│   │
│   ├── application/                # 💼 Business Logic
│   │   ├── services/
│   │   │   └── inbox.service.ts         # Main orchestration
│   │   ├── llm/
│   │   │   ├── llm.service.ts           # OpenAI integration
│   │   │   └── llm-schema.ts            # Response schemas
│   │   ├── events/
│   │   │   └── outbox.service.ts        # Event publishing
│   │   ├── dlq/
│   │   │   └── dlq.service.ts           # Dead letter queue
│   │   ├── jobs/
│   │   │   └── followup.scheduler.ts    # Scheduled jobs
│   │   ├── policies/               # Business rules
│   │   └── adapters/               # External integrations
│   │
│   ├── domain/                     # 🏛️ Domain Layer
│   │   ├── entities/
│   │   │   ├── merchant.entity.ts
│   │   │   ├── conversation.entity.ts
│   │   │   ├── order.entity.ts
│   │   │   ├── customer.entity.ts
│   │   │   ├── message.entity.ts
│   │   │   ├── catalog.entity.ts
│   │   │   └── shipment.entity.ts
│   │   ├── ports/                  # Repository interfaces
│   │   │   ├── merchant.repository.ts
│   │   │   ├── conversation.repository.ts
│   │   │   ├── order.repository.ts
│   │   │   └── ... (all repository interfaces)
│   │   └── index.ts
│   │
│   ├── infrastructure/             # 🔧 Infrastructure
│   │   ├── database/
│   │   │   └── database.module.ts       # PostgreSQL setup
│   │   ├── redis/
│   │   │   └── redis.service.ts         # Redis client
│   │   └── repositories/           # Repository implementations
│   │       ├── merchant.repository.ts
│   │       ├── conversation.repository.ts
│   │       └── ... (all implementations)
│   │
│   ├── shared/                     # 🔄 Shared Utilities
│   │   ├── schemas/
│   │   │   └── index.ts                 # Zod schemas
│   │   ├── constants/
│   │   │   ├── enums.ts                 # ActionType, OrderStatus, etc.
│   │   │   └── templates.ts             # Arabic templates
│   │   ├── guards/
│   │   │   └── admin-api-key.guard.ts
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts
│   │   ├── middleware/
│   │   │   └── correlation-id.middleware.ts
│   │   ├── logging/
│   │   │   └── logger.ts                # Pino logger
│   │   ├── utils/
│   │   │   └── helpers.ts               # Utility functions
│   │   └── shared.module.ts
│   │
│   ├── cli/                        # 🖥️ CLI Tools
│   │   ├── run-migrations.ts
│   │   ├── seed.ts
│   │   └── dlq-replay.ts
│   │
│   ├── app.module.ts               # Root module
│   └── main.ts                     # Application entry
│
├── migrations/
│   └── init.sql                    # Database schema
│
├── test/
│   ├── jest.setup.ts
│   └── e2e/
│       └── order-flows.spec.ts
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── LLM.md
│   ├── SECURITY.md
│   ├── OBSERVABILITY.md
│   └── TEST_PLAN.md
│
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 14. Troubleshooting

### Common Issues

#### OpenAI API Errors

**401 Unauthorized**

```
Error: Invalid API key
```

**Solution**: Check `OPENAI_API_KEY` in `.env`

**429 Rate Limited**

```
Error: Rate limit exceeded
```

**Solution**: Implement backoff, check token budget

**Timeout**

```
Error: Request timed out after 30000ms
```

**Solution**: Increase `OPENAI_TIMEOUT_MS`, check network

#### Database Connection

**ECONNREFUSED**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**: Ensure PostgreSQL is running

```bash
docker-compose up -d postgres
```

**Authentication Failed**

```
Error: password authentication failed
```

**Solution**: Check `DATABASE_PASSWORD` matches docker-compose

#### Redis Connection

**ECONNREFUSED (Redis)**

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution**: Redis is optional - app falls back to in-memory locks

#### Tests Failing

**Tests not found**

```
No tests found
```

**Solution**: Ensure test files match pattern `*.spec.ts`

**OpenAI timeout in tests**
**Solution**: Use real API key in `.env` or mock LlmService

### Debug Commands

```bash
# Check Docker containers
docker ps

# View PostgreSQL logs
docker logs postgres-ops

# Connect to database
docker exec -it postgres-ops psql -U postgres -d operations_agent

# Check application logs
npm run start:dev 2>&1 | pino-pretty

# Reset database
docker-compose down -v
docker-compose up -d postgres redis
npm run db:migrate
npm run db:seed
```

### Log Analysis

```bash
# Filter by level
cat logs.json | jq 'select(.level >= 40)'  # warn and above

# Filter by correlation ID
cat logs.json | jq 'select(.correlationId == "abc-123")'

# Filter by merchant
cat logs.json | jq 'select(.merchantId == "demo-merchant")'
```

---

## Additional Resources

- [Architecture Details](docs/ARCHITECTURE.md)
- [LLM Integration](docs/LLM.md)
- [Security](docs/SECURITY.md)
- [Observability](docs/OBSERVABILITY.md)
- [Test Plan](docs/TEST_PLAN.md)

---

_Last updated: January 2025_
