# 🚀 Release Checklist - Tash8eel Operations Platform

## Pre-Release Gate Checks

All of these MUST pass with **exit code 0** before any release.

### Automated Checks (Run `npm run go:check`)

| Check               | Command                            | Required Exit Code |
| ------------------- | ---------------------------------- | ------------------ |
| API Build           | `npm run build -w apps/api`        | 0                  |
| Worker Build        | `npm run build -w apps/worker`     | 0                  |
| Shared Build        | `npm run build -w packages/shared` | 0                  |
| Unit Tests          | `npm run test:unit`                | 0                  |
| E2E Tests (Real DB) | `npm run test:e2e:ci`              | 0                  |
| Security Audit      | `npm audit --audit-level=high`     | 0                  |
| Lint                | `npm run lint`                     | 0                  |

### Manual Verification

- [ ] All env variables documented in `.env.example`
- [ ] Database migrations are idempotent (can run multiple times)
- [ ] No hardcoded secrets in codebase
- [ ] Docker images build successfully
- [ ] Health endpoints respond: `/health`, `/ready`

---

## Architecture Verification

### LLM Centralization ✓

- [ ] Worker does **NOT** import `openai` SDK directly
  ```bash
  # Verify: Should return no results
  grep -r "from 'openai'" apps/worker/src/
  grep -r "import OpenAI" apps/worker/src/
  ```
- [ ] All AI calls go through `apps/api` internal endpoints
- [ ] Token budget tracked in single table: `merchant_token_usage`

### Single Source of Truth

| Component      | Location                              | Verified |
| -------------- | ------------------------------------- | -------- |
| Token Budget   | `apps/api/merchant_token_usage` table | ☐        |
| AI Features    | `apps/api/src/application/llm/`       | ☐        |
| Business Logic | `apps/api/src/domain/`                | ☐        |
| Event Schemas  | `packages/shared/src/`                | ☐        |

---

## Test Coverage Requirements

### Unit Tests

- Policy tests: `address-validation`, `negotiation`, `slot-filling`
- Service tests: Core business logic

### E2E Tests (Real Database)

- Order flow tests with actual PostgreSQL
- Inbox API tests
- Uses `docker-compose.test.yml` containers:
  - `postgres-test` (port 5433)
  - `redis-test` (port 6380)

---

## Deployment Checklist

### Environment Variables Required

```env
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Security
JWT_SECRET=<min 32 chars>
INTERNAL_API_KEY=<for service-to-service auth>

# External Services
OPENAI_API_KEY=<for AI features>
WHATSAPP_API_URL=<360dialog or similar>
WHATSAPP_API_KEY=<API key>

# Monitoring (optional but recommended)
SENTRY_DSN=<error tracking>
```

### Infrastructure

- [ ] PostgreSQL 15+ running with migrations applied
- [ ] Redis 7+ running for caching/sessions
- [ ] Load balancer configured for `/health` checks
- [ ] TLS certificates valid

---

## GO/NO-GO Decision

### ✅ GO Criteria (ALL must be true)

1. `npm run go:check` exits with code 0
2. No critical/high vulnerabilities in `npm audit`
3. E2E tests pass against real database
4. All environment variables configured
5. Health endpoints respond 200 OK
6. No timer leaks in worker (verified by tests)

### ❌ NO-GO Conditions (ANY blocks release)

1. Any build fails (exit code ≠ 0)
2. E2E tests skip due to missing DB
3. Critical security vulnerabilities
4. Untracked environment variables
5. Worker imports OpenAI SDK directly

---

## Post-Deployment Verification

```bash
# 1. Check API health
curl https://api.example.com/health

# 2. Check Worker health
curl https://worker.example.com/health

# 3. Test end-to-end flow
# (Use Postman collection in /postman/)

# 4. Monitor logs for errors
# (Check Sentry/CloudWatch/etc.)
```

---

## Rollback Procedure

1. Revert to previous Docker image tag
2. Run database DOWN migrations if needed:
   ```bash
   npm run db:migrate:down -w apps/api
   ```
3. Verify health endpoints
4. Notify team via incident channel

---

## Sign-Off

| Role      | Name | Date | Signature |
| --------- | ---- | ---- | --------- |
| Developer |      |      |           |
| Tech Lead |      |      |           |
| QA        |      |      |           |

---

_Last Updated: Auto-generated - Run `npm run go:check` for current status_
