# Tash8eel Agents Architecture

> Multi-Agent Orchestration System for WhatsApp Commerce

## Overview

Tash8eel uses a **subscription-based multi-agent architecture** where merchants can enable/disable specific agents based on their plan. Each agent handles a specific domain of tasks, communicating via a task queue with the orchestrator.

---

## Agent Folder Structure

```
apps/worker/src/agents/
├── agents.module.ts          # NestJS module registering all agents
├── index.ts                  # Barrel exports
│
├── ops/                      # Operations Agent (core)
│   ├── ops.agent.ts          # Main agent class implementing IAgent
│   ├── ops.handlers.ts       # Task handlers (business logic)
│   ├── ops.tasks.ts          # Task type definitions
│   ├── index.ts              # Folder exports
│   └── tests/
│       └── ops.agent.spec.ts
│
├── inventory/                # Inventory Agent
│   ├── inventory.agent.ts
│   ├── inventory.handlers.ts
│   ├── inventory.tasks.ts
│   ├── inventory.policies.ts # Domain policies (low-stock, reservations)
│   ├── index.ts
│   └── tests/
│       ├── inventory.agent.spec.ts
│       └── inventory.policies.spec.ts
│
├── finance/                  # Finance Agent
│   ├── finance.agent.ts
│   ├── finance.handlers.ts
│   ├── finance.tasks.ts
│   ├── index.ts
│   └── tests/
│       └── finance.agent.spec.ts
│
├── marketing/                # Marketing Agent
│   ├── marketing.agent.ts
│   ├── marketing.handlers.ts
│   ├── marketing.tasks.ts
│   ├── index.ts
│   └── tests/
│       └── marketing.agent.spec.ts
│
├── content/                  # Content Agent
│   ├── content.agent.ts
│   ├── content.handlers.ts
│   ├── content.tasks.ts
│   ├── index.ts
│   └── tests/
│       └── content.agent.spec.ts
│
└── support/                  # Support Agent
    ├── support.agent.ts
    ├── support.handlers.ts
    ├── support.tasks.ts
    ├── index.ts
    └── tests/
        └── support.agent.spec.ts
```

---

## Agent Interface

All agents implement the `IAgent` interface from `@tash8eel/agent-sdk`:

```typescript
interface IAgent {
  readonly agentType: AgentType;
  canHandle(taskType: string): boolean;
  execute(task: AgentTask): Promise<AgentResult>;
}
```

### Example Agent Implementation

```typescript
@Injectable()
export class MyAgent implements IAgent {
  readonly agentType = AgentType.MY_AGENT;

  canHandle(taskType: string): boolean {
    return Object.values(MY_AGENT_TASK_TYPES).includes(taskType as any);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    try {
      switch (task.taskType) {
        case MY_AGENT_TASK_TYPES.DO_SOMETHING:
          return await this.handleDoSomething(task.input);
        default:
          return this.createError(task, `Unknown task type: ${task.taskType}`);
      }
    } catch (error) {
      return this.createError(task, error.message);
    }
  }

  private createSuccess(task: AgentTask, output: any): AgentResult {
    return {
      taskId: task.id,
      agentType: this.agentType,
      success: true,
      output,
      completedAt: new Date(),
    };
  }

  private createError(task: AgentTask, error: string): AgentResult {
    return {
      taskId: task.id,
      agentType: this.agentType,
      success: false,
      error,
      completedAt: new Date(),
    };
  }
}
```

---

## Subscription System

### How It Works

The orchestrator checks merchant subscriptions before routing tasks:

```typescript
// In orchestrator.service.ts
async routeTask(task: AgentTask): Promise<AgentResult> {
  // Check if agent is enabled for this merchant
  if (!await this.isAgentEnabledForMerchant(task.merchantId, task.agentType)) {
    return {
      taskId: task.id,
      agentType: task.agentType,
      success: false,
      error: 'Agent not enabled for this merchant subscription',
      completedAt: new Date(),
    };
  }

  // Find and execute agent
  const agent = this.agents.find(a => a.canHandle(task.taskType));
  if (!agent) {
    throw new Error(`No agent found for task type: ${task.taskType}`);
  }

  return agent.execute(task);
}
```

