# Operations API

NestJS REST API service for the Tash8eel conversational commerce platform.

## 🚀 Features

- Full merchant onboarding with API key generation
- Catalog management (CRUD + search + candidate retrieval)
- Conversation management with human takeover
- Followup scheduling and execution
- Order lifecycle management
- Address depth validation with Google Maps URL parsing
- Voice note transcription support
- Memory compression for long conversations
- Category-specific strategies (CLOTHES, FOOD, SUPERMARKET, GENERIC)

## 📁 Project Structure

```
apps/api/
├── src/
│   ├── api/                    # REST controllers & DTOs
│   │   ├── controllers/
│   │   │   ├── admin.controller.ts
│   │   │   ├── catalog.controller.ts
│   │   │   ├── conversations.controller.ts
│   │   │   ├── followups.controller.ts
│   │   │   ├── inbox.controller.ts
│   │   │   ├── merchants.controller.ts
│   │   │   └── orders.controller.ts
│   │   └── dto/
│   ├── application/            # Business logic
│   │   ├── adapters/           # External service adapters
│   │   ├── dlq/                # Dead Letter Queue
│   │   ├── events/             # Event handlers & outbox
│   │   ├── jobs/               # Scheduled jobs
│   │   ├── llm/                # OpenAI integration
│   │   ├── policies/           # Business rules engines
│   │   └── services/           # Core services
│   ├── categories/             # Category-specific strategies
│   │   ├── clothes/
│   │   ├── food/
│   │   ├── supermarket/
│   │   └── generic/
│   ├── domain/                 # Entities & port interfaces
│   ├── infrastructure/         # Database & Redis
│   └── shared/                 # Cross-cutting concerns
├── migrations/                 # SQL migration files
├── test/                       # Unit & E2E tests
├── postman/                    # Postman collection
└── docs/                       # Documentation
```

## 📊 API Endpoints

### Health

| Method | Endpoint  | Description  |
| ------ | --------- | ------------ |
| GET    | `/health` | Health check |

### Merchants

| Method | Endpoint                                    | Description            |
| ------ | ------------------------------------------- | ---------------------- |
| POST   | `/v1/merchants`                             | Onboard new merchant   |
| GET    | `/v1/merchants/:id`                         | Get merchant details   |
| GET    | `/v1/merchants/:id/usage`                   | Get token usage stats  |
| GET    | `/v1/merchants/:id/reports/daily`           | Get daily reports      |
| GET    | `/v1/merchants/:id/notifications`           | Get notifications      |
| PUT    | `/v1/merchants/:id/notifications/:nid/read` | Mark notification read |
| POST   | `/v1/merchants/:id/regenerate-api-key`      | Regenerate API key     |

### Catalog

| Method | Endpoint                                | Description                     |
| ------ | --------------------------------------- | ------------------------------- |
| GET    | `/v1/catalog/:merchantId/items`         | List items (paginated)          |
| GET    | `/v1/catalog/:merchantId/items/:itemId` | Get item details                |
| POST   | `/v1/catalog/:merchantId/items`         | Create item                     |
| PUT    | `/v1/catalog/:merchantId/items/:itemId` | Update item                     |
| DELETE | `/v1/catalog/:merchantId/items/:itemId` | Delete item                     |
| POST   | `/v1/catalog/:merchantId/search`        | Search with candidate retrieval |
| POST   | `/v1/catalog/upsert`                    | Bulk upsert items               |

### Conversations

| Method | Endpoint                             | Description              |
| ------ | ------------------------------------ | ------------------------ |
| GET    | `/v1/conversations`                  | List conversations       |
| GET    | `/v1/conversations/:id`              | Get with messages        |
| POST   | `/v1/conversations/:id/takeover`     | Human takeover           |
| POST   | `/v1/conversations/:id/release`      | Release to AI            |
| POST   | `/v1/conversations/:id/send-message` | Send manual message      |
| POST   | `/v1/conversations/:id/lock`         | Acquire distributed lock |
| POST   | `/v1/conversations/:id/unlock`       | Release distributed lock |

### Followups

| Method | Endpoint                              | Description          |
| ------ | ------------------------------------- | -------------------- |
| GET    | `/v1/merchants/:merchantId/followups` | List followups       |
| GET    | `/v1/followups/:id`                   | Get followup details |
| POST   | `/v1/followups`                       | Create followup      |
| POST   | `/v1/followups/:id/cancel`            | Cancel followup      |
| POST   | `/v1/followups/:id/send-now`          | Execute immediately  |

### Inbox

