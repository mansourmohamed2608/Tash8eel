# @tash8eel/worker

Background job processor for the Tash8eel Operations Platform.

## Overview

The Worker service handles asynchronous task processing for:

- **Outbox Event Processing**: Reliable event-driven communication
- **AI Agent Orchestration**: Multi-agent task coordination
- **Scheduled Jobs**: Daily reports, followups, delivery polling

## Architecture

```
src/
├── agents/           # AI agents (OPS, Inventory, Finance, etc.)
├── infrastructure/   # Database, Redis connections
├── jobs/             # Scheduled cron jobs
├── orchestrator/     # Task queue and agent coordination
├── outbox/           # Event outbox pattern implementation
├── main.ts           # Application entry point
└── worker.module.ts  # Root NestJS module
```

## AI Agents

| Agent              | Purpose                                               |
| ------------------ | ----------------------------------------------------- |
| **OpsAgent**       | Order processing, customer messages, delivery booking |
| **InventoryAgent** | Stock tracking, availability updates                  |
| **FinanceAgent**   | Payment processing, invoicing                         |
| **MarketingAgent** | Campaign automation, promotions                       |
| **ContentAgent**   | Response generation, templating                       |
| **SupportAgent**   | Escalation handling, human handoff                    |

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tash8eel

# Redis
REDIS_URL=redis://localhost:6379

# OpenAI
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-4o-mini
AI_STRICT_MODE=false

# Worker Configuration
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_BATCH_SIZE=10
ORCHESTRATOR_CONCURRENCY=5

# Logging
LOG_LEVEL=info
```

## Development

```bash
# Install dependencies (from monorepo root)
npm install

# Run in development mode
npm run dev:worker

# Run tests
npm run test:worker
```

## Scripts

```bash
npm run start:dev    # Development with hot reload
npm run start:prod   # Production mode
npm run build        # Compile TypeScript
npm run test         # Run unit tests
```

## Docker

```bash
# Build image
docker build -f apps/worker/Dockerfile -t tash8eel-worker .

# Run container
docker run -d --name worker \
  -e DATABASE_URL=... \
  -e REDIS_URL=... \
  -e OPENAI_API_KEY=... \
  tash8eel-worker
```

## Health & Monitoring

The worker doesn't expose HTTP endpoints but logs its health status:

- Polls outbox events every `OUTBOX_POLL_INTERVAL_MS`
- Logs processing statistics to stdout
- Reports errors to structured logging pipeline

## Graceful Shutdown

The worker handles `SIGTERM` and `SIGINT` signals:

1. Stops accepting new tasks
2. Waits for in-progress tasks to complete (30s timeout)
3. Closes database and Redis connections
4. Exits cleanly
