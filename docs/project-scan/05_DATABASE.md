# Phase 4 - Database & Data Layer Scan

## Database Type & Location

- **PostgreSQL** (primary datastore). Evidence: `docker-compose.yml:3-15`, `apps/api/migrations/001_init.sql:1-8`.
- **Schema/Migrations** are SQL files under apps/api/migrations/. Evidence: `apps/api/migrations/001_init.sql:1-60`, `apps/api/migrations/004_inventory_agent.sql:1-20`.
- **Seeds**: apps/api/migrations/seed_inventory.sql, seed_data.sql, and apps/api/src/cli/seed.ts. Evidence: `apps/api/migrations/seed_inventory.sql:1-30`, `seed_data.sql:1-18`, `apps/api/src/cli/seed.ts:1-120`.

## Main Entities & Relationships (Representative)

- **merchants** as tenant root. Evidence: `apps/api/migrations/001_init.sql:39-52`.
- **merchant_api_keys** for hashed API keys. Evidence: `apps/api/migrations/001_init.sql:54-68`.
- **customers**, **conversations**, **messages** referencing merchant_id. Evidence: `apps/api/migrations/001_init.sql:136-209`.
- **orders** and **shipments** reference merchant_id + conversation/customer. Evidence: `apps/api/migrations/001_init.sql:211-263`.
- **outbox_events** and **dlq_events** for event-driven processing. Evidence: `apps/api/migrations/001_init.sql:264-309`.
- **inventory tables** (inventory_items, inventory_variants, stock_reservations). Evidence: `apps/api/migrations/004_inventory_agent.sql:1-90`.
- **staff / auth tables** (merchant_staff, staff_sessions). Evidence: `apps/api/migrations/008_production_features.sql:51-92`.

## Indexing & Query Patterns

- Core tables indexed on merchant_id, sender_id, and text search. Evidence: `apps/api/migrations/001_init.sql:100-200`.
- catalog_items uses GIN trigram indexes for name search and tags. Evidence: `apps/api/migrations/001_init.sql:96-110`.
- merchant_api_keys indexes on key_hash and merchant_id. Evidence: `apps/api/migrations/001_init.sql:66-68`.

## Transactions & Consistency

- Worker outbox poller uses explicit transactions with BEGIN/COMMIT and FOR UPDATE SKIP LOCKED. Evidence: `apps/worker/src/outbox/outbox-poller.service.ts:34-120`.
- Some API operations use multiple queries without explicit transactions (e.g., dashboard stats). Evidence: `apps/api/src/api/controllers/merchant-portal.controller.ts:76-140`.

## Migration Strategy

- SQL migrations are executed by a custom CLI runner and tracked in a migrations table. Evidence: `apps/api/src/cli/run-migrations.ts:40-120`.
- TypeORM data-source exists but is only referenced by CLI scripts. Evidence: `apps/api/src/infrastructure/database/data-source.ts:1-14`, `apps/api/package.json:21-24`.

## Data Retention / PII Handling

- PII stored in customers (phone, name, address). Evidence: `apps/api/migrations/001_init.sql:136-150`.
- Staff emails and passwords stored in merchant_staff. Evidence: `apps/api/migrations/008_production_features.sql:51-69`.
- Only explicit retention logic found is agent-task cleanup; no documented retention policy for customer/PII data. **Not found in repository**. Evidence: `apps/worker/src/orchestrator/orchestrator.service.ts:1005-1026`, `docs/project-scan/12_SEARCH_LOG.md:102-108`.

## Backups / Restore

- Backups are listed as a production checklist item, but no backup/restore scripts are present. **Not found in repository**. Evidence: `docs/COMPLETE_DOCUMENTATION.md:1010-1025`, `docs/project-scan/12_SEARCH_LOG.md:110-116`.