| Method | Endpoint            | Description          |
| ------ | ------------------- | -------------------- |
| POST   | `/v1/inbox/webhook` | WhatsApp webhook     |
| GET    | `/v1/inbox/webhook` | Webhook verification |

### Orders

| Method | Endpoint                | Description       |
| ------ | ----------------------- | ----------------- |
| GET    | `/v1/orders`            | List orders       |
| GET    | `/v1/orders/:id`        | Get order details |
| PUT    | `/v1/orders/:id/status` | Update status     |

### Admin

| Method | Endpoint                   | Description        |
| ------ | -------------------------- | ------------------ |
| GET    | `/v1/admin/merchants`      | List all merchants |
| GET    | `/v1/admin/dlq`            | List DLQ items     |
| POST   | `/v1/admin/dlq/:id/replay` | Replay DLQ item    |
| GET    | `/v1/admin/metrics`        | System metrics     |

## 🔧 Key Services

### AddressDepthService

Validates address completeness based on merchant category requirements.

```typescript
// Analyze address depth
const depth = addressDepthService.analyzeDepth(address, city);
// Returns: { level: 'building', score: 80, missingFields: [], suggestions: [] }

// Parse Google Maps URL
const coords = addressDepthService.parseGoogleMapsUrl(url);
// Returns: { lat: 30.0444, lng: 31.2357 }

// Check if address meets category requirements
const result = addressDepthService.meetsRequiredDepth(address, "FOOD");
// Returns: { meets: false, currentLevel: 'area', requiredLevel: 'building', missingForRequired: ['street', 'building'] }
```

### MemoryCompressionService

Manages conversation context by compressing old messages into summaries.

```typescript
// Get compressed memory for conversation
const memory =
  await memoryCompressionService.getConversationMemory(conversationId);
// Returns: { summary: '...', recentMessages: [...], totalMessages: 50, estimatedTokens: 2000 }

// Compress if needed
const result =
  await memoryCompressionService.compressConversation(conversationId);
// Returns: { originalTokens: 8000, compressedTokens: 2500, compressionRatio: 3.2, ... }
```

### CandidateRetrievalService

Searches catalog before LLM to ground responses in real items.

```typescript
// Retrieve candidates for a query
const result = await candidateRetrievalService.retrieveCandidates({
  merchantId: "merchant-001",
  query: "قميص أزرق مقاس M",
  limit: 10,
});
// Returns: { candidates: [...], totalSearched: 150, searchTerms: ['قميص', 'أزرق', 'M'], cached: false }
```

### TranscriptionAdapter

Processes voice notes from WhatsApp.

```typescript
// Transcribe audio
const result = await transcriptionAdapter.transcribe(audioBuffer, {
  language: "ar",
});
// Returns: { text: 'مرحبا عايز أطلب', confidence: 0.92, duration: 3.5, language: 'ar' }
```

## 📊 Category Strategies

Each merchant category has specific behaviors:

| Category    | Discount Limit | Required Address | Special Features        |
| ----------- | -------------- | ---------------- | ----------------------- |
| CLOTHES     | 10%            | Area             | Size variants, colors   |
| FOOD        | 5%             | Building         | Time slots, temperature |
| SUPERMARKET | 3%             | Building         | Substitutions, bulk     |
| GENERIC     | 7%             | Street           | Standard processing     |

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run e2e tests
npm run test:e2e

# Run with coverage
npm run test:cov

# Run specific test
npm test -- --testPathPattern=address-depth
```

## 🚀 Running

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod

# With Docker
docker-compose up api
```

## 📝 Environment Variables

| Variable                | Description           | Default     |
| ----------------------- | --------------------- | ----------- |
| `PORT`                  | API server port       | 3000        |
| `DATABASE_URL`          | PostgreSQL connection | -           |
| `REDIS_HOST`            | Redis hostname        | localhost   |
| `REDIS_PORT`            | Redis port            | 6379        |
| `REDIS_ENABLED`         | Enable Redis          | true        |
| `OPENAI_API_KEY`        | OpenAI API key        | -           |
| `OPENAI_MODEL`          | Model name            | gpt-4o-mini |
| `MAX_CONTEXT_TOKENS`    | Max LLM context       | 8000        |
| `COMPRESSION_THRESHOLD` | Compression trigger   | 6000        |
| `TRANSCRIPTION_MOCK`    | Mock transcription    | true        |

## 📚 Postman Collection

Import `postman/Operations_Agent.postman_collection.json` for complete API testing.

## 📄 License

Proprietary - All rights reserved.
