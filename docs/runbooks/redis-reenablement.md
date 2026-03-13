# Redis Re-enablement Runbook

## Current State

Redis is **disabled** (`REDIS_ENABLED=false`) in the cloud deployment. Without Redis:

- Distributed locks (`Redlock`) fall back to **in-process `Map`-based locks** — safe only for
  single-replica deployments. A second replica would allow duplicate outbox processing, duplicate
  follow-up sends, and race conditions in orchestrator jobs.
- Response caching is unavailable.
- Rate-limit state is not shared across replicas.

## Recommended Solution: Upstash Redis (Serverless)

[Upstash](https://upstash.com) is a serverless Redis provider compatible with the Neon + Docker
deployment model. It uses a `rediss://` (TLS) connection string that ioredis handles natively.

**No code changes are required** — the `REDIS_URL` env var is now supported in both the API and
Worker services (added in Sprint 2).

### Step 1 — Create an Upstash Database

1. Sign in at <https://console.upstash.com>
2. Create a **Redis** database → choose the region closest to your Neon database
   (e.g. `eu-west-1` for EU deployments)
3. Copy the **Redis URL** from the dashboard (format: `rediss://default:<token>@<endpoint>.upstash.io:6379`)

### Step 2 — Set Environment Variables

**Staging:**
```dotenv
REDIS_URL=rediss://default:<token>@<endpoint>.upstash.io:6379
REDIS_ENABLED=true
```

**Production:**
```dotenv
REDIS_URL=rediss://default:<token>@<endpoint>.upstash.io:6379
REDIS_ENABLED=true
```

Add these to your staging / production server `.env` files or via your secrets manager
(GitHub Actions Secrets if using the CD pipeline).

> Do NOT set `REDIS_HOST`, `REDIS_PORT`, or `REDIS_PASSWORD` when using `REDIS_URL` — the URL
> takes precedence.

### Step 3 — Verify Connection

After deploying with Redis enabled, check the API logs:

```
Redis connected successfully
```

If you see `Redis connection failed, using fallback locking` instead, verify:
- The `REDIS_URL` value is correct (copy from Upstash console, not from memory)
- The `REDIS_ENABLED=true` flag is set
- Outbound TCP to port 6379 is not blocked by the server firewall

### Step 4 — Smoke Test Distributed Locking

Run the outbox processor under load with two API replicas and verify:

```bash
# In one shell — tail logs for duplicate-processing warnings
docker compose exec api sh -c "grep -i 'already processing' /var/log/app.log"
```

There should be zero duplicate-processing warnings when Redis locking is active.

---

## Alternative: PostgreSQL Advisory Locks

If running on a single server and prefer not to manage another external service, PostgreSQL
advisory locks provide distributed locking **without Redis**:

```sql
-- Acquire lock (returns false if already held, non-blocking)
SELECT pg_try_advisory_lock(hashtext('outbox-processor'));

-- Release lock
SELECT pg_advisory_unlock(hashtext('outbox-processor'));
```

This approach is suitable only while running a **single API + single Worker** replica. It becomes
a contention bottleneck at high throughput.

To implement:
1. Replace `redisService.acquireLock()` calls in the outbox/orchestrator with a
   `DatabaseLockService` that wraps `pg_try_advisory_lock`.
2. Keep `REDIS_ENABLED=false` and the existing in-memory fallback as a safety net.

---

## Multi-Replica Warning

If you ever scale to **2+ API replicas** or **2+ Worker replicas** without distributed locking:

| Risk | Impact |
|------|--------|
| Outbox duplicate sends | Customers receive duplicate WhatsApp/SMS messages |
| Orchestrator double-run | AI agents bill twice for the same conversation turn |
| Follow-up race conditions | Follow-up message sent 2× |

**Enable Redis before scaling beyond one replica per service.**
