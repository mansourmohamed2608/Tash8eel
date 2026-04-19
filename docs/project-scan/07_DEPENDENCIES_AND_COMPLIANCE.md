# Phase 6 - Dependencies, Licensing, Compliance

## Dependency Inventory (Top-Level)

### Root (Workspaces)

- Tooling: TypeScript, Prettier, concurrently. Evidence: `package.json:46-50`.

### API

- NestJS ecosystem, OpenAI SDK, PostgreSQL driver, Redis, JWT, bcrypt. Evidence: `apps/api/package.json:31-66`.

### Worker

- NestJS ecosystem, Redis, PostgreSQL driver, axios. Evidence: `apps/worker/package.json:21-41`.

### Portal

- Next.js, React, NextAuth, Radix UI, Tailwind. Evidence: `apps/portal/package.json:6-36`.

## Vulnerability / SCA Status

- Manual audit notes exist, but no automated SCA tooling is wired into CI. **Not found in repository**. Evidence: `docs/AUDIT_REPORT.md:77-82`, `package.json:44`, `docs/project-scan/12_SEARCH_LOG.md:169-184`.
- Recommendation: run `npm audit` in CI and/or add an SCA tool (e.g., Snyk, Dependabot). Evidence of audit script exists: `package.json:44`.

## Licensing

- Individual packages declare MIT license in `apps/api/package.json:7` and `apps/worker/package.json:7`.
- **LICENSE file not found** at repo root. **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:13-19`.

## Compliance / Data Handling

- PII present in database schemas (customers, merchant_staff). Evidence: `apps/api/migrations/001_init.sql:136-150`, `apps/api/migrations/008_production_features.sql:51-69`.
- No explicit data retention / deletion policy found. **Not found in repository**. Evidence: `docs/project-scan/12_SEARCH_LOG.md:102-108`.
