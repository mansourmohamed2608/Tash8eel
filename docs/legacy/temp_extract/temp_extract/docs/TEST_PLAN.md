# Operations Agent - Test Plan

## Overview

This document outlines the testing strategy for the Operations Agent.

## Test Pyramid

```
          /\
         /  \
        /e2e \      <- Few, slow, comprehensive
       /------\
      /  int   \    <- Integration tests
     /----------\
    /    unit    \  <- Many, fast, focused
   /--------------\
```

## Unit Tests

### Location

`test/unit/`

### What to Test

- **Policies**: Negotiation, slot-filling, address validation
- **Utilities**: Masking, formatting, validation helpers
- **Schemas**: Zod validation
- **Pure functions**: No external dependencies

### Examples

```typescript
// Negotiation policy
describe("ClothesNegotiationPolicy", () => {
  it("should allow 15% max discount", () => {
    const result = policy.evaluateOffer(100, 85, 1);
    expect(result.isAcceptable).toBe(true);
  });
});

// Slot filling
describe("FoodSlotFillingPolicy", () => {
  it("should not require customer name", () => {
    const slots = policy.getRequiredSlots();
    expect(slots).not.toContain("الاسم");
  });
});
```

### Running Unit Tests

```bash
npm run test:unit
# or
npx jest test/unit/
```

## Integration Tests

### Location

`test/integration/`

### What to Test

- **Repositories**: Database operations
- **LLM Service**: With mocked OpenAI
- **Event handling**: Outbox processing
- **Service orchestration**: Complete flows

### Database Setup

Tests use a separate test database:

```bash
# Create test database
createdb operations_agent_test

# Run migrations
DATABASE_URL=postgresql://localhost/operations_agent_test \
  psql -f migrations/init.sql
```

### Mocking OpenAI

```typescript
jest.mock("openai", () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "مرحبا!",
                  action: "greet",
                  confidence: 0.9,
                }),
              },
            },
          ],
          usage: { total_tokens: 100 },
        }),
      },
    },
  })),
}));
```

## E2E Tests

### Location

`test/e2e/`

### What to Test

- **API endpoints**: Full request/response cycle
- **Authentication**: Admin API key validation
- **Error handling**: 4xx, 5xx responses
- **Data flow**: Message → Order creation

### Setup

```typescript
beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  await app.init();
});
```

### Example E2E Test

```typescript
describe("POST /api/v1/inbox/message", () => {
  it("should process greeting and return Arabic response", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/inbox/message")
      .send({
        merchantId: "test-merchant",
        senderId: "customer-1",
        text: "السلام عليكم",
      })
      .expect(200);

    expect(response.body.replyText).toMatch(/أهلا|مرحبا|وعليكم/);
    expect(response.body.action).toBe("greet");
  });
});
```

## Test Coverage

### Target Coverage

- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 85%+
- **Lines**: 80%+

### Collecting Coverage

```bash
npm run test:cov
```

### Coverage Report

```
File                      | % Stmts | % Branch | % Funcs | % Lines |
--------------------------|---------|----------|---------|---------|
policies/negotiation.ts   |   95.2  |   90.1   |  100.0  |   95.0  |
policies/slot-filling.ts  |   92.3  |   88.5   |  100.0  |   92.0  |
services/inbox.service.ts |   85.1  |   78.3   |   90.0  |   84.5  |
```

## Test Data

### Fixtures

Located in `test/fixtures/`:

```typescript
// test/fixtures/merchants.ts
export const testMerchant = {
  id: "test-merchant",
  name: "Test Store",
  category: "clothes",
  // ...
};

// test/fixtures/messages.ts
export const greetingMessages = ["السلام عليكم", "مرحبا", "صباح الخير"];
```

### Database Seeding

```bash
npm run test:seed
# or
DATABASE_URL=...test npx ts-node src/cli/seed.ts
```

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:int

# E2E tests
npm run test:e2e

# With coverage
npm run test:cov

# Watch mode
npm run test:watch

# Specific file
npx jest test/unit/negotiation.policy.spec.ts
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run test:cov
      - uses: codecov/codecov-action@v3
```

## Manual Testing

### Postman Collection

Import `postman/Operations_Agent.postman_collection.json`

### Quick Test Flow

1. Seed demo data: `POST /api/v1/admin/seed`
2. Send greeting: `POST /api/v1/inbox/message`
3. Add items: mention products
4. Provide info: name, phone, address
5. Confirm: say "تمام"
6. Check order: `GET /api/v1/orders`

## Testing Checklist

- [ ] Unit tests for all policies
- [ ] Unit tests for utilities
- [ ] Integration tests for repositories
- [ ] Integration tests for LLM service
- [ ] E2E tests for happy path
- [ ] E2E tests for error cases
- [ ] Load testing (optional)
- [ ] Security testing (optional)
