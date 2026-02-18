# Operations Agent - Architecture

## Overview

The Operations Agent is a multi-tenant conversational commerce platform designed for Egyptian SMBs. It processes customer messages in Arabic, extracts orders, handles negotiation, and manages the complete order lifecycle.

## Architecture Pattern

We follow **Hexagonal Architecture** (Ports and Adapters), also known as Clean Architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  (Controllers, DTOs, Validation)                                │
├─────────────────────────────────────────────────────────────────┤
│                      Application Layer                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Inbox Service│ │   Policies   │ │  LLM Service │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │Events/Outbox │ │     Jobs     │ │     DLQ      │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                       Domain Layer                               │
│  ┌──────────────┐ ┌──────────────┐                              │
│  │   Entities   │ │    Ports     │                              │
│  │              │ │ (Interfaces) │                              │
│  └──────────────┘ └──────────────┘                              │
├─────────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ PostgreSQL   │ │    Redis     │ │   Adapters   │            │
│  │ Repositories │ │   Service    │ │ (Delivery)   │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## Folder Structure

```
src/
├── api/                    # HTTP API Layer
│   ├── controllers/        # REST controllers
│   └── dto/                # Data Transfer Objects
│
├── application/            # Application/Use Case Layer
│   ├── adapters/          # External service adapters
│   ├── dlq/               # Dead Letter Queue handling
│   ├── events/            # Event system (Outbox pattern)
│   ├── jobs/              # Scheduled jobs
│   ├── llm/               # OpenAI integration
│   ├── policies/          # Business policies (Strategy pattern)
│   └── services/          # Core business services
│
├── domain/                 # Domain Layer (Pure business logic)
│   ├── entities/          # Domain entities
│   └── ports/             # Repository interfaces
│
├── infrastructure/         # Infrastructure Layer
│   ├── database/          # PostgreSQL connection
│   ├── redis/             # Redis for locks/cache
│   └── repositories/      # Repository implementations
│
├── shared/                 # Shared utilities
│   ├── constants/         # Enums, templates
│   ├── filters/           # Exception filters
│   ├── guards/            # Auth guards
│   ├── logging/           # Pino logger
│   ├── middleware/        # HTTP middleware
│   └── schemas/           # Zod validation schemas
│
└── cli/                    # CLI tools
```

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

### 3. Event-Driven Architecture

- **Outbox Pattern**: Events persisted in DB before processing
- **At-least-once delivery**: Idempotent event handlers
- **DLQ**: Failed events moved to Dead Letter Queue after 5 retries
- **CLI tools**: Manual replay capability

### 4. Policy Pattern

- **Negotiation**: Category-specific (Clothes: 15%, Food: 0%, etc.)
- **Slot Filling**: Different required fields per category
- **Address Validation**: City-specific area databases

## Data Flow

### Message Processing

```
1. Customer sends message via WhatsApp
         ↓
2. Webhook POSTs to /v1/inbox/message
         ↓
3. InboxService orchestrates:
   a. Load merchant config
   b. Get/create conversation
   c. Get/create customer
   d. Store incoming message
   e. Publish MessageReceived event
   f. Build LLM context
   g. Call OpenAI with structured output
   h. Apply policies (negotiation, slot-filling)
   i. Update cart if needed
   j. Create order if confirmed
   k. Store bot reply
   l. Update conversation state
         ↓
4. Return reply to webhook caller
         ↓
5. Caller sends reply to customer
```

### Event Processing

```
1. Service publishes event to outbox table
         ↓
2. OutboxWorker polls every 5 seconds
         ↓
3. Worker acquires distributed lock (Redis)
         ↓
4. Fetches pending events with row-level lock
         ↓
5. Routes to appropriate handler
         ↓
6. Handler processes event
         ↓
7. Success: Mark as processed
   Failure: Increment retry, maybe move to DLQ
```

## Database Schema

### Core Tables

- `merchants` - Tenant configuration
- `conversations` - Chat sessions
- `messages` - Message history
- `orders` - Created orders
- `shipments` - Delivery tracking
- `customers` - Customer profiles
- `catalog_items` - Product catalog

### Event Tables

- `outbox_events` - Pending/processed events
- `dlq_events` - Failed events for replay

### Reference Data

- `known_areas` - Valid delivery areas by city

## Scaling Considerations

### Horizontal Scaling

- Stateless API servers behind load balancer
- Redis for distributed locks
- Database connection pooling
- Background jobs with lock-based coordination

### Performance

- Batch event processing (50 at a time)
- Index on `merchant_id` for all tables
- Prepared statements for frequent queries
- Pino for high-performance logging

### Reliability

- Outbox pattern for event delivery
- DLQ for failed event recovery
- Graceful shutdown handlers
- Health/ready endpoints for k8s

## Technology Choices

| Component   | Choice      | Rationale                     |
| ----------- | ----------- | ----------------------------- |
| Framework   | NestJS      | Modular, TypeScript-first     |
| Database    | PostgreSQL  | JSONB, full-text search       |
| Cache/Locks | Redis       | Distributed locks via Redlock |
| LLM         | GPT-4o-mini | Cost-effective, good Arabic   |
| Validation  | Zod         | Runtime type safety           |
| Logging     | Pino        | High performance              |
| Testing     | Jest        | Standard for Node.js          |
