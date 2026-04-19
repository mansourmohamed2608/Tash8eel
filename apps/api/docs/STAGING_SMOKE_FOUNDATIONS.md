# Staging Smoke Checklist - Foundations Hardening

This checklist validates the hardened delivery execution, connector runtime, and HQ governance foundations in staging.

## Preconditions

- API is deployed and healthy.
- You have a valid staff JWT token with OWNER or MANAGER role.
- The target merchant has these features enabled:
  - ORDERS
  - WEBHOOKS
  - TEAM
- Optional: a known order reference for timeline checks.

Before smoke execution, verify migration foundations are present:

```bash
npm run verify:foundations:migrations
```

## Read-Only Smoke Checks

1. Delivery partners endpoint responds.
2. Connector runtime taxonomy endpoint responds.
3. Connector runtime health endpoint responds.
4. HQ unit listing endpoint responds.
5. Optional: delivery timeline endpoint responds for a known order.

Run utility:

```bash
STAGING_BASE_URL=https://api-staging.example.com \
STAGING_BEARER_TOKEN=<jwt> \
STAGING_ORDER_REF=<order-id-or-order-number> \
node scripts/staging-smoke-foundations.js
```

Expected result:

- All checks pass with HTTP 200.
- Script exits with code 0.

## Optional Controlled Write Checks

Use only when the team agrees that a smoke marker event may be written.

```bash
STAGING_BASE_URL=https://api-staging.example.com \
STAGING_BEARER_TOKEN=<jwt> \
STAGING_ORDER_REF=<order-id-or-order-number> \
STAGING_RUN_WRITE_CHECKS=true \
node scripts/staging-smoke-foundations.js
```

Expected result:

- `delivery-event-write` returns HTTP 201.
- Timeline shows the smoke event shortly after.

## Manual Validation Pointers

- Verify no unauthorized role can call write endpoints (expect 403).
- Verify invalid DTO payloads are rejected (expect 400 with validation details).
- Verify connector runtime failures route to DLQ and are visible in runtime DLQ listing.
- Verify HQ effective policy output reflects parent-child inheritance order.

## Rollback Notes

- Smoke checks are read-only by default.
- If write checks were enabled, remove smoke markers by deleting test records for the smoke event source (`staging_smoke`) in:
  - `delivery_execution_events`