### Subscription Tiers

| Tier       | Price (EGP/mo) | Agents Included                            |
| ---------- | -------------- | ------------------------------------------ |
| Starter    | 299            | OPS                                        |
| Growth     | 599            | OPS, INVENTORY                             |
| Pro        | 1,199          | OPS, INVENTORY, FINANCE, MARKETING         |
| Enterprise | Custom         | ALL (OPS, INV, FIN, MKT, CONTENT, SUPPORT) |

### Database Schema

```sql
CREATE TABLE merchant_subscriptions (
  id UUID PRIMARY KEY,
  merchant_id UUID REFERENCES merchants(id),
  tier VARCHAR(50) NOT NULL,
  enabled_agents TEXT[] NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Example: Growth tier merchant
INSERT INTO merchant_subscriptions (merchant_id, tier, enabled_agents)
VALUES ('merchant-uuid', 'GROWTH', ARRAY['OPS_AGENT', 'INVENTORY_AGENT']);
```

---

## Task Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  WhatsApp    │────▶│  API Gateway    │────▶│  Task Queue      │
│  Message     │     │  (creates task) │     │  (Redis/BullMQ)  │
└──────────────┘     └─────────────────┘     └────────┬─────────┘
                                                      │
                                                      ▼
                                             ┌──────────────────┐
                                             │  Orchestrator    │
                                             │  (routes task)   │
                                             └────────┬─────────┘
                                                      │
        ┌─────────────┬─────────────┬────────────────┼────────────────┐
        ▼             ▼             ▼                ▼                ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │   OPS    │  │INVENTORY │  │ FINANCE  │    │MARKETING │    │ SUPPORT  │
  │  AGENT   │  │  AGENT   │  │  AGENT   │    │  AGENT   │    │  AGENT   │
  └────┬─────┘  └────┬─────┘  └────┬─────┘    └────┬─────┘    └────┬─────┘
       │             │             │               │               │
       └─────────────┴─────────────┴───────────────┴───────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  AgentResult     │
                          │  (to outbox)     │
                          └──────────────────┘
```

---

## Event System

Agents emit events through the outbox pattern:

```typescript
// After completing a task
await this.outboxService.publish({
  eventType: "ORDER_CREATED",
  aggregateId: order.id,
  payload: { orderId: order.id, merchantId, customerId },
});
```

### Event → Task Mapping

| Event                | Triggered Tasks                   |
| -------------------- | --------------------------------- |
| `ORDER_CREATED`      | RESERVE_STOCK, GENERATE_INVOICE   |
| `ORDER_CONFIRMED`    | DEDUCT_STOCK, SEND_CONFIRMATION   |
| `ORDER_CANCELLED`    | RELEASE_STOCK, REFUND_PAYMENT     |
| `LOW_STOCK_DETECTED` | RESTOCK_RECOMMENDATION            |
| `CUSTOMER_COMPLAINT` | CREATE_TICKET, ESCALATE_IF_URGENT |

---

## How to Add a New Agent

### Step 1: Create Folder Structure

```bash
mkdir -p apps/worker/src/agents/my-agent/tests
```

### Step 2: Define Task Types

```typescript
// my-agent/my-agent.tasks.ts
export const MY_AGENT_TASK_TYPES = {
  DO_SOMETHING: "MY_AGENT:DO_SOMETHING",
  ANOTHER_TASK: "MY_AGENT:ANOTHER_TASK",
} as const;

export type MyAgentTaskType =
  (typeof MY_AGENT_TASK_TYPES)[keyof typeof MY_AGENT_TASK_TYPES];
```

### Step 3: Create Handlers

```typescript
// my-agent/my-agent.handlers.ts
@Injectable()
export class MyAgentHandlers {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async handleDoSomething(input: DoSomethingInput): Promise<DoSomethingResult> {
    // Business logic here
  }
}
```

### Step 4: Create Agent

```typescript
// my-agent/my-agent.agent.ts
@Injectable()
export class MyAgent implements IAgent {
  readonly agentType = AgentType.MY_AGENT;

