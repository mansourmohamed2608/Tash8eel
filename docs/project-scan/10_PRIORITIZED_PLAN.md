# Phase 9 - Prioritized Remediation Plan

## P0 (Critical)

| Priority | Task                                                                                                                 | Effort | Owner      | Dependencies                                | Evidence                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| P0       | Remove committed secrets and rotate OpenAI/Twilio/DB/admin keys.                                                     | M      | DevOps/Sec | Access to secret stores and vendor consoles | `docs/project-scan/03_BACKEND_FINDINGS.md:1-4`, `docs/project-scan/06_DEVOPS_FINDINGS.md:1-4` |
| P0       | Enforce tenant isolation by validating `merchantId` against authenticated merchant in all merchant-scoped endpoints. | M      | Backend    | Update guards/controllers; add tests        | `docs/project-scan/03_BACKEND_FINDINGS.md:1-4`                                                |
| P0       | Add admin guard to `/admin/early-access` endpoint.                                                                   | S      | Backend    | None                                        | `docs/project-scan/03_BACKEND_FINDINGS.md:1-6`                                                |

## P1 (High)

| Priority | Task                                                                        | Effort | Owner            | Dependencies             | Evidence                                        |
| -------- | --------------------------------------------------------------------------- | ------ | ---------------- | ------------------------ | ----------------------------------------------- |
| P1       | Enforce WebSocket authentication (JWT/merchant scoping).                    | M      | Backend/Frontend | JWT guard implementation | `docs/project-scan/03_BACKEND_FINDINGS.md:3-6`  |
| P1       | Require Twilio signature when validation is enabled.                        | S      | Backend          | None                     | `docs/project-scan/03_BACKEND_FINDINGS.md:4-6`  |
| P1       | Add upload limits + CSV validation, remove PII logging in import endpoints. | S      | Backend          | None                     | `docs/project-scan/03_BACKEND_FINDINGS.md:5-7`  |
| P1       | Fix portal `portalApi` duplicate keys and update call sites.                | S      | Frontend         | None                     | `docs/project-scan/04_FRONTEND_FINDINGS.md:1-3` |
| P1       | Stop returning password reset tokens in production.                         | S      | Backend          | Environment gating       | `docs/project-scan/03_BACKEND_FINDINGS.md:6-8`  |

## P2 (Medium)

| Priority | Task                                                                           | Effort | Owner            | Dependencies                   | Evidence                                                                                        |
| -------- | ------------------------------------------------------------------------------ | ------ | ---------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| P2       | Consolidate staff tables and notification preference schema across migrations. | L      | Backend/DB       | Migration plan + data backfill | `docs/project-scan/05_DATABASE_FINDINGS.md:1-6`                                                 |
| P2       | Use pgvector image in local compose or gate `vector` extension.                | S      | DevOps           | None                           | `docs/project-scan/05_DATABASE_FINDINGS.md:1-4`                                                 |
| P2       | Align API paths (Loyalty controller path vs portal routes).                    | S      | Backend/Frontend | None                           | `docs/project-scan/04_FRONTEND_FINDINGS.md:2-4`, `docs/project-scan/03_BACKEND_FINDINGS.md:7-9` |
| P2       | Add portal test harness (Vitest/Jest + RTL).                                   | M      | Frontend         | CI updates                     | `docs/project-scan/04_FRONTEND_FINDINGS.md:4-5`                                                 |

## P3 (Low)

| Priority | Task                                                                            | Effort | Owner  | Dependencies      | Evidence                                              |
| -------- | ------------------------------------------------------------------------------- | ------ | ------ | ----------------- | ----------------------------------------------------- |
| P3       | Add repo standards: `.editorconfig`, CODEOWNERS, PR templates, issue templates. | S      | DX     | None              | `docs/project-scan/08_CODE_QUALITY_STANDARDS.md:7-15` |
| P3       | Remove or archive `temp_extract/` and zip artifacts from repo.                  | S      | DX     | Confirm with team | `docs/project-scan/03_BACKEND_FINDINGS.md:8-10`       |
| P3       | Add metrics/tracing (OpenTelemetry exporter).                                   | M      | DevOps | Monitoring stack  | `docs/project-scan/06_DEVOPS_FINDINGS.md:1-4`         |