  constructor(private readonly handlers: MyAgentHandlers) {}

  canHandle(taskType: string): boolean {
    return Object.values(MY_AGENT_TASK_TYPES).includes(taskType as any);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    // Route to handlers
  }
}
```

### Step 5: Create Index

```typescript
// my-agent/index.ts
export * from "./my-agent.agent";
export * from "./my-agent.handlers";
export * from "./my-agent.tasks";
```

### Step 6: Register in Module

```typescript
// agents.module.ts
import { MyAgent, MyAgentHandlers } from "./my-agent";

@Module({
  providers: [
    // ... existing agents
    MyAgent,
    MyAgentHandlers,
  ],
  exports: [
    // ... existing exports
    MyAgent,
  ],
})
export class AgentsModule {}
```

### Step 7: Add to SDK (if needed)

Update `@tash8eel/agent-sdk` with new:

- `AgentType.MY_AGENT`
- Task type constants
- Input/Output interfaces

---

## Testing Guidelines

### Unit Tests

Each agent should have tests covering:

1. **canHandle()** - Verify task type routing
2. **execute()** - Happy path for each task type
3. **Error handling** - Graceful failure cases
4. **Policies** - Domain rules (if applicable)

```bash
# Run agent tests
npm test -- --testPathPattern="agents/"
```

### Integration Tests

Test agent interactions with:

- Database (reservations, audit logs)
- Message queue (task completion events)
- Other agents (cross-agent workflows)

---

## Agent Responsibilities

### OPS Agent (Core)

- WhatsApp message processing
- Order creation & management
- Conversation state machine
- Slot filling & validation
- Delivery coordination

### INVENTORY Agent

- Stock level tracking (by variant)
- Reservation system (TTL-based)
- Stock deduction (idempotent)
- Low-stock alerts
- **Premium**: Substitution suggestions, restock recommendations

### FINANCE Agent

- Invoice generation
- Daily reconciliation
- Revenue reporting
- Payment tracking (future)

### MARKETING Agent

- Broadcast campaigns
- Customer segmentation
- Promotional messaging
- Re-engagement campaigns

### CONTENT Agent

- Product description generation
- Multi-language translation
- SEO optimization
- Catalog enrichment

### SUPPORT Agent

- Ticket creation
- FAQ responses
- Issue escalation
- Complaint resolution

---

## Architecture Principles

### 1. Single Responsibility

Each agent handles ONE domain. Cross-domain logic lives in the orchestrator.

### 2. Subscription Enforcement

ALWAYS check `isAgentEnabledForMerchant()` before executing tasks.

### 3. Deterministic vs AI

- **Deterministic**: Stock math, reservations, deductions
- **AI-Assisted**: Recommendations, text generation, ranking

### 4. Idempotency

All state-changing operations must be idempotent (e.g., deductStock checks for existing deduction first).

### 5. Audit Trail

All inventory/finance operations log to `stock_movements` or equivalent audit tables.

---

## Configuration

```typescript
// Environment variables
OPENAI_API_KEY=sk-...           # LLM for AI-assisted features
DATABASE_URL=postgres://...      # PostgreSQL connection
REDIS_URL=redis://...           # Task queue
```

---

## Monitoring

### Key Metrics

- `agent_task_duration_seconds` - Task execution time
- `agent_task_success_total` - Successful task count
- `agent_task_failure_total` - Failed task count
- `agent_queue_depth` - Pending tasks per agent

### Health Checks

```
GET /health/agents
{
  "ops": "healthy",
  "inventory": "healthy",
  "finance": "healthy",
  "marketing": "healthy",
  "content": "healthy",
  "support": "healthy"
}
```

---

## Version History

| Version | Date    | Changes                                   |
| ------- | ------- | ----------------------------------------- |
| 1.0.0   | 2024-01 | Initial 6-agent architecture              |
| 1.1.0   | 2024-01 | Added inventory reservations with TTL     |
| 1.2.0   | 2024-01 | Added premium AI features (substitutions) |
